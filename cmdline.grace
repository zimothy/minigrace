dialect "prelude"

import "arguments" as args
import "compiler"  as compiler
import "system"    as system

def targets = set.new(
      "lex"
    , "parse"
    , "grace"
    , "processed-ast"
    , "subtypematrix"
    , "types"
    , "imports"
    , "c"
    , "js")


def options = do {
    def bob = args.options.newBuilder
    bob.newFlag("help") shortHand("h")
        description("Prints help message")
    bob.newFlag("make") shortHand("m")
        description("Builds dependencies")
    bob.newFlag("source") shortHand("s")
        description("Builds only the source output")
    bob.newParameter("target") shortHand("t") values(targets)
        description("Sets the build target")
    bob.options
}


// Prints the available options.
method printOptions {
    for(options) do { option ->
        var out := option.name

        def shortHand = option.shortHand
        if(shortHand.isValue) then {
            out := "{out} ({shortHand.value})"
        }

        out := "{out}: {option.description}"
        match(option) case { param : args.Parameter ->
            def values = param.values
            if(values.isValue) then {
                out := "{out}\n\t{values.value.join(", ")}"
            }
        }

        print(out)
    }
}

def arguments = args.parser.new(options).parseArguments(system.arguments)

var make := false
var run := false
for(arguments) do { argument ->
    match(argument.name)
        case { "help" -> print }
        case { "make" -> make := true }
        case { "run"  -> run := true }
}

compiler.compile(arguments)

