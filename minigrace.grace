import "compiler" as compiler
import "sys"      as sys

def argFlags =
  [ flag("outfile") shortHand("o")
  , flag("verbose") shortHand("v")
  , flag("help")    shortHand("h")
  , flag("vtag")
  , flag("make")    shortHand("m")
  , flag("no-recurse")
  , flag("dynamic-module")
  , flag("import-dynamic")
  , flag("source")  shortHand("s")
  , flag("native")
  , flag("interactive")
  , flag("noexec")
  , flag("yesexec")
  , flag("stdout")
  , flag("module")
  , flag("")
  ]

def args = sys.argv

for(args.indices) do { i ->
    def arg = args.at(i)

    match(arg)
        case { (flag("outfile") shortHand("o"))) ->

      } case { (flag("verbose") shortHand("v")) ->

      }
}

compiler.compile

