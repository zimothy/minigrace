(function() {

    /** Helpers ***************************************************************/

    var global = this;
    var slice  = Array.prototype.slice;

    // Wraps the given value in a getter method.
    function getter(value) {
        return nativeMethod(function() {
            return value;
        });
    }

    // Wraps the constructor into a Grace class, using new as the class method.
    function makeClass(Constructor, types) {
        return {
            'new': method(construct(Constructor), "public", types);
        };
    }

    // Constructs a Grace Type object from the given constructor's prototype.
    function makeType(Constructor) {
        return getter(new Type(Constructor.prototype));
    }

    var hasOwnProperty = Object.prototype.hasOwnProperty;

    // Adds all the direct properties in from to object.
    function extend(object, from) {
        for (var key in from) {
            if (hasOwnProperty.call(from, key)) {
                object[key] = from;
            }
        }
        return object;
    }

    // Evaluates if an object has a method publicly available.
    function has(obj, name) {
        return obj[name] != null && obj[name].access === 'public';
    }

    // Iterator helper.
    function each(list, callback) {
        var i, length, result;

        for(i = 0, length = list.length; i < length; i++) {
            result = callback(i, list[i]);
            if (typeof result !== "undefined") {
                return result;
            }
        }
    }

    // Conversion helpers.
    function asBoolean(value) {
        if (typeof value === "boolean") {
            return value;
        }

        var result = false;
        value.andAlso(function() {
            result = true;
        });

        return result;
    }

    function asNumber(value) {
        if (typeof value === "number") {
            return value;
        }

        throw new Exception("NativeTypeException",
            "Cannot retrieve native number");
    }

    function asString(value) {
        if (typeof value === "string") {
            return value;
        }

        var string = has(value, "asString") ? call(value, "asString") :
            call(value, "asDebugString");

        if (typeof value === "string") {
            return value;
        }

        throw new Exception("NativeTypeException",
            "Cannot retrieve native string");
    }

    function asArray(value) {
        if (value instanceof Array) {
            return value;
        }

        if (!(has(value, "size") && has(value, "at"))) {
            throw new Exception("NativeTypeException",
                "Cannot retrieve native list");
        }

        var i = 0, length = call(value, "size");
        var result = [];

        while (i < length) {
            result.push(callWith(value, "at", value)(i));
        }

        return result;
    }

    // Late-bound matchers.
    function match(result, bindings) {
        var sm = call(prelude, "SuccessfulMatch");
        return callWith(sm, "new")(result, bindings);
    }

    function fail(result) {
        var fm = call(prelude, "FailedMatch");
        return callWith(fm, "new")(result);
    }


    /** Prelude definitions ***************************************************/

    var print = nativeMethod(typeof console === "object" &&
        typeof console.log === "function" ? function(value) {
            console.log(asString(value));
        } : function() {}, [doneType]);

    var if_then = nativeMethod(function(condition, thenBlock) {
        if (asBoolean(condition)) {
            return thenBlock.apply();
        }
    }, [booleanType], [blockType]);

    var if_then_else = nativeMethod(function(condition, thenBlock, elseBlock) {
        if (asBoolean(condition)) {
            return thenBlock.apply();
        }

        return elseBlock.apply();
    }, [booleanType], [blockType]);

    var for_do = nativeMethod(function(iterable, block) {
        var iterator = iterable.iter();
        while (asBoolean(iterator.havemore())) {
            block.apply(iterator.next());
        }
    }, [iterableType], [blockType]);

    var while_do = nativeMethod(function(condition, block) {
        while (asBoolean(condition.apply())) {
            block.apply();
        }
    }, [blockType], [blockType]);


    /** Native types **********************************************************/

    var doneType = new Type({
        asDebugString: [stringType]
    });

    var objectType = new Type({
        asDebugString: [stringType],
        '==':     [[objectType], booleanType],
        '!=':     [[objectType], booleanType],
        asString: [stringType]
    });


    /** Native objects ********************************************************/

    // Singleton and constructor wrapper definitions.
    var done;
    var varargs = construct(VarArgs);


    // Grace object constructor.
    function Object() {
        var self = this;
        extend(this, {
            // Temporary: this should be moved into the prelude.
            print: print,
            '==': nativeMethod(function(other) {
                return bool(self === other);
            }, [objectType]),
            '!=': nativeMethod(function(other) {
                return self['=='].not();
            }, [objectType]),
            asString: nativeMethod(function() {
                return self.asDebugString();
            }),
            asDebugString: nativeMethod(function() {
                // TODO Actually describe the object.
                return "object {}";
            })
        });
    }

    Object.prototype = null;


    // Grace primitive methods.
    var primitives = {
        'boolean': extend(new Object(), {
            '==': nativeMethod(function(self, other) {
                return self === asBoolean(other);
            }, [objectType]),
            not: nativeMethod(function(self) {
                return !self;
            }),
            'prefix!': nativeMethod(function(self) {
                return !self;
            }),
            '&': nativeMethod(function(self, other) {
                return new GraceAndPattern(self, other);
            }, [patternType]),
            '|': nativeMethod(function(self, other) {
                return new GraceOrPattern(self, other);
            }, [patternType]),
            '&&': nativeMethod(function(self, other) {
                return self ? (has(other, "apply") ?
                    call(other, "apply", self) : other) : self;
            }, [booleanType['|'](blockType)]),
            '||': nativeMethod(function(self, other) {
                return self ? self : (has(other, "apply") ?
                    call(other, "apply", self) : other);
            }, [booleanType['|'](blockType)]),
            andAlso: nativeMethod(function(self, other) {
                return self ? other.apply() : self;
            }, [blockType]),
            orElse: nativeMethod(function(self, other) {
                return self ? self : other.apply();
            }, [blockType]),
            asString: nativeMethod(function(self) {
                return self.toString();
            }),
            match: nativeMethod(function(self, other) {
                var eq = callWith(self, "==", self)(other);
                return eq ? match(other) : fail(other);
            }, [objectType])
        }),
        number: extend(new Object(), {
            '==': nativeMethod(function(self, other) {
                return self === asNumber(other);
            }, [objectType]),
            '+': nativeMethod(function(self, other) {
                return self + asNumber(other);
            }, [numberType]),
            '-': nativeMethod(function(self, other) {
                return self - asNumber(other);
            }, [numberType]),
            '*': nativeMethod(function(self, other) {
                return self * asNumber(other);
            }, [numberType]),
            '/': nativeMethod(function(self, other) {
                return self / asNumber(other);
            }, [numberType]),
            '%': nativeMethod(function(self, other) {
                return self % asNumber(other);
            }, [numberType]),
            '++': nativeMethod(function(self, other) {
                return self.toString() + asString(other);
            }, [objectType]),
            "..": nativeMethod(function(self, other) {
                var from = self;
                var to   = asNumber(other);
                if (to < from) {
                    from = to;
                    to = self;
                }
                
                var range = [];
                for (; from <= to; from++) {
                    range.push(number(from));
                }
                return range;
            }, [numberType]),
            '<': nativeMethod(function(self, other) {
                return self < asNumber(other);
            }, [numberType]),
            '>': nativeMethod(function(self, other) {
                return self < asNumber(other);
            }, [numberType]),
            '<=': nativeMethod(function(self, other) {
                return self <= asNumber(other);
            }, [numberType]),
            '>=': nativeMethod(function(self, other) {
                return self >= asNumber(other);
            }, [numberType]),
            'prefix-': nativeMethod(function(self) {
                return -self;
            }),
            asString: nativeMethod(function(self) {
                return self.toString();
            }),
            hashcode: nativeMethod(function(self) {
                return self * 10;
            }),
            inBase: nativeMethod(function(self, base) {
                return self.toString(asNumber(other));
            }, [numberType]),
            truncate: nativeMethod(function(self) {
                return (self < 0 ? Math.ceil : Math.floor)(self);
            }),
            match: nativeMethod(function(self, other) {
                if (!asBoolean(numberType.match(other))) {
                    return fail(other);
                }
                return this == asNumber(other) ? match(other) : fail(other);
            }, [objectType]),
            '|': nativeMethod(function(self, other) {
                var or = call(prelude, "GraceOrPattern", self);
                return callWith(or, "new", self)(self, other);
            }, [patternType]),
            '&': nativeMethod(function(self, other) {
                var and = call(prelude, "GraceOrPattern", self);
                return callWith(and, "new", self)(self, other);
            }, [patternType])
        }),
        string: extend(new Object, {
            '==': nativeMethod(function(self, other) {
                return self === asString(other);
            }, [objectType]),
            '++': nativeMethod(function(self, other) {
                return self + asString(other);
            }, [objectType]),
            at: nativeMethod(function(self, index) {
                return self.charAt(asNumber(index));
            }, [numberType]),
            size: nativeMethod(function(self) {
                return self.length;
            }),
            'replace()with': nativeMethod(function(self, what, wth) {
                what = new RegExp(asString(what).replace(/(.)/g, '\\$1'), 'g');
                return self.replace(what, asString(wth)));
            }, [stringType], [stringType]),
            'substringFrom()to': nativeMethod(function(self, from, to) {
                return self.substring(asNumber(from), asNumber(to));
            }, [numberType], [numberType]),
            asString: nativeMethod(function(self) {
                return self;
            }),
            iter: nativeMethod(function(self) {
                var i = 0;
                return extend(new Object(), {
                    havemore: nativeMethod(function() {
                        return i < self.length;
                    }),
                    next: nativeMethod(function() {
                        return value.charAt(i++);
                    })
                });
            }),
            ord: nativeMethod(function(self) {
                return self.charCodeAt(0);
            }),
            hashcode: nativeMethod(function(self) {
                var hashCode = 0;
                each(self, function(i) {
                    hashCode *= 23;
                    hashCode += self.charCodeAt(i);
                    hashCode %= 0x100000000;
                });
                return hashCode;
            }),
            indices: nativeMethod(function(self) {
                var indices = [];
                each(self, function(i) {
                    indices.push(number(i + 1));
                });
                return indices;
            }),
            asNumber: nativeMethod(function(self) {
                // What happens if it doesn't match?
                return number(Number(self));
            }),
            match: nativeMethod(function(self, other) {
                if (!asBoolean(stringType.match(other))) {
                    return fail(other);
                }
                return self == asString(other) ? match(other) : fail(other);
            }, [objectType]),
            '|': nativeMethod(function(self, other) {
                var or = call(prelude, "GraceOrPattern", self);
                return callWith(or, "new", self)(self, other);
            }, [patternType]),
            '&': nativeMethod(function(self, other) {
                var and = call(prelude, "GraceOrPattern", self);
                return callWith(and, "new", self)(self, other);
            }, [patternType])
        }),
        'function': extend(new Object(), {
            apply: nativeMethod(function(self, args) {
                if (asNumber(args.length) < self.length) {
                    throw "Incorrect number of arguments."
                }
                return self.apply(null, args);
            }, varargs(objectType)),
            match: nativeMethod(function(value) {
                return failedMatch(value);
            }, [objectType]),
            pattern: nativeMethod(function() {})
        },
        // The only primitive object in this system is the array.
        object: extend(new Object(), {
            '==': nativeMethod(function(self, other) {
                other = asList(other);

                if (self.length !== other.length) {
                    return false;
                }

                !each(self, function(i) {
                    if (asBoolean(callWith(self[i], "==", self)(other[i]))) {
                        return true;
                    }
                });
            }, [objectType]),
            concat: nativeMethod(function(self, other) {
                return self.concat(asArray(other));
            }, [listType]),
            size: nativeMethod(function(self) {
                return self.length;
            }),
            at: nativeMethod(function(self, index) {
                return self[asNumber(index) - 1];
            }, [numberType]),
            'at()put': nativeMethod(function(self, index, value) {
                self[asNumber(index) - 1] = value;
            }, [numberType], [objectType]),
            contains: nativeMethod(function(self, value) {
                each(self, function(i, el) {
                    if (asBoolean(callWith(el, "==", self)(value))) {
                        return true;
                    }
                }) || false;
            }, [objectType]),
            iter: nativeMethod(function(self) {
                var i = 0;
                return {
                    havemore: nativeMethod(function() {
                        return i < self.length;
                    }),
                    next: nativeMethod(function() {
                        return value[i++];
                    })
                };
            }),
            push: nativeMethod(function(self, value) {
                self.push(value);
            }, [objectType]),
            pop: nativeMethod(function(self) {
                return self.pop();
            }),
            first: nativeMethod(function(self) {
                return self[0];
            }),
            last: nativeMethod(function(self) {
                return self[self.length - 1];
            }),
            prepended: nativeMethod(function(self) {
                return [value].concat(self);
            }),
            indices: nativeMethod(function(self) {
                var indices = [];
                each(self, function(i) {
                    indices.push(i);
                });
                return indices;
            }),
            asString: nativeMethod(function(self) {
                var str = "[";
                each(self, function(i, value) {
                    str += asString(value) + ",";
                });
                return str.substring(0, str.length - 1) + "]";
            })
        })
    };

    primitives.string['[]'] = primitives.string.at;
    primitives.object['[]'] = primitives.object.at;


    // Grace type.
    function Type(type) {
        this.type = type;
    }

    Type.prototype = inherits(Pattern, {
        match: method(function(obj) {
            var type = this.type;
            for (var key in type) {
                if (!has(obj, key) || obj[key].length !== type[key].length) {
                    return failedMatch(obj);
                }
            }

            return successfulMatch(obj);
        }, "native", [doneType])
    })


    // Var args notifier.
    function VarArgs(value) {
        this.value = value;
    }


    function module(name, source, func) {
        source = source.split("\n");

        try {
            func(defineMethod, makeGetMethod(src));
        } catch (ex) {
            if (!ex.reported) {
                console.log("Unexpected module failure: " + ex);
            }
        }
    }

    // Grace exceptions.
    function Exception(name, message) {
        this._name = name;
        this._message = message;
        this._stack = [];
    }

    Exception.prototype = inherits(Object, {
        name: nativeMethod(function() {
            return this._name;
        }),
        message: nativeMethod(function() {
            return this._message;
        }),
        asString: nativeMethod(function() {
            return this._name + ": " + this._message;
        })
    });

    function ExceptionFactory(name) {
        this._name = name;
    }

    ExceptionFactory.prototype = inherits(Object, {
        name: nativeMethod(function() {
            return this._name;
        }),
        raise: nativeMethod(function(message) {
            throw new Exception(this._name, message);
        }),
        refine: nativeMethod(function(name) {
            return new ExceptionFactory(name);
        }),
        asString: nativeMethod(function() {
            return this._name;
        })
    });

    function Return() {}

    Return.prototype.toString = function() {
        return "Return invoked outside of containing method";
    };


    // Constructs a method with the given access annotation and function. Also
    // takes information about the signature of the method.
    function defineMethod(object, name, func, annotations) {
        var params = slice.call(arguments, 4);
        if (params.length === 0) {
            params = [[]];
        }

        function LocalReturn(value) {
            this.value = value;
        }

        LocalReturn.prototype = new Return();

        function localReturn(value) {
            throw new LocalReturn(value);
        }

        var reportError = typeof console !== undefined &&
            typeof console.error === "function" ? console.error : function() {};

        function methodFunc(self, args) {
            if (access === "native") {
                return func.apply(self, args);
            }

            try {
                return func.apply(localReturn, args);
            } catch (e) {
                if (e instanceof LocalReturn) {
                    return e.value;
                } else {
                    if (!(e instanceof Return || e instanceof Exception)) {
                        reportError("Native error - " + e);
                        e = new Exception("InternalException", e.toString());
                    }

                    if (e instanceof Exception) {
                        e._stack.splice(0, 0, line);
                    }

                    throw e;
                }
            }
        }

        function makeSignature(i) {
            if (i >= params.length) {
                return null;
            }

            var part = params[i];
            var length = part.length;

            var varargs = length instanceof VarArgs;
            if (varargs) {
                length -= 1;
            }

            var next = makeSignature(i + 1);
            var called = false;

            return function() {
                if (arguments.length < length) {
                    throw "Incorrect number of arguments."
                }

                var self = this;
                var from = 0;

                if (access === "native" && this instanceof Array) {
                    self = this[0];
                    from = 1;
                }

                var args = slice.call(arguments, 0, length);

                if (this instanceof Array) {
                    args = this.slice(from).concat(args);
                }

                if (varargs) {
                    args.push(new List(slice.call(arguments, length)));
                }

                if (next === null) {
                    return methodFunc(self, args);
                }

                if (access === "native") {
                    args.splice(0, 0, self);
                }

                return function() {
                    return next.apply(args, arguments);
                };
            }
        }

        var signature = makeSignature(0);

        if (access === "native") {
            signature.access = "public";
        } else {
            signature.access = access;
        }

        return signature;
    }

    function call() {
        return callWith.apply(this, arguments)();
    }

    function callWith(object, name, context, line) {
        var type = typeof object;

        if (type !== "object" || object instanceof Array) {
            if (type === "undefined") {
                var ex = new Exception("DoneException",
                    "Cannot perform action on done");
                ex._stack.push(line);
                throw ex;
            }

            if (!has(primitives[type], name)) {
                var ex = new Exception("NoSuchMethodException",
                    "No such method " + name);
                ex._stack.push(line);
                throw ex;
            }

            var method = primitives[type][name];

            return function() {
                return method.apply(null, [object].concat(arguments));
            };
        }

        if (!has(object, name)) {
            var ex = new Exception("NoSuchMethodException",
                "No such method " + name);
            ex._stack.push(line);
            throw ex;
        }

        var method = object[name];

        if (method.access === 'confidential' && context !== object) {
            var ex =  new Exception("MethodAccessException",
                "Improper access to confidential method");
            ex._stack.push(line);
            throw ex;
        }

        if (method.access === 'native') {
            return function() {
                return method.apply(object, arguments);
            };
        }

        return method;
    }


    /** Native modules in the standard library ********************************/

    var prelude = {
        done:             getter(done),
        Done:             getter(doneType),
        Object:           getter(objectType),
        Boolean:          getter(booleanType),
        Number:           getter(numberType,
        String:           getter(stringType),
        Dynamic:          getter(dynamicType),
        print:            print,
        'if()then':       if_then,
        'if()then()else': if_then_else,
        'for()do':        for_do,
        'while()do':      while_do,
        Exception:        getter(new ExceptionFactory("Exception"))
    };


    /** Global grace export ***************************************************/

    var grace = {
        'native': extend(function(value) {
            if (arguments.length > 1) {
                var type = typeof arguments[3];
                if (type === "number" || type === "undefined") {
                    return callWith.apply(this, arguments);
                } else if (arguments.length > 1) {
                    return defineMethod.apply(this, arguments);    
                }
            } else if (typeof value === "function") {
                var object = new Object();
                value(object);
                return object;
            } else {
                return new VarArgs(value);
            }
        }),
        prelude: getter(prelude)
    };

    if (typeof module === "undefined") {
        this.grace = grace;
    } else {
        module.exports = grace;
    }

})();
