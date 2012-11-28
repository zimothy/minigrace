(function() {

    /** Helpers ***************************************************************/

    var global  = this;
    var slice   = Array.prototype.slice;
    var splice  = Array.prototype.splice;
    var valueOf = global.Object.prototype.valueOf;

    // Object creator.
    function newObject() {
        return new Object();
    }

    // Native method creation helper.
    function nativeObject(func) {
        var object = new Object();
        func(function(name, method) {
            var types = slice.call(arguments, 2);
            var args = [object, name, method, "public"].concat(types);
            defineMethod.apply(null, args);
        }, function(name, value) {
            defineMethod(object, name, function() {
                return value;
            }, "public", "def");
        });
        return object;
    }

    var hasOP= global.Object.prototype.hasOwnProperty;
    function hasOwnProperty(obj, name) {
        return hasOP.call(obj, name);
    }

    // Adds all the direct properties in from to object.
    function extend(object, from) {
        for (var key in from) {
            if (hasOwnProperty(from, key)) {
                object[key] = from[key];
            }
        }
        return object;
    }

    // A version of typeof that will return primitive types of object wrappers
    // of primitives. It will also return "array" for Array instances.
    function typeOf(obj) {
        var type = typeof obj;

        if (type !== "object") {
            return typeof obj;
        }

        if (obj instanceof Boolean) {
            return "boolean";
        } else if (obj instanceof Number) {
            return "number";
        } else if (obj instanceof String) {
            return "string";
        } else if (obj instanceof Array) {
            return "array";
        }

        return "object";
    }

    // Evaluates if an object has a method publicly available.
    // Note that it will recognise primitive values and assert that a method
    // exists even if it is not actually attached to the value. It will also
    // recognise normal Javascript objects and consider any methods on them as
    // public.
    function hasPublicMethod(obj, name) {
        var type = typeOf(obj);

        if (type === "undefined") {
            return name === "asDebugString";
        }

        if (hasOwnProperty(objectMethods, name)) {
            return true;
        }

        if (type !== "object") {
            return hasOwnProperty(primitives[type], name) ||
                (obj[name] != null && obj[name].access === "public");
        }

        return obj[name] != null &&
            (obj[name].access === "public" || !(obj instanceof Object));
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

    // Printing to the console, if it's available.
    var print = typeof console === "object" &&
        typeof console.log === "function" ? function(value) {
            console.log(asString(value));
        } : function() {};

    // Conversion helpers.
    function asBoolean(value) {
        if (typeOf(value) === "boolean") {
            return value.valueOf();
        }

        var result = false;
        value.andAlso(function() {
            result = true;
        });

        return result;
    }

    function asNumber(value) {
        if (typeOf(value) === "number") {
            return value.valueOf();
        }

        throw new Error("NativeTypeError",
            "Cannot retrieve native number");
    }

    function asString(value) {
        if (typeOf(value) === "string") {
            return value.valueOf();
        }

        var string = hasPublicMethod(value, "asString") ?
            call(value, "asString") : call(value, "asDebugString");

        if (typeof string === "string") {
            return string;
        }

        throw new Error("NativeTypeError",
            "Cannot retrieve native string");
    }

    function asArray(value) {
        if (value instanceof Array) {
            return value;
        }

        if (!(hasPublicMethod(value, "size") &&
                hasPublicMethod(value, "at"))) {
            throw new Error("NativeTypeError",
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
    function successfulMatch(result) {
        var sm = call(prelude, "SuccessfulMatch");
        return callWith(sm, "new")(result, []);
    }

    function failedMatch(result) {
        var fm = call(prelude, "FailedMatch");
        return callWith(fm, "new")(result);
    }


    /** Native types **********************************************************/

    function typeMatch(names, obj) {
        var failed = each(names, function(i, name) {
            if (!hasPublicMethod(obj, name)) {
                return failedMatch(obj);
            }
        });

        return failed ? failed : successfulMatch(obj);
    }

    // This isn't an exposed object, it's just enough to get the base types off
    // the ground for the native objects and methods to be defined.
    function NativeType(names) {
        if (names) {
            this.names = names;
        }
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
            var a = this.a.match(obj);
            if (!asBoolean(a)) {
                return a;
            }

            return this.b.match(obj);
        }
    });

    function NativeOr(a, b) {
        this.a = a;
        this.b = b;
    }

    NativeOr.prototype = extend(new NativeType(), {
        match: function(obj) {
            var a = this.a.match(obj);
            if (asBoolean(a)) {
                return a;
            }

            return this.b.match(obj);
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

    // These will need to be converted into real types before being exposed to
    // the modules through the prelude.
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
    var varargs = function() {
        return new VarArgs(arguments);
    };


    // Grace object constructor. Mostly for instanceof checks.
    function Object() {}

    var objectMethods = nativeObject(function(method) {
        // Temporary: this should be moved into the prelude.
        method("print", function(self, obj) {
            print(obj);
        }, "public", [objectType, objectType]);
        method("==", function(self, other) {
            if (self === other) {
                return true;
            }

            // Normal Javascript objects cannot be egal to anything.
            if (!(self instanceof Object && other instanceof Object)) {
                return false;
            }

            // Shoddy implementation of egal.
            for (var name in self) {
                if (name === "==" || name === "!=" || name === "asString" ||
                        name === "asDebugString" || name === "print") {
                    continue;
                }

                var method = self[name];
                if (method.access !== "public" || method === other[name]) {
                    continue;
                }

                if (method.kind !== "def" || other[name] == null ||
                        other[name].access !== "public" ||
                        method.kind !== other[name].kind) {
                    return false;
                }

                var a = call(self, name, self), b = call(other, name, self);
                if (!asBoolean(calln(a, "==", self)(b))) {
                    return false;
                }
            }

            for (name in other) {
                if (self[name] == null) {
                    return false;
                }
            }

            return true;
        }, "public", [objectType, objectType]);
        method("!=", function(self, other) {
            var equal = calln(self, "==", self)(other);
            return call(equal, "not", self);
        }, "public", [objectType, objectType]);
        method("asString", function(self) {
            return call(self, "asDebugString", self);
        }, "public", [objectType]);
        method("asDebugString", function(self) {
            // TODO Actually describe the object.
            return "object {}";
        }, "public", [objectType]);
    });

    // Primitive function helper.
    function primitiveObject(func) {
        return nativeObject(function(method) {
            func(function(name) {
                var types = arguments[2];
                splice.call(types || arguments, types ? 0 : 2, 0, objectType);
                method.apply(null, arguments);
            });
        });
    }

    // Grace primitive methods.
    var primitives = {
        'boolean': primitiveObject(function(method) {
            method("==", function(self, other) {
                if (!asBoolean(booleanType.match(other))) {
                    return false;
                }
                return self === asBoolean(other);
            }, [objectType]);
            method("not", function(self) {
                return !self.valueOf();
            });
            method("prefix!", function(self) {
                return !self.valueOf();
            });
            method("&", function(self, other) {
                return calln(call(prelude, "AndPattern", self),
                    "new", self)(self, other);
            }, [patternType]);
            method("|", function(self, other) {
                return calln(call(prelude, "OrPattern", self),
                    "new", self)(self, other);
            }, [patternType]);
            method("&&", function(self, other) {
                return self ? (hasPublicMethod(other, "apply") ?
                    call(other, "apply", self) : other) : self;
            }, [booleanType.or(blockType)]);
            method("||", function(self, other) {
                return self ? self : (hasPublicMethod(other, "apply") ?
                    call(other, "apply", self) : other);
            }, [booleanType.or(blockType)]);
            method("andAlso", function(self, other) {
                return self ? other.apply() : self;
            }, [blockType]);
            method("orElse", function(self, other) {
                return self ? self : other.apply();
            }, [blockType]);
            method("asString", function(self) {
                return self.toString();
            });
            method("match", function(self, other) {
                var eq = callWith(self, "==", self)(other);
                return eq ? successfulMatch(other) : failedMatch(other);
            }, [objectType]);
        }),
        number: primitiveObject(function(method) {
            method("==", function(self, other) {
                if (!asBoolean(numberType.match(other))) {
                    return false;
                }
                return self === asNumber(other);
            }, [objectType]);
            method("+", function(self, other) {
                return self + asNumber(other);
            }, [numberType]);
            method("-", function(self, other) {
                return self - asNumber(other);
            }, [numberType]);
            method("*", function(self, other) {
                return self * asNumber(other);
            }, [numberType]);
            method("/", function(self, other) {
                return self / asNumber(other);
            }, [numberType]);
            method("%", function(self, other) {
                return self % asNumber(other);
            }, [numberType]);
            method("++", function(self, other) {
                return self.toString() + asString(other);
            }, [objectType]);
            method("..", function(self, other) {
                var from = self;
                var to   = asNumber(other);
                if (to < from) {
                    from = to;
                    to = self;
                }

                var range = [];
                for (; from <= to; from++) {
                    range.push(from);
                }
                return range;
            }, [numberType]);
            method("<", function(self, other) {
                return self < asNumber(other);
            }, [numberType]);
            method(">", function(self, other) {
                return self > asNumber(other);
            }, [numberType]);
            method("<=", function(self, other) {
                return self <= asNumber(other);
            }, [numberType]);
            method(">=", function(self, other) {
                return self >= asNumber(other);
            }, [numberType]);
            method("prefix-", function(self) {
                return -self;
            });
            method("asString", function(self) {
                return self.toString();
            });
            method("hashcode", function(self) {
                return self * 10;
            });
            method("inBase", function(self, base) {
                return self.toString(asNumber(other));
            }, [numberType]);
            method("truncate", function(self) {
                return (self < 0 ? Math.ceil : Math.floor)(self);
            });
            method("match", function(self, other) {
                if (!asBoolean(numberType.match(other))) {
                    return failedMatch(other);
                }
                return self == asNumber(other) ? successfulMatch(other) :
                    failedMatch(other);
            }, [objectType]);
            method("&", function(self, other) {
                return calln(call(prelude, "AndPattern", self),
                    "new", self)(self, other);
            }, [patternType]);
            method("|", function(self, other) {
                return calln(call(prelude, "OrPattern", self),
                    "new", self)(self, other);
            }, [patternType]);
        }),
        string: primitiveObject(function(method) {
            method("==", function(self, other) {
                if (!asBoolean(stringType.match(other))) {
                    return false;
                }
                return self === asString(other);
            }, [objectType]);
            method("++", function(self, other) {
                return self + asString(other);
            }, [objectType]);
            method("at", function(self, index) {
                return self.charAt(asNumber(index - 1));
            }, [numberType]);
            method("size", function(self) {
                return self.length;
            });
            method("replace()with", function(self, what, wth) {
                what = new RegExp(asString(what).replace(/(.)/g, '\\$1'), 'g');
                return self.replace(what, asString(wth));
            }, [stringType], [stringType]);
            method("substringFrom()to", function(self, from, to) {
                return self.substring(asNumber(from), asNumber(to));
            }, [numberType], [numberType]);
            method("asString", function(self) {
                return self;
            });
            method("iter", function(self) {
                var i = 0;
                return nativeObject(function(method) {
                    method("havemore", function() {
                        return i < self.length;
                    });
                    method("next", function() {
                        return value.charAt(i++);
                    });
                });
            });
            method("ord", function(self) {
                return self.charCodeAt(0);
            });
            method("hashcode", function(self) {
                var hashCode = 0;
                each(self, function(i) {
                    hashCode *= 23;
                    hashCode += self.charCodeAt(i);
                    hashCode %= 0x100000000;
                });
                return hashCode;
            });
            method("indices", function(self) {
                var indices = [];
                each(self, function(i) {
                    indices.push(number(i + 1));
                });
                return indices;
            });
            method("asNumber", function(self) {
                // What happens if it doesn't match?
                return number(Number(self));
            });
            method("match", function(self, other) {
                if (!asBoolean(stringType.match(other))) {
                    return failedMatch(other);
                }
                return self == asString(other) ? successfulMatch(other) :
                    failedMatch(other);
            }, [objectType]);
            method("&", function(self, other) {
                return calln(call(prelude, "AndPattern", self),
                    "new", self)(self, other);
            }, [patternType]);
            method("|", function(self, other) {
                return calln(call(prelude, "OrPattern", self),
                    "new", self)(self, other);
            }, [patternType]);
        }),
        'function': primitiveObject(function(method) {
            method("apply", function(self, args) {
                if (asNumber(args.length) < self.length) {
                    throw "Incorrect number of arguments."
                }
                return self.apply(null, args);
            }, varargs(objectType));
            method("match", function(self, value) {
                if (self.pattern) {
                    return calln(self.pattern, "match", self)(value);
                }

                return successfulMatch(value);
            }, [objectType]);
            method("pattern", function() {});
        }),
        // The only primitive object in this system is the array.
        array: primitiveObject(function(method) {
            method("==", function(self, other) {
                if (!asBoolean(listType.match(other))) {
                    return false;
                }

                other = asList(other);

                if (self.length !== other.length) {
                    return false;
                }

                return !each(self, function(i) {
                    if (asBoolean(callWith(self[i], "==", self)(other[i]))) {
                        return true;
                    }
                });
            }, [objectType]);
            method("concat", function(self, other) {
                return self.concat(asArray(other));
            }, [listType]);
            method("size", function(self) {
                return self.length;
            });
            method("at", function(self, index) {
                return self[asNumber(index) - 1];
            }, [numberType]);
            method("at()put", function(self, index, value) {
                self[asNumber(index) - 1] = value;
            }, [numberType], [objectType]);
            method("contains", function(self, value) {
                each(self, function(i, el) {
                    if (asBoolean(callWith(el, "==", self)(value))) {
                        return true;
                    }
                }) || false;
            }, [objectType]);
            method("iter", function(self) {
                var i = 0;
                return nativeObject(function(method) {
                    method("havemore", function() {
                        return i < self.length;
                    });
                    method("next", function() {
                        return self[i++];
                    });
                });
            });
            method("push", function(self, value) {
                self.push(value);
            }, [objectType]);
            method("pop", function(self) {
                return self.pop();
            });
            method("first", function(self) {
                return self[0];
            });
            method("last", function(self) {
                return self[self.length - 1];
            });
            method("prepended", function(self, value) {
                return [value].concat(self);
            });
            method("indices", function(self) {
                var indices = [];
                each(self, function(i) {
                    indices.push(i + 1);
                });
                return indices;
            });
            method("asString", function(self) {
                var str = "[";
                each(self, function(i, value) {
                    str += asString(value) + ",";
                });
                return str.substring(0, str.length - 1) + "]";
            });
        })
    };

    primitives.string['[]'] = primitives.string.at;
    primitives.array['[]'] = primitives.array.at;


    // Grace type.
    function newType() {
        var names = arguments;
        return nativeObject(function(method) {
            method("match", function(obj) {
                return typeMatch(names, obj);
            }, [objectType]);
        });
    }


    // Var args notifier.
    function VarArgs(args) {
        extend(this, args);
        this.length = args.length;
    }


    // Grace exceptions.
    function AbstractError(name, message) {
        this.stack = [];
        extend(this, nativeObject(function(method) {
            method("name", function() {
                return name;
            });
            method("message", function() {
                return message;
            });
            method("asString", function() {
                return name + ": " + message;
            });
        }));
    }

    AbstractError.prototype = new Object();

    function Error(name, message) {
        AbstractError.call(this, name, message);
    }

    Error.prototype = new AbstractError();

    var errorMatch = nativeObject(function (method) {
        method("match", function(value) {
            return value instanceof Error ? successfulMatch(value) :
                failedMatch(value);
        }, [objectType]);
    });

    function newExceptionFactory(name, Extend) {
        function Exception(message) {
            AbstractError.call(this, name, message);
        }

        Exception.prototype = new Extend();

        var self = nativeObject(function(method) {
            method("name", function() {
                return name;
            });
            method("raise", function(message) {
                throw new Exception(message);
            }, [stringType]);
            method("refine", function(name) {
                return extend(newExceptionFactory(name, Exception), self);
            }, [stringType]);
            method("asString", function() {
                return name;
            });
            method("match", function(value) {
                return value instanceof Exception ? successfulMatch(value) :
                    failedMatch(value);
            }, [objectType]);
        });
        return self;
    }


    // Return jump wrapper.
    function Return() {}

    Return.prototype.toString = function() {
        return "Return invoked outside of containing method";
    };

    // Constructs a method with the given access annotation and function. Also
    // takes information about the signature of the method.
    function defineMethod(object, name, func, access) {
        var kind = arguments[4], sliceAt = 5;
        if (typeof kind !== "string")  {
            sliceAt = 4;
            kind = "method";
        }

        var params = slice.call(arguments, sliceAt);
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
                    if (!(e instanceof Return || e instanceof AbstractError)) {
                        e = new Error("InternalError", e.toString());
                    }

                    if (e instanceof AbstractError) {
                        //e.stack.push(line);
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
                    var e = new Error("ArgumentError",
                        "Incorrect number of arguments for method " + name);
                    throw e;
                }

                var argList = slice.call(arguments, 0, length);

                args = args === null ? argList : args.concat(argList);

                if (isVarargs) {
                    args.push(slice.call(arguments, length));
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
        signature.kind = kind;
        signature.type = params;

        object[name] = signature;
    }

    function doneAsDebugString() {
        return "done";
    }

    function call() {
        return calln.apply(this, arguments)();
    }

    function calln() {
        arguments[3] = '<native>';
        return callWith.apply(this, arguments);
    }

    function callWith(object, name, context, line) {
        var type = typeOf(object);

        if (type === "undefined") {
            if (name === "asDebugString") {
                return doneAsDebugString;
            }

            var ex = new Error("DoneError",
                "Cannot perform action on done");
            ex.stack.push(line);
            throw ex;
        }

        if (!hasPublicMethod(object, name)) {
            if (object[name] != null) {
                if (context !== object) {
                    var access = object[name].access || "confidential";
                    var ex = new Error("MethodAccessError",
                        "Improper access to " + access + "method " + name);
                    ex.stack.push(line);
                    throw ex;
                }
            } else {
                var ex = new Error("NoSuchMethodError",
                    "No such method " + name);
                ex.stack.push(line);
                throw ex;
            }
        }

        // Native Javascript setter.
        if (!(object instanceof Object) && object[name] == null &&
                name.substring(name.length - 2) === ":=") {
            var pname = name.substring(0, name.length - 2);
            if ((/^[A-z\d']+$/).test(name.substring(0, name.length - 2))) {
                return function(value) {
                    object[pname] = value;
                }
            }
        }

        if (type !== "object" &&
                (object[name] == null || object[name].access == null) ||
                typeof object[name] === "undefined") {
            var prim = primitives[type];
            var method = prim && hasOwnProperty(prim, name) ? prim[name] :
                objectMethods[name];

            return function() {
                splice.call(arguments, 0, 0, object);
                return method.apply(null, arguments);
            };
        }

        // Native Javascript getter.
        if (!(object instanceof Object) &&
                typeof object[name] !== "function") {
            return function() {
                return typeof object[name] === "undefined" ? null :
                    object[name];
            }
        }

        return object[name];
    }


    /** Prelude definitions ***************************************************/

    var prelude = nativeObject(function(method, getter) {
        getter("done", done);

        method("print", print, [objectType]);

        method("if()then", function(condition, thenBlock) {
            if (asBoolean(condition)) {
                return call(thenBlock, "apply", prelude);
            }
        }, [booleanType], [blockType]);

        method("if()then()else", function(condition, thenBlock, elseBlock) {
            if (asBoolean(condition)) {
                return call(thenBlock, "apply", prelude);
            }
            return call(elseBlock, "apply", prelude);
        }, [booleanType], [blockType], [blockType]);

        method("for()do", function(iterable, block) {
            var iterator = call(iterable, "iter");
            while (asBoolean(call(iterator, "havemore"))) {
                callWith(block, "apply", prelude)(
                    call(iterator, "next", prelude));
            }
        }, [iterableType], [blockType]);

        method("while()do", function(condition, block) {
            while (asBoolean(call(condition, "apply", prelude))) {
                call(block, "apply", prelude);
            }
        }, [blockType], [blockType]);

        method("match()case", function(value, cases) {
            var result;
            each(cases, function(i, block) {
                if (asBoolean(calln(block, "match", prelude)(value))) {
                    result = calln(block, "apply", prelude)(value);
                    return true;
                }
            });
            return result;
        }, [objectType], varargs(blockType));

        method("match()case()else", function(value, cases, elsec) {
            var result, found = false;
            each(cases, function(i, block) {
                if (asBoolean(calln(block, "match", prelude)(value))) {
                    found = true;
                    result = calln(block, "apply", prelude)(value);
                    return true;
                }
            });
            return found ? result : call(elsec, "apply", "prelude");
        }, [objectType], varargs(blockType), [blockType]);

        method("catch()case", function(block, cases) {
            try {
                call(block, "apply", prelude);
            } catch (e) {
                calln(prelude, "match()case()else", prelude)(e)
                    .apply(null, cases)(function() { throw e; });
            }
        }, [blockType], varargs(blockType));

        method("catch()case()finally", function(block, cases, fin) {
            try {
                call(block, "apply", prelude);
            } catch (e) {
                calln(prelude, "match()case()else", prelude)(e)
                    .apply(null, cases)(function() { throw e; });
            } finally {
                call(fin, "apply", prelude);
            }
        }, [blockType], varargs(blockType), [blockType]);

        getter("Error", errorMatch);
        getter("Exception", newExceptionFactory("Exception", AbstractError));

        function convertType(type) {
            if (type.names) {
                return newType.apply(null, type.names);
            }

            var a = convertType(type.a), b = convertType(type.b);
            var kind = type instanceof NativeAnd ? "And" : "Or";
            var cls  = call(prelude, kind + "Pattern", prelude);
            return calln(cls, "new", prelude)(a, b);
        }

        for (var name in nativeTypes) {
            (function(type) {
                if (type.names) {
                    getter(name, convertType(type));
                } else {
                    method(name, function() {
                        return convertType(type);
                    });
                }
            })(nativeTypes[name]);
        }
    });


    /** Native modules in the standard library ********************************/

    var io = nativeObject(function(method, getter) {
        var fs  = require('fs');
        var tty = require('tty');

        function newFile(path, flags) {
            path  = asString(path);
            flags = asString(flags);

            var fd   = fs.openSync(path, flags);
            var pos  = 0;
            var buf  = new Buffer(1);
            var self = nativeObject(function(method) {
                method("close", function() {
                    fs.closeSync(fd);
                });
                method("write", function(data) {
                    var buf = new Buffer(asString(data));
                    var len = data.length;
                    fs.writeSync(fd, buf, 0, len, pos);
                    pos += len;
                }, [stringType]);
                method("getline", function() {
                    var out = "";
                    while (!isEof()) {
                        fs.readSync(fd, buf, 0, 1, pos++);
                        var char = buf.toString();
                        if (char === "\n") {
                            return out;
                        }
                        out += char;
                    }

                    return out;
                });
                method("read", function() {
                    if (pos === 0) {
                        return fs.readFileSync(path).toString();
                    }

                    var out = "";
                    while (!isEof()) {
                        fs.readSync(fd, buf, 0, 1, pos++);
                        out += buf.toString();
                    }

                    return out;
                });
                method("readBinary", function() {
                    fs.readSync(fd, buf, 0, 1, pos++);
                    return buf.readUInt8(0);
                });
                method("writeBinary", function(bytes) {
                    var size = asNumber(call(bytes, "size", self));
                    var buf = new Buffer(size);
                    calln(prelude, "for()do", self)(bytes)(function(byte) {
                        buf.writeUInt8(byte);
                    });
                    if (!fs.writeSync(fd, buf, 0, size, pos++)) {
                        throw new Error("IOError", "Failed to write to file");
                    }
                }, [objectType]);

                function seek(by) {
                    pos += asNumber(by).floor();
                }

                method("seek", seek, [numberType]);
                method("seekForward", seek, [numberType]);
                method("seekBackward", function(by) {
                    seek(call(by, "prefix-", self));
                }, [numberType]);

                function isEof() {
                    return !Boolean(fs.readSync(fd, buf, 0, 1, pos));
                }

                method("iter", function() {
                    return self;
                });
                method("havemore", function() {
                    return !isEof();
                });
                method("next", function() {
                    fs.readSync(fd, buf, 0, 1, pos++);
                    return buf.toString();
                });

                method("eof", function() {
                    return isEof();
                });
                method("isatty", function() {
                    return tty.isatty(fd);
                });
            });

            return self;
        }

        var childp = require('child_process');

        function newProcess() {
            return nativeObject(function(method) {
                method("wait");
                method("status");
                method("success");
                method("terminated");
            });
        }

        getter("input", process.stdin);
        getter("output", process.stdout);
        method("error", function(message) {
            throw new Error("IOError", message);
        }, [stringType]);
        method("open", function(path, flags) {
            return newFile(path, flags);
        }, [stringType, stringType]);
        method("system");
        method("newer");
        method("exists", function(path) {
            return fs.existsSync(path);
        }, [stringType]);
        method("realpath");
        method("spawn", function() {
            return newProcess();
        });
        method("spawnv", function() {
            return newProcess();
        });
    });

    var sys = nativeObject(function(method, getter) {
        method("argv", function() {
            return process.argv;
        });
        method("cputime", function() {
            return Date.now();
        });
        method("elapsed", function() {
            return process.uptime();
        });
        method("exit", function(code) {
            process.exit(code);
        }, [numberType]);
        getter("execPath", process.execPath);
    });

    var js = nativeObject(function(method, getter) {
        getter("global", global);
    });


    /** Global grace export ***************************************************/

    var grace = {
        method:  defineMethod,
        call:    callWith,
        object:  function(self, outer, func, inherits) {
            var obj;

            if (arguments.length === 3) {
                obj = new Object();
            } else {
                var type = typeof inherits;
                if (type === "undefined") {
                    throw new Error("DoneError", "Cannot extend done.");
                }

                if (type !== "object" || type !== "function") {
                    obj = valueOf.call(inherits);
                } else {
                    obj = inherits;
                }
            }

            function Outer() {
                defineMethod(self, "outer", function() {
                    return outer;
                }, "public", "def");
            }
            Outer.prototype = self;

            var $super = {};
            for(var name in obj) {
                $super[name] = obj[name];
            }

            func(obj, new Outer(), $super);
            return obj;
        },
        type:    newType,
        varargs: varargs,
        pattern: function(func, pattern) {
            var block = function(arg) {
                var result = calln(block, "match", block)(arg);
                if (!asBoolean(result)) {
                    throw new Error("MatchError",
                        "Applied non-matching value to pattern block.")
                }

                return func.apply(null, call(result, "bindings", block));
            };
            block.pattern = pattern;
            return block;
        },
        prelude: prelude,
        modules: {
            io:  io,
            sys: sys,
            js:  js
        }
    };

    if (typeof module === "undefined") {
        global.grace = grace;
    } else {
        module.exports = grace;
    }

})();

