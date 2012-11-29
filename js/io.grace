method error(message : String) is public {
    Error.refine("IOError").raise(message);
}

def input  is readable, public = nothing
def output is readable, public = nothing

