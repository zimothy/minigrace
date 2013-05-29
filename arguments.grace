dialect "prelude"

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

// An argument with a name and a value.
type ValueArgument is public = Argument & {
    value -> String
}


// Given a list of options, produces an option parser.
class parser.new(options : List<Option>) -> Parser is public {

    // Parses the given parameters against this OptionParser's options.
    method parseArguments(arguments : List<String>) -> Arguments is public {
        def arguments = list.new
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


def options = object {

    // Option type, without parameters.
    type Option = Pattern & {
        name -> String
        description -> String
        shortHand -> Maybe<String>
    }

    // An option with a parameter.
    type Parameter = Option & {
        values -> Maybe<List<String>>
    }

    // Type of an option builder.
    type Builder = {
        newFlag(name : String)
            shortHand?(shortHand : String)
            description(description : String) -> Option

        newParameter(name : String)
            shortHand?(shortHand : String)
            values?(values : Collection<String>)
            description(description : String) -> Parameter
    }

    // Constructs an option builder.
    class newBuilder -> Builder {

        def options : List<Option> is readable, public =
            collections.list.new<Option>

        // Creates a new singular flag.
        method newFlag(name : String)
               shortHand?(shortHand : String)
               description(description : String) -> Option is public {
            object {
                name is readable, public
                shortHand is readable, public
                description is readable, public

                method match(argument : String) -> MatchResult is public {
                    if(((argument.at(2) == "-") && {
                        argument.substringFrom(3) == name
                    }) || argument.substringFrom(2).contains(shortHand)) then {
                        SuccessfulMatch.new(name, list.new)
                    } else {
                        FailedMatch.new(name)
                    }
                }
            }
        }

        // Creates a new parameter with specific values and a short hand.
        method newParameter(name : String)
               shortHand?(shortHand : String)
               values?(values : Collection<String>)
               description(description : String) -> Parameter is public {
            object {
                inherits newFlag(name) shortHand?(shortHand)
                    description(description)

                values is readable, public
            }
        }

    }

}

