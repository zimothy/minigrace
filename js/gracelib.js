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
            defineMethod(object, name, function() { return value; }, "public");
        });
        return object;
    }

    // Wraps the constructor into a Grace class, using new as the class method.
    // TODO Do the arguments need to be passed to the Constructor?
    function makeClass(Constructor, types) {
        return nativeObject(function(method) {
            method("new", function() {
                return new Contructor();
            }, types);
        });
    }

    var hasOwnProperty = global.Object.prototype.hasOwnProperty;

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
    function hasPublicMethod(obj, name) {
        var type = typeof obj;
        if (type !== "object" || obj instanceof Array) {
            return name === "asDebugString" || name === "asString" ||
                name === "==" || name === "!=" ||
                primitives[type][name] != null;
        }

        return obj[name] != null && (obj[name].access === "public" ||
            typeof obj[name].access === "undefined");
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
        if (typeof value === "boolean" || value instanceof Boolean) {
            return value.valueOf();
        }

        var result = false;
        value.andAlso(function() {
            result = true;
        });

        return result;
    }

    function asNumber(value) {
        if (typeof value === "number" || value instanceof Number) {
            return value.valueOf();
        }

        throw new Exception("NativeTypeException",
            "Cannot retrieve native number");
    }

    function asString(value) {
        if (typeof value === "string" || value instanceof String) {
            return value.valueOf();
        }

        var string = hasPublicMethod(value, "asString") ?
            call(value, "asString") : call(value, "asDebugString");

        if (typeof string === "string") {
            return string;
        }

        throw new Exception("NativeTypeException",
            "Cannot retrieve native string");
    }

    function asArray(value) {
        if (value instanceof Array) {
            return value;
        }

        if (!(hasPublicMethod(value, "size") &&
                hasPublicMethod(value, "at"))) {
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
        var test = obj, type = typeof obj;
        if (type !== "object" || obj instanceof Array) {
            test = primitives[type];
        }

        var failed = each(names, function(i, name) {
            if (!hasPublicMethod(test, name)) {
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


    // Grace object constructor.
    function Object() {
        var self = this;
        // Temporary: this should be moved into the prelude.
        defineMethod(self, "print", print, "public", [objectType]);
        defineMethod(self, "==", function(other) {
            if (self === other) {
                return true;
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
        }, "public", [objectType]);
        defineMethod(self, "!=", function(other) {
            var equal = calln(self, "==", self)(other);
            return call(equal, "not", self);
        }, "public", [objectType]);
        defineMethod(self, "asString", function() {
            return call(self, "asDebugString", self);
        }, "public");
        defineMethod(self, "asDebugString", function() {
            // TODO Actually describe the object.
            return "object {}";
        }, "public");
    }

    Object.prototype = null;


    // Primitive function helper.
    function primitiveObject(func) {
        return nativeObject(function(method) {
            method("==", function (self, other) {
                return self === other;
            }, [objectType, objectType]);
            method("!=", function(self, other) {
                var equal = calln(self, "==", self)(other);
                return call(equal, "not", self);
            }, [objectType, objectType]);
            method("asString", function(self) {
                return call(self, "asDebugString", self);
            }, [objectType]);
            method("asDebugString", function(self) {
                return self.toString();
            }, [objectType]);

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
                return new GraceAndPattern(self, other);
            }, [patternType]);
            method("|", function(self, other) {
                return new GraceOrPattern(self, other);
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
            method("|", function(self, other) {
                var or = call(prelude, "GraceOrPattern", self);
                return callWith(or, "new", self)(self, other);
            }, [patternType]);
            method("&", function(self, other) {
                var and = call(prelude, "GraceOrPattern", self);
                return callWith(and, "new", self)(self, other);
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
            method("|", function(self, other) {
                var or = call(prelude, "GraceOrPattern", self);
                return callWith(or, "new", self)(self, other);
            }, [patternType]);
            method("&", function(self, other) {
                var and = call(prelude, "GraceOrPattern", self);
                return callWith(and, "new", self)(self, other);
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
        object: primitiveObject(function(method) {
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
            method("prepended", function(self) {
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
    primitives.object['[]'] = primitives.object.at;


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
    function Exception(name, message) {
        this._stack = [];
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

    Exception.prototype = new Object();

    function newExceptionFactory(name) {
        var self = nativeObject(function(method) {
            method("name", function() {
                return name;
            });
            method("raise", function(message) {
                throw new Exception(name, message);
            });
            method("refine", function(name) {
                return extend(newExceptionFactory(name), self);
            });
            method("asString", function() {
                return name;
            });
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
                    if (!(e instanceof Return || e instanceof Exception)) {
                        e = new Exception("InternalException", e.toString());
                    }

                    if (e instanceof Exception) {
                        // e._stack.push(line);
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

    function call() {
        return calln.apply(this, arguments)();
    }

    function calln() {
        arguments[3] = '<native>';
        return callWith.apply(this, arguments);
    }

    function callWith(object, name, context, line) {
        var type = typeof object;

        if (typeof object[name] !== "function" || type !== "object" ||
                object instanceof Array && object[name].access == null) {

            if (object instanceof Boolean) {
                type = "boolean";
            } else if (object instanceof Number) {
                type = "number";
            } else if (object instanceof String) {
                type = "string";
            } else if (object instanceof Function) {
                type = "function";
            }

            if (type !== "object" || object instanceof Array) {
                if (type === "undefined") {
                    var ex = new Exception("DoneException",
                        "Cannot perform action on done");
                    ex._stack.push(line);
                    throw ex;
                }

                if (primitives[type][name] == null) {
                    var ex = new Exception("NoSuchMethodException",
                        "No such method " + name);
                    ex._stack.push(line);
                    throw ex;
                }

                var method = primitives[type][name];

                return function() {
                    splice.call(arguments, 0, 0, object);
                    return method.apply(null, arguments);
                };
            }

            var ex = new Exception("NoSuchMethodException",
                "No such method " + name);
            ex._stack.push(line);
            throw ex;
        }

        var method = object[name];

        if (!hasPublicMethod(object, name) && context !== object) {
            var ex = new Exception("MethodAccessException",
                "Improper access to confidential method " + name);
            ex._stack.push(line);
            throw ex;
        }

        return method;
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

        method("match()case()else", function(value, cases) {
            var elsec = cases.splice(cases.length - 1, 1);
            var found = false;
            var value = each(cases, function(i, block) {
                if (asBoolean(calln(block, "match", prelude)(value))) {
                    found = true;
                    return calln(block, "apply", prelude)(value);
                }
            });
            return found ? value : call(elsec, "apply", "prelude");
        }, [objectType], varargs(blockType));

        getter("Exception", newExceptionFactory("Exception"));

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

    // TODO These modules for browser and Node.js


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
                    throw new Exception("DoneException", "Cannot extend done.");
                }

                if (type !== "object" || type !== "function") {
                    obj = valueOf.call(inherits);
                } else {
                    obj = inherits;
                }
            }

            function Outer() { this.outer = function() { return outer; }; };
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
                    throw new Exception("MatchException",
                        "Applied non-matching value to pattern block.")
                }

                return func.apply(null, call(result, "bindings", block));
            };
            block.pattern = pattern;
            return block;
        },
        prelude: prelude,
    };

    if (typeof module === "undefined") {
        grace.modules = {};
        global.grace = grace;
    } else {
        module.exports = grace;
    }

})();

