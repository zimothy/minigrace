// An option parser.
type Parser is public = {
    parseArguments -> Options
}

// The resulting parsed objects.
type Arguments is public = {
    arguments -> List<Parameter>
    filePath -> Maybe<String>
}

method newArguments(arguments' : List<Parameter>,
        filePath' : Maybe<String>) -> Arguments is private {
    object {
        def arguments : List<Parameter> is readable, public = arguments'
        def filePath' : Maybe<String> is readable, public = filePath'
    }
}

// An argument with a name.
type Argument is public = {
    name -> String
}

// An argument with a name and a value (subtype of Argument).
type ValueArgument is public = {
    name -> String
    value -> String
}


// Given a list of options, produces an option parser.
class parser.new(options : List<Option>) -> Parser is public {

    // Parses the given parameters against this OptionParser's options.
    method parseArguments(arguments : List<String>) -> Arguments is public {
        def arguments = []
        var filePath : Maybe<String> := nothing

        var i := 1
        while { i < arguments.size } do {
            def argument = arguments.at(i)

            if(argument.at(1) == "-") then {
                if(argument.size == 1 || {
                    (argument.size == 2) && (argument.at(2) == "-")
                }) then {
                    ParserException.raise("No argument name: {argument}")
                }
                def shortHand = argument.at(2) != "-"

                for(options) doWithBreak { option, break ->
                    if(option.match(argument)) then {
                        def name = option.name
                        arguments.push(if(EnumParameter.match(option)) then {
                            // If an argument is in short-hand and takes a
                            // parameter, then it must appear last in the
                            // short-hand list.
                            if(shortHand && {
                                argument.last != option.shortHand
                            }) then {
                                ParserException.raise(
                                    "No parameter for argument {name}")
                            }

                            def next = parameters.at(i + 1)
                            i := i + 1

                            if(next.at(1) == "-") then {
                                ParserException.raise(
                                    "No parameter for argument {name}")
                            }

                            newResult(name) argument(next)
                        } else {
                            newResult(name)
                        })

                        if(shortHand.not) then {
                            break.apply
                        }
                    }
                }
            } else {
                match(filePath)
                  case { existing : String ->
                    OptionParserException.raise(
                        "Too many file paths: {existing} and {argument}")
                } else {
                    filePath := argument
                }
            }

            i := i + 1
        }

        newArguments(arguments, filePath)
    }

}

// Simple exception refinement.
def ParserException is public = Exception.refine("ParserException")


// Option type, without parameters.
type Option is public = {
    name -> String
    description -> String
    shortHand -> Maybe<String>
}

// An option with a parameter.
type Parameter is public = Option & {
    values -> Maybe<List<String>>
}

// Factory for generating different option kinds.
def options is public = object {

    // Creates a new singular flag.
    method newFlag(name : String)
           description(description : String) -> Option is public {
        newOption(name)
            shortHand(nothing)
            description(description)
    }

    // Creates a new singular flag with a short hand.
    method newFlag(name : String)
           shortHand(shortHand : String)
           description(description : String) -> Option is public {
        newOption(name)
            shortHand(shortHand)
            description(description)
    }

    method newParameter(name : String)
           description(description : String) -> Parameter is public {
        newOption(name)
            shortHand(nothing)
            values(nothing)
            description(description)
    }

    method newParameter(name : String)
           shortHand(shortHand : String)
           description(description : String) -> Parameter is public {
        newOption(name)
            shortHand(shortHand)
            values(nothing)
            description(description)
    }

    // Creates a new option that takes an parameter.
    method newParameter(name : String)
           values(values : List<String>)
           description(description : String) -> Parameter is public {
        newOption(name)
            shortHand(nothing)
            values(values)
            description(description)
    }

    // Creates a new option with a short hand that takes an parameter.
    method newParameter(name : String)
           shortHand(shortHand : String)
           values(values : List<String>)
           description(description : String) -> Parameter is public {
        newOption(name)
            shortHand(shortHand)
            values(values)
            description(description)
    }

    // Private helper for the above four methods.
    method newOption(name' : String)
           shortHand(shortHand' : Option)
           description(description' : String) -> Option is private {
        object {
            def name : String is readable, public = name'
            def description : String is readable, public = description'
            def shortHand : Maybe<String> is readable, public = shortHand'

            method match(argument : String) is public {
                if(((argument.at(2) == "-") && {
                    argument.substringFrom(3) == name
                }) || argument.substringFrom(2).contains(shortHand)) then {
                    SuccessfulMatch.new(name, [])
                } else {
                    FailedMatch.new(name)
                }
            }
        }
    }

    method newOption(name : String)
           shortHand(shortHand : Option)
           values(values' : List<String>)
           description(description : String) -> Parameter is private {
        object {
            inherits newOption(name) shortHand(shortHand)
                description(description)

            def values : Maybe<List<String>> is readable, public = values'
        }
    }

}

