#pragma NativePrelude
#pragma DefaultVisibility=public
inherits _prelude
def isStandardPrelude = true

class SuccessfulMatch.new(result', bindings') {
    inherits true
    def result = result'
    def bindings = bindings'
    method asString {
        "SuccessfulMatch(result = {result}, bindings = {bindings})"
    }
}

class FailedMatch.new(result') {
    inherits false
    def result = result'
    def bindings = []
    method asString {
        "FailedMatch(result = {result})"
    }
}

type Extractable = {
    extract
}
class BasicPattern.new {
    method &(o) {
        AndPattern.new(self, o)
    }
    method |(o) {
        OrPattern.new(self, o)
    }
}
class MatchAndDestructuringPattern.new(pat, items') {
    def pattern = pat
    def items = items'
    method match(o) {
        def m = pat.match(o)
        if (m) then{
            var mbindings := m.bindings
            def bindings = []
            if (mbindings.size < items.size) then {
                if (Extractable.match(o)) then {
                    mbindings := o.extract
                } else {
                    return FailedMatch.new(o)
                }
            }
            for (items.indices) do {i->
                def b = items[i].match(mbindings[i])
                if (!b) then {
                    return FailedMatch.new(o)
                }
                for (b.bindings) do {bb->
                    bindings.push(bb)
                }
            }
            SuccessfulMatch.new(o, bindings)
        } else {
            FailedMatch.new(o)
        }
    }
}

class VariablePattern.new(nm) {
    method match(o) {
        SuccessfulMatch.new(o, [o])
    }
}

class BindingPattern.new(pat) {
    method match(o) {
        def bindings = [o]
        def m = pat.match(o)
        if (!m) then {
            return m
        }
        for (m.bindings) do {b->
            bindings.push(b)
        }
        SuccessfulMatch.new(o, bindings)
    }
}

class WildcardPattern.new {
    method match(o) {
        SuccessfulMatch.new(nothing, [])
    }
}

class AndPattern.new(p1, p2) {
    method match(o) {
        def m1 = p1.match(o)
        if (!m1) then {
            return m1
        }
        def m2 = p2.match(o)
        if (!m2) then {
            return m2
        }
        def bindings = []
        for (m1.bindings) do {b->
            bindings.push(b)
        }
        for (m2.bindings) do {b->
            bindings.push(b)
        }
        SuccessfulMatch.new(o, bindings)
    }
}

class OrPattern.new(p1, p2) {
    method match(o) {
        if (p1.match(o)) then {
            return SuccessfulMatch.new(o, [])
        }
        if (p2.match(o)) then {
            return SuccessfulMatch.new(o, [])
        }
        FailedMatch.new(o)
    }
}

method do(block : Block) {
    block.apply
}

type Maybe<T> is public = {
    // Evaluates whether this is a value.
    isValue -> Boolean

    // Evaluates whether this is nothing.
    isNothing -> Boolean

    // This value. Will produce an exception if this is nothing.
    value -> T

    // Produces this value, or the right value if this is nothing.
    ||(other : T) -> T

    // Produces the right value if is a value, or nothing if this is nothing.
    then<R>(other : Maybe<R>) -> Maybe<R>

    // Evaluates the right value with this value, or nothing if this is nothing.
    bind<R>(block : Block<T, Maybe<R>>) -> Maybe<R>
}

def NothingException = Exception.refine("NothingException")

class nothing<T> -> Maybe<T> is public {
    def isValue : Boolean is readable, public = false
    def isNothing : Boolean is readable, public = true

    method value -> T is public {
        NothingException.raise("Cannot retrieve value of Nothing")
    }

    method ||(other : T) -> T is public { other }

    method then<R>(_ : Maybe<R>) -> Maybe<R> is public { nothing<R> }
    method bind<R>(_ : Block<T, Maybe<R>>) -> Maybe<R> is public {
        nothing<R>
    }

    method ==(value : Object) -> Boolean is public, override {
        match(value) case { maybe : Maybe<T> ->
            maybe.isNothing
        } else { false }
    }

    method asString -> String is public, override {
        "Nothing"
    }
}

class just<T>(value : T) -> Maybe<T> is public {
    def isValue : Boolean is readable, public = true
    def isNothing : Boolean is readable, public = false

    value is readable, public

    method ||(_ : T) -> T is public { value }

    method then<R>(other : Maybe<R>) -> Maybe<R> is public { other }
    method bind<R>(other : Block<T, Maybe<R>>) -> Maybe<R> is public {
        other.apply(value)
    }

    method ==(value : Object) -> Boolean is public, override {
        match(value) case { maybe : Maybe<T> ->
            maybe.isValue && { maybe.value == value }
        } else { false }
    }

    method asString -> String is public, override {
        "Just({value})"
    }
}

