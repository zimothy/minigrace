// Maps a list to a new one with the given block.
method map(list) with(with) -> List is public {
    def list' = []
    var index := 1
    def break = { return list' }
    for(list) do { e ->
        var add := true
        def result = with.apply(e, index, break, { add := false })
        if(add) then {
            list'.push(result)
        }
        index := index + 1
    }

    list'
}

// Filters out elements from a list with the given block.
method filter(list : List) with(choice) -> List is public {
    def list' = []
    def break = { return list' }
    for(list) do { e ->
        if(choice.apply(e, break)) then {
            list'.push(e)
        }
    }

    list'
}

// Maps a list to a new one with the given block and filter.
// More efficient but equivalent to filter(map(list) with(with)) with(filter).
method map(list : List) with(with) filter(filter) -> List is public {
    def list' = []
    var index := 1
    def break = { return list' }
    for(list) do { e ->
        var add := true
        def result = with.apply(e, index, break, { add := false })
        if(add & filter.apply(result)) then {
            list'.push(result)
        }
        index := index + 1
    }

    list'
}

// Folds the elements of the list into a new value using the given function.
// The function should take the accumulator first, and the current value second.
method fold(list, start) with(with) is public {
    var accum := start

    for(list) do { value ->
        accum := with.apply(accum, value)
    }

    accum
}

// Joins the elements of the given list together into a string.
method join(list) -> String is public {
    fold(list, "") with { accum, value ->
        accum ++ value
    }
}

// Joins the elements of the given list together into a string, with separator.
method join(list) separatedBy(by : String) -> String is public {
    var first := true
    fold(list, "") with { accum, value ->
        accum ++ if(first) then {
            first := false
            ""
        } else {
            by
        } ++ value
    }
}

// In-place concatenation of lists. Modifies and returns the first list.
method concat(list : List, *lists : List) -> List is public {
    for (lists) do { attach ->
        for(attach) do { el ->
            list.push(el)
        }
    }

    list
}

// Returns the given string if the condition is true, otherwise an empty string.
method stringIf(condition : Boolean) then(result) -> String is public {
    if(condition) then {
        if(String.match(result)) then {
            result
        } else {
            result.apply
        }
    } else {
        ""
    }
}

// Splits a string into a list of strings.
method splitString(string : String) atAll(char : String) -> List is public {
    split(string) atAll(char) using({ "" }, { string', value ->
        string' ++ value
    })
}

// Splits a list into a list of lists.
method splitList(list) atAll(element) -> List is public {
    split(list) atAll(element) using({ [] }, { list', value ->
        list'.push(value)
    })
}

method split(iter) atAll(element) using(new, add) -> List {
    def result = []
    var current := new.apply()

    for(iter) do { value ->
        if(value == element) then {
            result.push(current)
            current := new.apply()
        } else {
            current := add.apply(current, value)
        }
    }

    result.push(current)

    result
}

// Splits a string in two at the first occurence of the given character.
method splitString(string : String) at(char : String) is public {
    split(string) at(char) using("", "", { string', value ->
        string' ++ value
    })
}

// Splits a list in two at the first occurrence of the given element.
method splitList(list) at(element) is public {
    split(list) at(element) using([], [], { list', value ->
        list'.push(value)
    })
}

method split(iter) at(element) using(fst, snd, add) {
    var found := false

    for(iter) do { value ->
        if(found) then {
            snd := add.apply(snd, value)
        } else {
            if(value == element) then {
                found := true
            } else {
                fst := add.apply(fst, value)
            }
        }
    }

    object {
        def before is public, readable = fst
        def after  is public, readable = snd
    }
}

// Splits a string in two using a test function.
method splitString(string : String) with(test) is public {
    split(string) with(test) using("", "", { string', value ->
        string' ++ value
    })
}

// Splits a list in two using a test function.
method splitList(list) with(test) is public {
    split(list) with(test) using([], [], { list', value ->
        list'.push(value)
    })
}

method split(iter) with(test) using(fst, snd, add) {
    for(iter) do { value ->
        add.apply(if(test.apply(value)) then {
            fst
        } else {
            snd
        }, value)
    }

    object {
        def wasTrue  is public, readable = fst
        def wasFalse is public, readable = snd
    }
}

// Returns a sublist from the given index to the end inclusive.
method sublistOf(list : List) from(from : Number) -> List is public {
    sublistOf(list) from(from) to(list.size)
}

// Returns a sublist from the start to the given index inclusive.
method sublistOf(list : List) to(to : Number) -> List is public {
    sublistOf(list) from(1) to(to)
}

// Returns a sublist from and to the given indices inclusive.
method sublistOf(list : List) from(from : Number)
       to(to : Number) -> List is public {
    def sublist = []

    while { from <= to } do {
        sublist.push(list.at(from))
        from := from + 1
    }

    sublist
}

// General contains method for any iterable collection.
method has(element) in(collection) -> Boolean is public {
    for(collection) do { value ->
        if(value == element) then {
            return true
        }
    }

    false
}

// Determines if one list is a sublist of the other.
method isSublist(sublist) of(list) -> Boolean is public {
    def size = sublist.size

    if(size == 0) then {
        return true
    }

    var i := 1

    for(list) do { value ->
        i := if(value == sublist.at(i)) then {
            i + 1
        } else {
            1
        }

        if(i == (size + 1)) then {
            return true
        }
    }

    return false
}

// Tests if the given block is true for at least one element of the list.
method for(list) some(test) -> Boolean is public {
    for(list) do { value ->
        if(test.apply(value)) then {
            return true
        }
    }

    false
}

// Tests if the given block is true for all of the elements of the list.
method for(list) all(test) -> Boolean is public {
    for(list) do { value ->
        if(test.apply(value).not) then {
            return false
        }
    }

    true
}

// Tests if the given block is true for none of the elements of the list.
method for(list) none(test) -> Boolean is public {
    for(list) some(test).not
}
