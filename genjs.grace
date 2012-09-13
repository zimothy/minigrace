import ast
import util
import utils

// The name for this is prone to change, so it makes sense to centralize it.
def unitValue = "noSuchValue"

// Compiles the given nodes into a module with the given name.
method compile(nodes : List, outFile, moduleName : String, runMode : String,
        buildType : String, libPath : String | Boolean) -> Nothing {
    util.log_verbose("generating ECMAScript code.")

    def compiler = compilerFactory.new(outFile)
    def split = utils.split(nodes) with { node -> node.kind == "import" }

    compiler.compileModule(object {
        def name = moduleName
        def imports = split.wasTrue
        def body = split.wasFalse
    })

    outFile.close

    util.log_verbose("done.")
}

class compilerFactory.new(outFile) {

    // Compiles the given module into a function that will return the module
    // object when called. It will execute the body of the module the first time
    // it is called, but will simply return the value on any subsequent calls.
    method compileModule(module) -> Nothing {

        // Modules get placed into a global object called grace. This
        // declaration will create it if it does not exist, then add the module.
        wrapLine("(grace = grace || \{\}).{module.name} = (function($) \{", {

            wrapln("function Module() \{", {

                // The imports need to be inside this function to allow the
                // outer closure to run correctly.
                for(module.imports) do { node ->
                    line("var {node.value} = $.{node.value}()")
                }

                // The module is compiled as a standard object.
                statement("return ", {

                    // TODO Search for an inherits node at the top-level.
                    compileObject(ast.objectNode.new(module.body, false))
                })
            }, "\}")

            // Modules are singletons. This method of importing ensures that
            // only one instance of the module is ever created.
            line("var self")
            wrapLine("return function() \{", {
                line("return self ? self : self = new Module()")
            }, "\}")

        // To avoid conflicts, the modules object gets passed directly.
        }, "\})(grace)")

    }

    // The kind of nodes that translate into an object declaration.
    def declarations = ["vardec", "defdec", "class", "type", "method"]

    // Compile a list of declarations into an object body.
    method compileDeclarations(nodes : List) -> Nothing {
        doAll(utils.map(utils.filter(nodes) with { node ->
            declarations.contains(node)
        }) with { node ->
            write(indent)
            compileField(node)
        }) separatedBy(",\n")

        write("\n")
    }

    // Compiles part of an object declaration into a field literal.
    method compileField(node) -> Nothing {
        def name = node.name

        write(jsonField(name) ++ ": " ++ name)
    }

    // Compiles a list of nodes into a body of code.
    method compileExecution(nodes : List) -> Nothing {
        for(nodes) do { node ->
            compileStatement(node)
        }
    }

    // Compiles a statement of execution.
    method compileStatement(node) -> Nothing {
        match(node.kind)
          case { "method" ->
            compileMethod(node)
        } case { "defdec" ->
            compileDef(node)
        } case { "vardec" ->
            compileVar(node)
        } case { "return" ->
            compileReturn(node)
        } case { "if" ->
            compileIf(node)
        } else {
            line { compileExpression(node) }
        }
    }

    // Compiles a method by attaching a function definition to the current
    // context object. This is safe because of the strictness of where methods
    // can be defined (that is, not directly in a block or other method).
    method compileMethod(node) -> Nothing {
        def name = compileExpression(node.value)
        def params =
            utils.join(utils.fold(node.signature, []) with { list, value ->
                // TODO Varargs.
                utils.concat(list, value.params)
            }) separatedBy(", ")

        wrapln("function {name}({params}) \{", {
            compileExecution(node.body)
        }, "\}")
    }

    // Compiles a Grace def node into a const declaration.
    method compileDef(node) -> Nothing {
        statement("const {node.name} = ", {
            compileExpression(node.value)
        })
    }

    // Compiles a Grace var node into a var declaration.
    method compileVar(node) -> Nothing {
        statement("var {node.name}", {
            if(node.value /= false) then {
                write(" = ")
                compileExpression(node.value)
            }
        })
    }

    // Compiles a Grace return node into a return declaration.
    method compileReturn(node) -> Nothing {
        statement("return ", {
            compileExpression(node.value)
        })
    }

    // Compiles an if statement.
    method compileIf(node) -> Nothing {
        wrapln({
            write("if (")
            compileExpression(node.value)
            write(") \{")
        }, {
            compileExecution(node.thenblock)
        }, {
            write("\}")

            if(node.elseblock /= false) then {
                wrap(" else \{", {
                    compileExecution(node.elseblock)
                }, "\}")
            }
        })
    }

    // Compiles a Grace expression without surrounding indentation or line ends.
    method compileExpression(node) -> Nothing {
        match(node.kind)
          case { "identifier" ->
            compileIdentifier(node)
        } case { "num" ->
            compileNumber(node)
        } case { "string" ->
            compileString(node)
        } case { "object" ->
            compileObject(node)
        } case { "defdec" ->
            compileDefExpr(node)
        } case { "vardec" ->
            compileVarExpr(node)
        } case { "block" ->
            compileBlock(node)
        } case { "bind" ->
            write("(")
            compileBind(node)
            write(")")
        } case { "member" ->
            compileMember(node)
        } case { "call" ->
            compileCall(node)
        } case { "if" ->
            compileTernary(node)
        } case { "index" ->
            compileIndex(node)
        } case { "op" ->
            compileOp(node)
        } case { "array" ->
            compileArray(node)
        } case { "matchcase" ->
            compileMatch(node)
        } case { "generic" ->
            compileExpression(node.value)
        } else {
            raise("Unrecognised expression: {node.kind}")
        }
    }

    method compileIdentifier(node) -> Nothing {
        // TODO Escape primes.
        write(node.value)
    }

    method compileNumber(node) -> Nothing {
        write(node.value)
    }

    method compileString(node) -> Nothing {
        write("\"{node.value}\"")
    }

    // Compiles a Grace object into a closure that evaluates to an object.
    method compileObject(node) -> Nothing {
        wrap("function() \{", {

            // Compile the standard execution first. This will introduce the
            // values into the closure.
            compileExecution(node.value)

            wrapLine("return \{", {
                
                // Build the object declarations into the resulting object.
                compileDeclarations(node.value)

            }, "\}")
        }, "\}()")
    }

    // A def declaration can be an expression. In this case it executes the
    // value being assigned and then evaluates to the unit value.
    method compileDefExpr(node) -> Nothing {
        write("(")
        compileExpression(node.value)
        write(", {unitValue})")
    }

    // A var declaration can be an expression. In this case it executes the
    // value being assigned (if it exists) and then evaluates to the unit value.
    method compileVarExpr(node) -> Nothing {
        if(node.value) then {
            write("(")
            compileExpression(node.value)
            write(", {unitValue})")
        } else {
            write(unitValue)
        }
    }

    // Compiles a block into an anonymous function.
    method compileBlock(node) -> Nothing {
        def params = utils.join(node.params) separatedBy(", ")

        wrap("function({params}) \{", {
            compileExecution(node.body)
        }, "\}")
    }

    // Compiles a Grace bind into an assignment.
    method compileBind(node) -> Nothing {
        compileExpression(node.dest)
        write(" = ")
        compileExpression(node.value)
    }

    // Compiles a Grace member access into a method call.
    method compileMember(node) -> Nothing {
        compileCall(ast.callNode.new(node, []))
    }

    // Compiles a Grace method call into a function or method call.
    method compileCall(node) -> Nothing {
        // TODO Escape the name.
        def name = node.value.value
        def direct = (node.value.kind /= "member") | (name == "print")

        if(direct) then {
            write("{name}(")
        } else {
            compileExpression(node.value.in)
            write(".{name}(")
        }

        doAll(utils.map(utils.fold(node.with, []) with { args, part ->
            utils.concat(args, part.args)
        }) with { argument ->
            compileExpression(argument)
        }) separatedBy(", ")

        write(")")
    }

    // Compiles a Grace if statement into a ternary.
    method compileTernary(node) -> Nothing {
        write("(")
        compileExpression(node.value)
        write(" ? ")
        compileEagerBlock(node.thenblock)
        write(" : ")

        if(node.elseBlock /= false) then {
            compileEagerBlock(node.elseblock)
        } else {
            write(unitValue)
        }

        write(")")
    }

    // Compiles a Grace indexing operation into a method call.
    method compileIndex(node) -> Nothing {
        compileCall(ast.callNode.new(ast.memberNode.new("[]", node.value),
                [node.index]))
    }

    method compileOp(node) -> Nothing {
        compileExpression(node.left)
        write("[\"{node.value}\"](")
        compileExpression(node.right)
        write(")")
    }

    method compileArray(node) -> Nothing {
        write("[")
        doAll(utils.map(node.value) with { value ->
            compileExpression(value)
        }) separatedBy(", ")
        write("[")
    }

    method compileMatch(node) -> Nothing {
        // TODO
    }

    method compileEagerBlock(body : List) -> Nothing {
        if(body.size == 0) then {
            write(unitValue)
        } elseif(body.size == 1) then {
            compileExpression(body.at(1))
        } else {
            wrap("(function() \{", {
                compileExecution(body)
            }, "\})()")
        }
    }


    // Writes the given value directly to the output.
    method write(string : String) -> Nothing {
        outFile.write(string)
    }

    // The current indent level.
    var indent := ""

    // Attaches the current indentation and line end to the given content.
    method line(around) -> Nothing {
        write(indent)
        writeOrApply(around)
        write(";\n")
    }

    // Writes an indent and the first value, then evaluates the second value and
    // writes a semicolon and newline.
    method statement(prefix : String, around) -> Nothing {
        write(indent ++ prefix)
        writeOrApply(around)
        write(";\n")
    }

    // Wraps the body produced by the block in the outer strings.
    method wrap(fst, body : Block, snd) -> Nothing {
        writeOrApply(fst)
        write("\n")

        increaseIndent
        body.apply
        decreaseIndent

        writeOrApply(snd)
    }

    // As for wrap, but adds an indent before and a linebreak afterwards.
    method wrapln(fst, body : Block, snd) -> Nothing {
        write(indent)
        wrap(fst, body, snd)
        write("\n")
    }

    // As for wrapln, but adds a semicolon as well.
    method wrapLine(fst, body : Block, snd) -> Nothing {
        write(indent)
        wrap(fst, body, snd)
        write(";\n")
    }

    // Writes a list of compilations, separated by the given string.
    method doAll(list : List) separatedBy(by : String) -> Nothing {
        var once := false

        for(list) do { value ->
            if(once) then {
                write(by)
            }

            writeOrApply(value)

            once := true
        }
    }

    // Invokes apply on the given object if it is a block, otherwise it writes
    // it out.
    method writeOrApply(maybe) -> Nothing {
        match(maybe)
          case { block : Applicable ->
            block.apply
        } case { string : String ->
            write(string)
        } case { other : Stringable ->
            write(other.asString)
        }
    }

    // Increases the indent level of the output.
    method increaseIndent -> Nothing {
        indent := indent ++ "  "
    }

    // Decreases the indent level of the output.
    method decreaseIndent -> Nothing {
        indent := indent.substringFrom(1) to(indent.size - 2)
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

// Any object which can be transformed into a String.
type Stringable = {
    asString -> String
}
