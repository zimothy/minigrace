import "argparse" as argparse
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

def options = optparse.options
def optionParser : Parser = parser.new
    [ option.newFlag("help") shortHand("h")
        description("Prints help message")
    , option.newFlag("make") shortHand("m")
        description("Builds dependencies and links")
    , option.newFlag("source") shortHand("s")
        description("Builds only the source output")
    , option.newParameter("target") shortHand("t") values(targets)
        description("Sets the build target")
    ]

optionParser.parseArguments(system.arguments)

