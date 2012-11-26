def ast     = platform.ast
def sys     = platform.sys
def unicode = platform.unicode
def util    = platform.util
def utils   = platform.utils

// The name for this is prone to change, so it makes sense to centralize it.
def unitValue = "prelude.done()"

// Native operations.
def nativeOps =
    ["method", "call", "object", "type", "varargs", "match", "pattern"]

// Compiles the given nodes into a module with the given name.
method compile(nodes : List, outFile, moduleName : String, runMode : String,
               buildType : String, libPath : String | Boolean) is public {
    util.log_verbose("generating ECMAScript code.")

    def compiler = javascriptCompiler.new(outFile)
    def split = utils.splitList(nodes) with { node -> node.kind == "import" }

    moduleName := moduleName.replace("/") with(".")

    var imports := utils.map(split.wasTrue) with { node -> node.value }

    compiler.compileModule(moduleName, imports, split.wasFalse, libPath)

    outFile.close

    util.log_verbose("done.")
}

class javascriptCompiler.new(outFile) {

    // Compiles the given module into a function that will return the module
    // object when called. It will execute the body of the module the first time
    // it is called, but will simply return the value on any subsequent calls.
    method compileModule(name : String, imports : List, body : List,
            libPath : String | Boolean) is public {

        def nativePrelude = util.extensions.contains("NativePrelude")

        // Modules get placed into a global object called grace. This code will
        // create the object if it does not exist, then add the module to it.
        wrapLine("(function() \{", {

            line("var grace, doImport, instance, prelude, nothing")

            wrapln("function makeModule(done) \{", {

                write("{indent}var ")
                for(nativeOps) do { op ->
                    write("${op} = grace.{op}, ")
                }

                wrap("$src = [", {
                    for(util.cLines) do { srcLine ->
                        write("{indent}\"")
                        for(srcLine) do { char ->
                            write(if(char.ord > 127) then {
                                "\\u{char.ord}"
                            } else {
                                char
                            })
                        }
                        //write("{indent}\"{srcLine}\"")
                    } separatedBy("\",\n")
                    write("\"\n")
                }, "];\n")

                // The imports need to be inside this function to allow the
                // outer closure to run correctly.
                for(imports) do { module ->
                    line("var {module} = doImport(\"{module}\")")
                }

                line("var self = prelude, outer")

                // The module is compiled as a standard object.
                statement("return ", {
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
                line("grace = this.grace")
                if(nativePrelude) then {
                    line("var _prelude = prelude = grace.prelude")
                } else {
                    line("prelude = grace.modules.StandardPrelude()")
                }
                line("grace.modules[\"{name}\"] = getInstance")
                wrapLine("doImport = function(name) \{", {
                    line("return grace.modules[name]()")
                }, "}")
            }, "\} else \{", {
                if(libPath == false) then {
                    libPath := "."
                }
                line("grace = require(\"{libPath}/gracelib\")")
                if(nativePrelude) then {
                    line("var _prelude = prelude = grace.prelude")
                } else {
                    line("prelude = require(\"{libPath}/StandardPrelude\")")
                }
                wrapLine("doImport = function(name) \{", {
                    line("return require('./' + name)")
                }, "}")
                wrapln("try \{", {
                    line("module.exports = getInstance()")
                }, "\} catch(e) \{", {
                    line("console.error(e.asString())")
                }, "\}")
            }, "\}")

        }, "\})()")

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
        } case { "inherits" ->
            // This is handled in object creation.
        } case { "type" ->
            compileType(node)
        } case { "class" ->
            compileClass(node)
        } else {
            line { compileExpression(node) }
        }
    }

    // Compiles a class into its object representation.
    method compileClass(node) {
        // TODO Use proper values instead of empty strings.
        def body = [ast.objectNode.new(node.value, node.superclass)]
        def constructor = ast.methodNode.new(node.constructor, node.signature,
            body, "")
        def defDec = ast.defDecNode.new(node.name,
            ast.objectNode.new([constructor], ""), "")

        // TODO This should really be pulled off of the class.
        defDec.annotations.push(ast.identifierNode.new("readable", ""))

        compileDef(defDec)
    }

    // Compiles a type into a runtime object.
    method compileType(node) {
        def name = node.value
        def escaped = escapeIdentifier(name)

        write(indent ++ "var {escaped} = $type(")
        for(node.methods) do { meth ->
            write("\"{meth.value}\"")
        } separatedBy(", ")
        write(");\n")

        // TODO Type nodes don't have annotations.
        compileGetter(name, escaped, "public", "type")
    }

    // Compiles a method by attaching a function definition to the current
    // context object. This is safe because of the strictness of where methods
    // can be defined (that is, not directly in a block or other method).
    method compileMethod(node) {
        def name = node.value.value
        def sig = node.signature
        def access = getAccess(node)

        write(indent)
        write("$method(self, \"{name}\", function(")

        for(utils.fold(sig, []) with { params, part ->
            if(part.vararg != false) then {
                utils.concat(params, part.params, [part.vararg])
            } else {
                utils.concat(params, part.params)
            }
        }) do { param ->
            compileExpression(param)
        } separatedBy(", ")

        wrap(") \{", {
            line("var $return = this")
            compileBodyWithReturn(node.body, false)
        }, "\}, \"{access}\"")

        //for(node.annotations) do { annotation ->
            //compileExpression(annotation)
        //} separatedBy(", ")

        for(sig) do { part ->
            write(", ")

            def vararg = part.vararg
            write(if(vararg != false) then { "$varargs(" } else { "[" })

            for(part.params) do { param ->
                write("prelude.Dynamic()")
                //compileExpression(param.dtype)
            } separatedBy(", ")

            write(if(vararg != false) then {
                if(part.params.size > 0) then {
                    write(", ")
                }
                "prelude.Dynamic())"
            } else {
                "]"
            })
        }

        write(");\n")
    }

    // Compiles a Grace def node into a const declaration.
    method compileDef(node) {
        def name = node.name.value
        def escaped = escapeIdentifier(name)
        def access = getAccess(node)

        statement("var {escaped} = ", {
            compileExpression(node.value)
        })

        if(utils.for(node.annotations) some { annotation ->
            annotation.value == "readable"
        }) then {
            compileGetter(name, escaped, access, "def")
        }
    }

    // Compiles a Grace var node into a var declaration.
    method compileVar(node) {
        def name = node.name.value
        def escaped = escapeIdentifier(name)
        def access = getAccess(node)

        statement("var {escaped}", {
            if(node.value != false) then {
                write(" = ")
                compileExpression(node.value)
            }
        })

        if(utils.for(node.annotations) some { annotation ->
            annotation.value == "readable"
        }) then {
            compileGetter(name, escaped, access, "var")
        }

        if(utils.for(node.annotations) some { annotation ->
            annotation.value == "writable"
        }) then {
            wrapLine("$method(self, \"{name}:=\", function(value) \{", {
                line("{escaped} = value")
            }, "\}, \"{access}\", \"var\", [prelude.Dynamic()])")
        }
    }

    method compileGetter(name : String, escaped : String, access : String,
            kind : String) {
        wrapLine("$method(self, \"{name}\", function() \{", {
            line("return {escaped}")
        }, "}, \"{access}\", \"{kind}\")")
    }

    // Compiles a Grace return node into a jumping return call.
    method compileReturn(node) {
        write("$return(")
        compileExpression(node.value)
        write(")")
    }

    // Compiles an if statement (with no else block).
    method compileIf(node) {
        wrap({
            write("$call(prelude, \"if()then\", self, {node.line})(")
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
            write("$call(prelude, \"if()then()else\", self, {node.line})(")
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
        } case { "catchcase" ->
            compileCatchCase(node)
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
            print("Unrecognised expression `{node.kind}' on line {node.line}")
            sys.exit(1)
        }
    }

    def preludes = ["Boolean", "Number", "String"]

    method compileIdentifier(node) {
        def value = node.value
        if(value == "super") then {
            write("$super")
        } elseif(preludes.contains(value)) then {
            compileMember(ast.memberNode.new(value,
                ast.identifierNode.new("prelude", false)))
        } else {
            write(escapeIdentifier(node.value))
        }
    }

    method compileNumber(node) {
        write(node.value)
    }

    method compileString(node) {
        def str = node.value.replace("\\") with("\\\\")
            .replace("\"") with("\\\"").replace("\n") with("\\n")
        write("\"{str}\"")
    }

    // Compiles a Grace object into a closure that evaluates to an object.
    method compileObject(node) {
        def body = node.value
        def isInheriting = (body.size > 0) && {
            body.first.kind == "inherits"
        }

        wrap("$object(self, outer, function(self, outer, $super) \{", {
            compileExecution(body)
        }, {
            write("\}")
            if(isInheriting) then {
                write(", ")
                compileExpression(body.first.value)
            }
            write(")")
        })
    }

    // Compiles a block into an anonymous function.
    method compileBlock(node) {
        def pattern = node.matchingPattern

        if(pattern != false) then {
            write("$pattern(")
        }

        write("function(")

        for(node.params) do { param ->
            compileExpression(param)
        } separatedBy(", ")

        wrap(") \{", {
            compileBodyWithReturn(node.body, true)
        }, "\}")

        if(pattern != false) then {
            write(", ")
            compileExpression(pattern)
            write(")")
        }
    }

    // Compiles a Grace bind into an assignment.
    method compileBind(node) {
        if(node.dest.kind == "member") then {
            def bind = node.dest.value ++ ":="
            node.dest.value := bind
            compileCall(ast.callNode.new(node.dest, [object {
                def name is readable, public = bind
                def args is readable, public = [node.value]
            }]))
        } else {
            compileExpression(node.dest)
            write(" = ")
            compileExpression(node.value)
        }
    }

    // Compiles a Grace member access into a method call.
    method compileMember(node) {
        if((node.value == "outer") && {
            def in = node.in
            (in.kind == "identifier") && { in.value == "self"}
        }) then {
            write("outer")
        } else {
            compileCall(ast.callNode.new(node, []))
        }
    }

    // Compiles a Grace method call into a function or method call.
    method compileCall(node) {
        def name = node.value.value

        write("$call(")
        compileExpression(node.value.in)
        write(", \"{name}\", self, {node.line})(")

        for(node.with) do { part ->
            if(name == "[]") then {
                compileExpression(part)
            } else {
                for(part.args) do { arg ->
                    compileExpression(arg)
                } separatedBy(", ")
            }
        } separatedBy(")(")

        write(")")
    }

    // Compiles a Grace indexing operation into a method call.
    method compileIndex(node) {
        compileCall(ast.callNode.new(ast.memberNode.new("[]", node.value),
                [node.index]))
    }

    method compileArray(node) {
        write("[")
        for(node.value) do { value ->
            compileExpression(value)
        } separatedBy(", ")
        write("]")
    }

    method compileMatch(node) {
        def hasElse = node.elsecase != false
        def name = "match()case" ++ utils.stringIf(hasElse) then { "()else" }

        write("$call(prelude, \"{name}\", self, {node.line})(")
        compileExpression(node.value)
        write(")(")

        for(node.cases) do { case ->
            compileExpression(case)
        } separatedBy(", ")

        write(")")

        if(hasElse) then {
            write("(")
            compileExpression(node.elsecase)
            write(")")
        }
    }

    // Compiles a catch-case statement.
    method compileCatchCase(node) {
        def hasFin = node.finally != false
        def name = "catch()case" ++ utils.stringIf(hasFin) then { "()finally" }
        write("$call(prelude, \"{name}\", self, {node.line})(")
        compileExpression(node.value)
        write(")(")

        for(node.cases) do { case ->
            compileExpression(case)
        } separatedBy(", ")

        write(")")

        if(hasFin) then {
            write("(")
            compileExpression(node.finally)
            write(")")
        }
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

method getAccess(node) -> String {
    def accesses = utils.filter(node.annotations) with { annotation ->
        def value = annotation.value
        (value == "public") || (value == "confidential") ||
            (value == "private")
    }

    if(accesses.size > 1) then {
        def name = if(node.kind == "method") then {
            node.value
        } else {
            node.name
        }

        util.linenumv := node.line
        util.lineposv := accesses.at(2).linePos
        util.syntax_error("Bad number of access annotations on {name}")
    }

    if(accesses.size > 0) then {
        accesses.first.value
    } elseif(util.extensions.contains("DefaultVisibility")) then {
        "public"
    } else {
        "confidential"
    }
}

// A reified instance of the Block type.
type Applicable = {
    apply
}

