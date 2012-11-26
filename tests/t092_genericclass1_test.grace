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

def t : A<String> = Test.new<String>
print(t.foo("test"))
