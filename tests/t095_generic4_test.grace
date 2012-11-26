type A<T> = {
    foo(_ : T) -> Number
    bar(_ : Number) -> T
}

class Test.new<T> {
    var tval : T
    method foo(x : T) -> Number {
        2
    }
    method bar(y : Number) -> T {
        tval
    }
}

// Instantiated with Dynamic
def t : A = Test.new<String>
print(t.foo("test"))

