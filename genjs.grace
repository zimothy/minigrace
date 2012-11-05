def ast     = platform.ast
def sys     = platform.sys
def unicode = platform.unicode
def util    = platform.util
def utils   = platform.utils

// The name for this is prone to change, so it makes sense to centralize it.
def unitValue = "done"

// Compiles the given nodes into a module with the given name.
method compile(nodes : List, outFile, moduleName : String, runMode : String,
               buildType : String, libPath : String | Boolean) is public {
    util.log_verbose("generating ECMAScript code.")

    def compiler = javascriptCompiler.new(outFile)
    def split = utils.splitList(nodes) with { node -> node.kind == "import" }

    moduleName := moduleName.replace("/") with(".")

    var imports := utils.map(split.wasTrue) with { node -> node.value }

    compiler.compileModule(moduleName, imports, split.wasFalse)

    outFile.close

    util.log_verbose("done.")
}

class javascriptCompiler.new(outFile) {

    // Compiles the given module into a function that will return the module
    // object when called. It will execute the body of the module the first time
    // it is called, but will simply return the value on any subsequent calls.
    method compileModule(name : String, imports : List, body : List) is public {

        // Modules get placed into a global object called grace. This code will
        // create the object if it does not exist, then add the module to it.
        wrapLine("(function() \{", {

            line("var $, doImport, instance, prelude")

            wrapln("function makeModule(done) \{", {

                wrapLine("var $src = [", {
                    for(util.cLines) do { srcLine ->
                        write("{indent}\"{srcLine}\"")
                    } separatedBy(",\n")
                    write("\n")
                }, "]")

                // The imports need to be inside this function to allow the
                // outer closure to run correctly.
                for(imports) do { module ->
                    line("var {module} = doImport(\"{module}\")")
                }

                line("var outer = prelude")

                // The module is compiled as a standard object.
                statement("return ", {

                    // TODO Search for an inherits node at the top-level.
                    compileObject(ast.objectNode.new(body, false))
                })

            }, "\}")

            // Modules are singletons. This method of importing ensures that
            // only one instance of the module is ever created.
            wrapln("function getInstance() \{", {
                line("return instance ? instance : instance = makeModule()")
            }, "\}")

            // Compatible with both the browser and Node.js.
            wrapln("if (typeof module === 'undefined') \{", {
                line("$ = this.grace")
                line("${safeAccess(name)} = getInstance")
                wrapLine("doImport = function(name) \{", {
                    line("return $[name]()")
                }, "}")
            }, "\} else \{", {
                line("$ = require('./js/gracelib')")
                line("module.exports = getInstance")
                wrapLine("doImport = function(name) \{", {
                    line("return require('./' + name)()")
                }, "}")
            }, "\}")

            line("prelude = $.prelude")

        }, "\})()")

    }

    // The kind of nodes that translate into an object declaration.
    def declarations = ["vardec", "defdec", "class", "type", "method"]

    // Compile a list of declarations into an object body.
    method compileDeclarations(nodes : List) {
        doAll(utils.map(utils.filter(nodes) with { node ->
            declarations.contains(node)
        }) with { node ->
            write(indent)
            compileField(node)
        }) separatedBy(",\n")

        write("\n")
    }

    // Compiles part of an object declaration into a field literal.
    method compileField(node) {
        def name = node.name

        write(jsonField(name) ++ ": " ++ name)
    }

    // Compiles a list of nodes into a body of code.
    method compileExecution(nodes : List) {
        for(nodes) do { node ->
            compileStatement(node)
        }
    }

    // Compiles a statement of execution.
    method compileStatement(node) {
        match(node.kind)
          case { "method" ->
            compileMethod(node)
        } case { "defdec" ->
            compileDef(node)
        } case { "vardec" ->
            compileVar(node)
        } case { "return" ->
            statement("", { compileReturn(node) })
        } case { "bind" ->
            statement("", { compileBind(node) })
        } else {
            line { compileExpression(node) }
        }
    }

    // Compiles a method by attaching a function definition to the current
    // context object. This is safe because of the strictness of where methods
    // can be defined (that is, not directly in a block or other method).
    method compileMethod(node) {
        def name = node.value.value
        def sig  = node.signature

        def access = utils.filter(node.annotations) with { annotation ->
            def value = annotation.value
            (value == "public") || (value == "confidential") ||
                (value == "private")
        }

        if(access.size > 1) then {
            util.linenumv := node.line
            util.lineposv := access.at(2).linePos
            util.syntax_error("Bad number of access annotations on {name}")
        }

        write(indent)
        write("$(self, \"{name}\", function(")

        doAll(utils.map(utils.fold(sig, []) with { params, part ->
            if(part.vararg != false) then {
                utils.concat(params, part.params, [part.vararg])
            } else {
                utils.concat(params, part.params)
            }
        }) with { param -> {
            compileExpression(param)
        }}) separatedBy(", ")

        wrap(") \{", {
            compileBodyWithReturn(node.body, false)
        }, "\}, \"{access}\"")

        //for(node.annotations) do { annotation ->
            //compileExpression(annotation)
        //} separatedBy(", ")

        for(sig) do { part ->
            write(", ")

            def vararg = part.vararg
            write(if(vararg != false) then { "$([" } else { "[" })

            doAll(utils.map(part.params) with { param ->
                { compileExpression(param.dtype) }
            }) separatedBy(", ")

            write(if(vararg != false) then { "])" } else { "]" })
        }

        write(");\n")
    }

    // Compiles a Grace def node into a const declaration.
    method compileDef(node) {
        def name = node.name.value
        def escaped = escapeIdentifier(name)

        statement("var {escaped} = ", {
            compileExpression(node.value)
        })

        if(utils.for(node.annotations) some { annotation ->
            annotation.value == "readable"
        }) then {
            compileGetter(name, escaped, node.value)
        }
    }

    // Compiles a Grace var node into a var declaration.
    method compileVar(node) {
        def name = node.name.value
        def escaped = escapeIdentifier(name)

        statement("var {escaped}", {
            if(node.value != false) then {
                write(" = ")
                compileExpression(node.value)
            }
        })

        if(utils.for(node.annotations) some { annotation ->
            annotation.value == "readable"
        }) then {
            compileGetter(name, escaped, node.value)
        }
        
        if(utils.for(node.annotations) some { annotation ->
            annotation.value == "writable"
        }) then {
            wrapln("self[\"{name}:=\"] = function(value) \{", {
                line("{escaped} = value")
            }, "\}")
        }
    }

    method compileGetter(name : String, escaped : String, value) {
        compileSelfAttach(name, {
            line("return {escaped}")
        })
    }

    method compileSelfAttach(name : String, body) {
        wrapln("self{safeAccess(name)} = function() \{", body, "\}")
    }

    // Compiles a Grace return node into a jumping return call.
    method compileReturn(node) {
        write("this(")
        compileExpression(node.value)
        write(")")
    }

    // Compiles an if statement (with no else block).
    method compileIf(node) {
        wrap({
            write("$(prelude, \"if()then\", self, {node.line})(")
            compileExpression(node.value)
            write(")(function() \{")
        }, {
            compileBodyWithReturn(node.thenblock, true)
        }, {
            write("\})")
        })
    }

    // Compiles an if-else statement.
    method compileIfElse(node) {
        wrap({
            write("$(prelude, \"if()then()else\", self, {node.line})(")
            compileExpression(node.value)
            write(")(function() \{")
        }, {
            compileBodyWithReturn(node.thenblock, true)
        }, {
            write("})(function() \{")
        }, {
            compileBodyWithReturn(node.elseblock, true)
        }, {
            write("})")
        })
    }

    // Compiles a Grace expression without surrounding indentation or line ends.
    method compileExpression(node) {
        match(node.kind)
          case { "identifier" ->
            compileIdentifier(node)
        } case { "num" ->
            compileNumber(node)
        } case { "string" ->
            compileString(node)
        } case { "class" ->
            compileClass(node)
        } case { "object" ->
            compileObject(node)
        } case { "block" ->
            compileBlock(node)
        } case { "bind" ->
            write("(")
            compileBind(node)
            write(", {unitValue})")
        } case { "member" ->
            compileMember(node)
        } case { "call" ->
            compileCall(node)
        } case { "if" ->
            if(node.elseblock.size > 0) then {
                compileIfElse(node)
            } else {
                compileIf(node)
            }
        } case { "index" ->
            compileIndex(node)
        } case { "op" ->
            compileCall(ast.callNode.new(
                    ast.memberNode.new(node.value, node.left), [object {
                def name is public, readable = node.value
                def args is public, readable = [node.right]
            }]))
        } case { "array" ->
            compileArray(node)
        } case { "matchcase" ->
            compileMatch(node)
        } case { "generic" ->
            compileExpression(node.value)
        } case { "return" ->
            compileReturn(node)
        } else {
            print("Unrecognised expression: {node.kind}")
            sys.exit(1)
        }
    }

    method compileIdentifier(node) {
        write(escapeIdentifier(node.value))
    }

    method compileNumber(node) {
        write(node.value)
    }

    method compileString(node) {
        write("\"{node.value}\"")
    }

    method compileClass(node) {

    }

    // Compiles a Grace object into a closure that evaluates to an object.
    method compileObject(node) {
        wrap("$(function(self) \{", {

            // Compile the standard execution first. This will introduce the
            // values into the closure.
            compileExecution(node.value)

        }, "\})")
    }

    // Compiles a block into an anonymous function.
    method compileBlock(node) {
        write("function(")

        doAll(utils.map(node.params) with { param ->
            { compileExpression(param) }
        }) separatedBy(", ")

        def pattern = node.matchingPattern

        if(pattern != false) then {
            print(pattern)
        }

        wrap(") \{", {
            compileBodyWithReturn(node.body, true)
        }, "\}")

        if(pattern != false) then {
            write(", ")
            compileExpression(pattern)
        }
    }

    // Compiles a Grace bind into an assignment.
    method compileBind(node) {
        compileExpression(node.dest)
        write(" = ")
        compileExpression(node.value)
    }

    // Compiles a Grace member access into a method call.
    method compileMember(node) {
        compileCall(ast.callNode.new(node, []))
    }

    // Compiles a Grace method call into a function or method call.
    method compileCall(node) {
        // TODO Escape the name.
        def name = node.value.value

        write("$(")
        compileExpression(node.value.in)
        write(", \"{name}\", self, {node.line})(")

        doAll(utils.map(node.with) with { part ->
            {
                doAll(utils.map(part.args) with { arg ->
                    { compileExpression(arg) }
                }) separatedBy(", ")
            }
        }) separatedBy(")(")

        write(")")
    }

    // Compiles a Grace indexing operation into a method call.
    method compileIndex(node) {
        compileCall(ast.callNode.new(ast.memberNode.new("[]", node.value),
                [node.index]))
    }

    method compileArray(node) {
        write("$.list(")
        doAll(utils.map(node.value) with { value ->
            compileExpression(value)
        }) separatedBy(", ")
        write(")")
    }

    method compileMatch(node) {
        write("$.match(")
        compileExpression(node.value)

        for(node.cases) do { case ->
            write(", ")
            compileExpression(case)
        }

        write(", ")
        if(node.elsecase != false) then {
            compileExpression(node.elsecase)
        } else {
            write("null")
        }

        write(")")
    }

    method compileEagerBlock(body : List) {
        if(body.size == 0) then {
            write(unitValue)
        } elseif((body.size == 1) && (body.first.kind != "return")) then {
            compileExpression(body.first)
        } else {
            wrap("(function() \{", {
                compileBodyWithReturn(body, true)
            }, "\})()")
        }
    }

    method compileBodyWithReturn(body : List, nested : Boolean) {
        def last = body.pop

        compileExecution(body)

        if(nested && { last.kind == "return" }) then {
            compileStatement(last)
        } else {
            statement("return ", {
                compileExpression(if(last.kind == "return") then {
                    last.value
                } else {
                    last
                })
            })
        }
    }


    // Writes the given value directly to the output.
    method write(string : String) {
        outFile.write(string)
    }

    // The current indent level.
    var indent := ""

    // Attaches the current indentation and line end to the given content.
    method line(around) {
        write(indent)
        writeOrApply(around)
        write(";\n")
    }

    // Writes an indent and the first value, then evaluates the second value and
    // writes a semicolon and newline.
    method statement(prefix : String, around) {
        write(indent ++ prefix)
        writeOrApply(around)
        write(";\n")
    }

    // Wraps the body produced by the block in the outer strings.
    method wrap(fst, body, *rest) {
        wrap'(fst, body, rest)
    }

    // The wrap method without varargs.
    method wrap'(fst, body, rest : List) {
        writeOrApply(fst)
        write("\n")

        increaseIndent
        body.apply
        decreaseIndent

        write(indent)

        if(rest.size > 1) then {
            wrap'(rest.at(1), rest.at(2), utils.sublistOf(rest) from(3))
        } elseif(rest.size == 1) then {
            writeOrApply(rest.first)
        }
    }

    // As for wrap, but adds an indent before and a linebreak afterwards.
    method wrapln(fst, body, *rest) {
        write(indent)
        wrap'(fst, body, rest)
        write("\n")
    }

    // As for wrapln, but adds a semicolon as well.
    method wrapLine(fst, body, snd) {
        write(indent)
        wrap(fst, body, snd)
        write(";\n")
    }

    // Writes a list of compilations, separated by the given string.
    method doAll(list : List) separatedBy(by) {
        var once := false

        for(list) do { value ->
            if(once) then {
                writeOrApply(by)
            }

            writeOrApply(value)

            once := true
        }
    }

    // Evaluates the do block for every item in the given collection, separating
    // them with the given block or string.
    method for(iter) do(block) separatedBy(by) {
        var once := false

        for(iter) do { value ->
            if(once) then {
                writeOrApply(by)
            }

            block.apply(value)

            once := true
        }
    }

    // Invokes apply on the given object if it is a block, otherwise it writes
    // it out.
    method writeOrApply(maybe) {
        match(maybe)
          case { block : Applicable ->
            block.apply
        } case { string : String ->
            write(string)
        } case { other ->
            write(other.asString)
        }
    }

    // Increases the indent level of the output.
    method increaseIndent {
        indent := indent ++ "  "
    }

    // Decreases the indent level of the output.
    method decreaseIndent {
        indent := indent.substringFrom(1) to(indent.size - 2)
    }

}

def keywords = [ "with", "break", "new", "public", "private" ]

method escapeIdentifier(identifier : String) -> String {
    if(keywords.contains(identifier)) then {
        return "_{identifier}"
    }

    identifier.replace("'") with("$").replace("()") with("_")
}

method safeAccess(name : String) -> String {
    if(keywords.contains(name) || {
        utils.for(name) all { char ->
            unicode.isLetter(char) || unicode.isNumber(char)
        }.not
    }) then {
        "[\"{name}\"]"
    } else {
        ".{name}"
    }
}

// Escapes a Grace identifier if it contains invalid JSON field name characters.
method jsonField(name : String) -> String {
    for(name) do { char ->
        if(char == "'") then {
            return "\"{name}\""
        }
    }

    name
}

// A reified instance of the Block type.
type Applicable = {
    apply
}

