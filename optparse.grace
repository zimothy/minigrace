// An option parser.
type OptionParser is public = {
    parseArgs -> Options
}

// The resulting parsed objects.
type Options is public = {}

def test = AndPattern


// Given a list of options, produces an option parser.
class optionParser.new(options : List<String>) -> OptionParser is public {

    // Parses the given arguments against this OptionParser's options.
    method parseOptions(arguments : List<String>) -> Options is public {

    }

}

// Option type, supporting all possible options kinds.
type Option is local = {
    name -> String
    description -> String
    shortHand -> Maybe<String>
    takesArgument -> Boolean
}

// Factory for generating different option kinds.
def option is public = object {

    // Creates a new singular flag.
    method newFlag(name : String)
           description(description : String) -> Option is public {
        newOption(name)
            shortHand(nothing)
            description(description)
            takesArgument(false)
    }

    // Creates a new singular flag with a short hand.
    method newFlag(name : String)
           shortHand(shortHand : String)
           description(description : String) -> Option is public {
        newOption(name)
            shortHand(shortHand)
            description(description)
            takesArgument(false)
    }

    // Creates a new option that takes an argument.
    method newArgument(name : String)
           description(description : String) -> Option is public {
        newOption(name)
            shortHand(nothing)
            description(description)
            takesArgument(true)
    }

    // Creates a new option with a short hand that takes an argument.
    method newArgument(name : String)
           shortHand(shortHand : String)
           description(description : String) -> Option is public {
        newOption(name)
            shortHand(shortHand)
            description(description)
            takesArgument(true)
    }

    // Private helper for the above four methods.
    method newOption(name' : String)
           shortHand(shortHand' : Option)
           description(description' : String)
           takesArgument(argument : Boolean) -> Option is private {
        object {
            def name : String is readable, public = name'
            def description : String is readable, public = description'
            def shortHand : Maybe<String> is readable, public = shortHand'
            def takesArgument : Boolean is readable, public = argument
        }
    }

}

