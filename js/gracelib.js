(function() {

    /** Helpers ***************************************************************/

    var global = this;
    var slice  = Array.prototype.slice;
    var splice = Array.prototype.splice;

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
            return Boolean(value);
        }

        var result = false;
        value.andAlso(function() {
            result = true;
        });

        return result;
    }

    function asNumber(value) {
        if (typeof value === "number" || value instanceof Number) {
            return Number(value);
        }

        throw new Exception("NativeTypeException",
            "Cannot retrieve native number");
    }

    function asString(value) {
        if (typeof value === "string" || value instanceof String) {
            return String(value);
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
            if (!hasPublicMethod(obj, name)) {
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
            return self === other;
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
                return self === asBoolean(other);
            }, [objectType]);
            method("not", function(self) {
                return !self;
            });
            method("prefix!", function(self) {
                return !self;
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
                return eq ? match(other) : fail(other);
            }, [objectType]);
        }),
        number: primitiveObject(function(method) {
            method("==", function(self, other) {
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
                    return fail(other);
                }
                return self == asNumber(other) ? match(other) : fail(other);
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
                return self === asString(other);
            }, [objectType]);
            method("++", function(self, other) {
                return self + asString(other);
            }, [objectType]);
            method("at", function(self, index) {
                return self.charAt(asNumber(index));
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
                    return fail(other);
                }
                return self == asString(other) ? match(other) : fail(other);
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
            method("match", function(value) {
                return failedMatch(value);
            }, [objectType]);
            method("pattern", function() {});
        }),
        // The only primitive object in this system is the array.
        object: primitiveObject(function(method) {
            method("==", function(self, other) {
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
                    indices.push(i);
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
    function newType(names) {
        return nativeObject(function(method) {
            method("match", function(obj) {
                each(names, function(name) {
                    if (!hasPublicMethod(obj, name)) {
                        return failedMatch(obj);
                    }
                });
                return successfulMatch(obj);
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

        if (typeof object[name] !== "function") {
            var ex = new Exception("NoSuchMethodException",
                "No such method " + name);
            ex._stack.push(line);
            throw ex;
        }

        var method = object[name];

        if (!hasPublicMethod(object, name) && context !== object) {
            console.log(hasPublicMethod(object, name, true));
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
            return elseBlock.apply();
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

        method("match()case", function(value) {
            var cases = slice.call(arguments, 1);
            return each(cases, function(block) {
                if (asBoolean(calln(block, "match", prelude)(value))) {
                    return calln(block, "apply", prelude)(value);
                }
            });
        }, [objectType], varargs(blockType));

        method("match()case()else", function(value) {
            var cases = slice.call(arguments, 1, arguments.length - 1);
            var elsec = arguments[arguments.length - 1];
            var found = false;
            var value = each(cases, function(block) {
                if (asBoolean(calln(block, "match", preldue)(value))) {
                    found = true;
                    return calln(block, "apply", prelude)(value);
                }
            });
            return found ? value : call(elsec, "apply", "prelude");
        }, [objectType], varargs(blockType));

        getter("Exception", newExceptionFactory("Exception"));

        for (var nativeType in nativeTypes) {
            getter(nativeType, newType(nativeTypes[nativeType].names));
        }
    });


    /** Native modules in the standard library ********************************/

    // TODO These modules for browser and Node.js


    /** Global grace export ***************************************************/

    var grace = {
        method:  defineMethod,
        call:    callWith,
        object:  function(outer, func, inherits) {
            var obj;

            if (arguments.length === 2) {
                obj = new Object();
            } else {
                var type = typeof inherits;
                if (type === "undefined") {
                    throw new Exception("DoneException", "Cannot extend done.");
                }

                if (type !== "object" || inherits instanceof Array) {
                    obj = Object.prototype.valueOf.call(inherits);
                    var methods = primitives[type];
                    for (var name in methods) {
                        (function(m) {
                            method.apply(null, [inherits, name, function() {
                                m.apply(null, [inherits].concat(arguments));
                            }, m.access].concat(m.type));
                        })(methods[name]);
                    }
                } else {
                    obj = inherits;
                }
            }

            obj.outer = function() { return outer; };
            func(obj);
            return obj;
        },
        type:    newType,
        varargs: varargs,
        prelude: prelude,
    };

    if (typeof module === "undefined") {
        grace.modules = {};
        global.grace = grace;
    } else {
        module.exports = grace;
    }

})();

