method exit(code : Number) is public {
    Exception.refine("SystemExit").raise(code.asString)
}

def argv : List is readable, public = []

