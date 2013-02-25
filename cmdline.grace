import "argparse" as argparse
import "compiler" as compiler
import "system"   as system

def targets =
    [ "lex"
    , "parse"
    , "grace"
    , "processed-ast"
    , "subtypematrix"
    , "types"
    , "imports"
    , "c"
    , "js"
    ]

def opts = argparse.options
def options =
    [ opts.newFlag("help") shortHand("h")
        description("Prints help message")
    , opts.newFlag("make") shortHand("m")
        description("Builds dependencies and links")
    , opts.newFlag("source") shortHand("s")
        description("Builds only the source output")
    , opts.newParameter("target") shortHand("t") values(targets)
        description("Sets the build target")
    ]

def argumentParser : Parser = argparse.parser.new(options)
def arguments = argumentParser.parseArguments(system.arguments)

var run := false
for(arguments) do { argument ->
    match(argument.name)
      case { "help" -> printHelpMessage }
}

compiler.compile(arguments)

