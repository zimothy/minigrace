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
            'new': nativeMethod(construct(Constructor), types)
        };
    }

    var hasOwnProperty = Object.prototype.hasOwnProperty;

    // Adds all the direct properties in from to object.
    function extend(object, from) {
        for (var key in from) {
            if (hasOwnProperty.call(from, key)) {
                object[key] = from[key];
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
    function successfulMatch(result, bindings) {
        var sm = call(prelude, "SuccessfulMatch");
        return callWith(sm, "new")(result, bindings);
    }

    function failedMatch(result) {
        var fm = call(prelude, "FailedMatch");
        return callWith(fm, "new")(result);
    }


    /** Native types **********************************************************/

    function typeMatch(names, obj) {
        for (var name in names) {
            if (!has(obj, name)) {
                return false;
            }
        }
        return true;
    }

    // This isn't an exposed object, it's just enough to get the base types off
    // the ground for the native objects and methods to be defined.
    function NativeType(names) {
        this.names = names;
    }

    NativeType.prototype = {
        match: function(obj) {
            return typeMatch(this.names, obj);
        },
        and: function(type) {
            return new NativeAnd(this, type);
        },
        or: function(type) {
            return new NativeOr(this, type);
        }
    };

    function NativeAnd(a, b) {
        this.a = a;
        this.b = b;
    }

    NativeAnd.prototype = extend(new NativeType(), {
        match: function(obj) {
            return typeMatch(this.a, obj) && typeMatch(this.b, obj);
        }
    });

    function NativeOr(a, b) {
        this.a = a;
        this.b = b;
    }

    NativeOr.prototype = extend(new NativeType(), {
        match: function(obj) {
            return typeMatch(this.a, obj) || typeMatch(this.b, obj);
        }
    });

    var dynamicType = new NativeType([]);

    var doneType = new NativeType(["asDebugString"])

    var objectType = doneType.and(new NativeType(["==", "!=", "asString"]));

    var patternType = objectType.and(new NativeType(["match", "&", "|"]));

    var iterableType = objectType.and(new NativeType(["iter"]));

    var booleanType = patternType.and(new NativeType([
        "not", "prefix!", "&&", "||", "andAlso", "orElse"
    ]));

    var numberType = patternType.and(new NativeType([
        "+", "-", "*", "/", "%", "++", "..", "<", ">", "<=", ">=", "prefix-",
        "hashcode", "inBase", "truncate"
    ]));

    var stringType = patternType.and(iterableType.and(new NativeType([
        "++", "at", "[]", "size", "replace()with", "substringFrom()to", "iter",
        "ord", "hashcode", "indices", "asNumber"
    ])));

    var blockType = objectType.and(new NativeType(["apply", "pattern"]));

    var listType = iterableType.and(new NativeType([
        "concat", "size", "at", "at()put", "[]", "[]:=", "contains", "push",
        "pop", "first", "last", "prepended", "indices"
    ]));

    var nativeTypes = {
        Dynamic: dynamicType,
        Done:    doneType,
        Object:  objectType,
        Pattern: patternType,
        Boolean: booleanType,
        Number:  numberType,
        String:  stringType,
        Block:   blockType,
        List:    listType
    };


    /** Native objects ********************************************************/

    // Singleton and constructor wrapper definitions.
    var done;
    var varargs = function(value) {
        return new VarArgs(value);
    };


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
            }, [booleanType.or(blockType)]),
            '||': nativeMethod(function(self, other) {
                return self ? self : (has(other, "apply") ?
                    call(other, "apply", self) : other);
            }, [booleanType.or(blockType)]),
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
                return self.replace(what, asString(wth));
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
        }),
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
        extend(this, {
            match: nativeMethod(function(obj) {
                for (var key in type) {
                    if (!has(obj, key) || obj[key].length !== type[key].length) {
                        return failedMatch(obj);
                    }
                }

                return successfulMatch(obj);
            }, [objectType])
        });
    }

    Type.prototype = new Object();


    // Var args notifier.
    function VarArgs(value) {
        this.value = value;
    }


    // Module constructor.
    //function module(name, source, func) {
        //source = source.split("\n");

        //try {
            //func(defineMethod, makeGetMethod(src));
        //} catch (ex) {
            //if (!ex.reported) {
                //console.log("Unexpected module failure: " + ex);
            //}
        //}
    //}

    // Grace exceptions.
    function Exception(name, message) {
        extend(this, {
            name: nativeMethod(function() {
                return name;
            }),
            message: nativeMethod(function() {
                return message;
            }),
            asString: nativeMethod(function() {
                return name + ": " + message;
            })
        });
    }

    Exception.prototype = new Object();

    function ExceptionFactory(name) {
        extend(this, {
            name: nativeMethod(function() {
                return name;
            }),
            raise: nativeMethod(function(message) {
                throw new Exception(name, message);
            }),
            refine: nativeMethod(function(name) {
                return new ExceptionFactory(name);
            }),
            asString: nativeMethod(function() {
                return name;
            })
        });
    }

    ExceptionFactory.prototype = new Object();


    // Return jump wrapper.
    function Return() {}

    Return.prototype.toString = function() {
        return "Return invoked outside of containing method";
    };

    var reportError = typeof console !== undefined &&
        typeof console.error === "function" ? console.error : function() {};

    // Constructs a method with the given access annotation and function. Also
    // takes information about the signature of the method.
    function defineMethod(object, name, func, access) {
        var params = slice.call(arguments, 4);
        if (params.length === 0) {
            params = [[]];
        }

        function methodFunc(args) {

            function LocalReturn(value) {
                this.value = value;
            }

            LocalReturn.prototype = new Return();

            function localReturn(value) {
                throw new LocalReturn(value);
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

        // This relies on the fact that partial application never actually
        // occurs, despite the currying of methods. Don't use it natively.
        var args = null;

        // The methods represent mixfix input with currying, so for each
        // argument list we need to return a new function. This function
        // recurses through this task.
        function makeSignature(i) {
            var part = params[i];
            var length = part.length;

            var isVarargs = part instanceof VarArgs;
            if (isVarargs) {
                length -= 1;
            }

            // It's important that this happens outside of the actual function,
            // as it makes sure that all of the functions are created as the
            // method is defined, rather than creating them over again every
            // time the method is called.
            var next = i >= params.length - 1 ? null : makeSignature(i + 1);
            var called = false;

            return function() {
                if (arguments.length < length) {
                    // TODO A more detailed explanation of what went wrong here
                    // would probably be a good idea.
                    var e = new Exception("ArgumentException",
                        "Incorrect number of arguments");
                    throw e;
                }

                var argList = slice.call(arguments, 0, length);

                args = args === null ? argList : args.concat(argList);

                if (isVarargs) {
                    args.push(new List(slice.call(arguments, length)));
                }

                if (next === null) {
                    var finalArgs = args;
                    args = null;
                    return methodFunc(finalArgs);
                }

                return next;
            }
        }

        var signature = makeSignature(0);

        signature.access = access;

        return signature;
    }

    function nativeMethod(func) {
        func.access = "public";
        return func;
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

        if (method.access !== 'public' && context !== object) {
            var ex = new Exception("MethodAccessException",
                "Improper access to confidential method");
            ex._stack.push(line);
            throw ex;
        }

        return method;
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


    /** Native modules in the standard library ********************************/

    var prelude = {
        done:             getter(done),
        print:            print,
        'if()then':       if_then,
        'if()then()else': if_then_else,
        'for()do':        for_do,
        'while()do':      while_do,
        Exception:        getter(new ExceptionFactory("Exception"))
    };

    for (var nativeType in nativeTypes) {
        prelude[nativeType] = getter(new Type(nativeTypes[nativeType].names));
    }


    /** Global grace export ***************************************************/

    var grace = extend(function(value) {
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
    }, {
        prelude: prelude
    });

    if (typeof module === "undefined") {
        this.grace = grace;
    } else {
        module.exports = grace;
    }

})();

