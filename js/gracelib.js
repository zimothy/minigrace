(function() {

    /** Helpers ***************************************************************/

    var global = this;
    var slice  = Array.prototype.slice;

    // Wraps the given constructor to avoid using the `new` keyword.
    function construct(Constructor) {
        return function(arg) {
            return new Constructor(arg);
        }
    }

    // Constructs a Grace Type object from the given constructor's prototype.
    function makeType(Constructor) {
        return new Type(Constructor.prototype);
    }

    // Creates and extends a new prototype object.
    function extend(Prototype, from) {
        var name, object;

        object = new Prototype();
        for (name in from) {
            object[name] = from[name];
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
        if (value instanceof Boolean) {
            return value._value;
        }

        var result = false;
        value.andAlso(block(function() {
            result = true;
        }));

        return result;
    }

    function asNumber(value) {
        if (value instanceof Number) {
            return value._value;
        }

        return parseInt(asString(value), 10);
    }

    function asString(value) {
        return value.asString()._value;
    }


    /** Prelude definitions ***************************************************/

    var print = (function() {
        if (typeof console === "object" && typeof console.log === "function") {
            return method(function(value) {
                console.log(asString(value));
                return done;
            }, "native", 1);
        } else {
            return method(function() {
                return done;
            }, "native", 1);
        }
    })();

    var for_do = method(function(iterable, block) {
        var iterator = iterable.iter();
        while (asBoolean(iterator.havemore())) {
            block.apply(iterator.next());
        }
        return done;
    }, "native", 1, 1);

    var while_do = method(function(condition, block) {
        while (asBoolean(condition.apply())) {
            block.apply();
        }
        return done;
    }, "native", 1, 1);


    /** Native objects ********************************************************/

    // Singleton and constructor wrapper definitions.
    var done   = new Done();
    var object = construct(Object);

    function bool(value) {
        return value ? Boolean['true'] : Boolean['false'];
    }

    var number = construct(Number);
    var string = construct(String);
    var block  = construct(Block);

    function list(values) {
        return new List(values instanceof Array ? values :
            slice.call(arguments, 0));
    }

    var varargs = construct(VarArgs);


    // Grace done constructor.
    function Done() {}

    Done.prototype = null;

    // Grace object constructor.
    function Object() {}

    Object.prototype = extend(Done, {

        // Temporary: this should be moved into the prelude.
        print: print,

        '==': method(function(other) {
            return bool(this === other);
        }, "native", 1),
        '!=': method(function(other) {
            return this['=='].not();
        }, "native", 1),
        asString: method(function() {
            return this.asDebugString();
        }, "native", 1),
        asDebugString: method(function() {
            return "object {}";
        }, "native", 1)
    });


    // Grace boolean constructor.
    function Boolean(value) {
        this._value = value;
    }

    Boolean.prototype = extend(Object, {
        '==': method(function(other) {
            return this._value === asBoolean(other);
        }, "native", 1),
        not: method(function() {
            return bool(!this._value);
        }, "native", 0),
        'prefix!': method(function() {
            return bool(!this._value);
        }, "native", 0),
        '&': method(function(other) {
            return new GraceAndPattern(this, other);
        }, "native", 1),
        '|': method(function(other) {
            return new GraceOrPattern(this, other);
        }, "native", 1),
        '&&': method(function(other) {
            return !this._value ? this : other.apply ? other.apply() : other;
        }, "native", 1),
        '||': method(function(other) {
            return this._value ? this : other.apply ? other.apply() : other;
        }, "native", 1),
        andAlso: method(function(other) {
            return this._value ? other.apply() : this;
        }, "native", 1),
        orElse: method(function(other) {
            return this._value ? this : other.apply();
        }, "native", 1),
        asString: method(function() {
            return string(this._value);
        }, "native", 0),
        'match()matchesBinding()else': method(function(pat, b, e) {
            return pat['matchObject()matchesBinding()else'](this)(b)(e);
        }, "native", 1, 1, 1),
        match: method(function(other) {
            return asBoolean(this['=='](other)) ? match(other) : fail(other);
        }, "native", 1)
    });

    Boolean['true']  = new Boolean(true);
    Boolean['false'] = new Boolean(false);


    // Grace number constructor.
    function Number(value) {
        this._value = value;
    }

    Number.prototype = extend(Object, {
        '==': method(function(other) {
            return this._value === asNumber(other);
        }, "native", 1),
        '+': method(function(other) {
            return number(this._value + asNumber(other));
        }, "native", 1),
        '-': method(function(other) {
            return number(this._value - asNumber(other));
        }, "native", 1),
        '*': method(function(other) {
            return number(this._value * asNumber(other));
        }, "native", 1),
        '/': method(function(other) {
            return number(this._value / asNumber(other));
        }, "native", 1),
        '%': method(function(other) {
            return number(this._value % asNumber(other));
        }, "native", 1),
        '++': method(function(other) {
            return string(this._value + asString(other));
        }, "native", 1),
        "..": method(function(other) {
            var from = this._value;
            var to   = asNumber(other);
            if (to < from) {
                from = to;
                to = this._value;
            }
            
            var range = [];

            for (; from <= to; from++) {
                range.push(number(from));
            }

            return list(range);
        }, "native", 1),
        '<': method(function(other) {
            return number(this._value < asNumber(other));
        }, "native", 1),
        '>': method(function(other) {
            return number(this._value < asNumber(other));
        }, "native", 1),
        '<=': method(function(other) {
            return number(this._value <= asNumber(other));
        }, "native", 1),
        '>=': method(function(other) {
            return number(this._value >= asNumber(other));
        }, "native", 1),
        'prefix-': method(function() {
            return number(-this._value);
        }, "native", 0),
        asString: method(function() {
            return string(this._value);
        }, "native", 0),
        hashcode: method(function() {
            return number(this._value * 10);
        }, "native", 0),
        'match()matchesBinding()else': method(function(pat, b, e) {
            return pat['matchObject()matchesBinding()else'](this)(b)(e);
        }, "native", 1, 1, 1),
        'matchObject()matchesBinding()else': method(function(obj, b, e) {
            (asBoolean(this['=='](obj)) ? b : e).apply(obj);
        }, "native", 1, 1, 1),
        inBase: method(function(other) {
            return string(this._value.toString(asNumber(other)))
        }, "native", 1),
        truncate: method(function() {
            return number((this._value < 0 ?
                Math.ceil : Math.floor)(this._value));
        }, "native", 0),
        match: method(function(other) {
            return asBoolean(this['=='](other)) ? match(other) : fail(other);
        }, "native", 1),
        '|': method(function(other) {
            return new GraceOrPattern(this, other);
        }, "native", 1),
        '&': method(function(other) {
            return new GraceAndPattern(this, other);
        }, "native", 1)
    });


    // Grace string constructor.
    function String(value) {
        this._value = value;
    }

    String.prototype = extend(String, {
        '==': method(function(other) {
            if (this === other) {
                return Boolean['true'];
            }

            return this._value === asString(other);
        }, "native", 1),
        '++': method(function(other) {
            return string(this._value + asString(other));
        }, "native", 1),
        at: method(function(index) {
            return string(this._value.charAt(asNumber(index)));
        }, "native", 1),
        size: method(function() {
            return number(this._value.length);
        }, "native", 0),
        'replace()with': method(function(what, wth) {
            what = new RegExp(what.replace(/(.)/g, '\\$1'), 'g');
            return string(this._value.replace(what, wth));
        }, "native", 1, 1),
        'substringFrom()to': method(function(from, to) {
            from = asNumber(from);
            to = asNumber(to);
            return string(this._value.substring(from, to));
        }, "native", 1, 1),
        asString: method(function() {
            return this;
        }, "native", 0),
        iter: method(function() {
            var i     = 0;
            var value = this._value;

            return {
                havemore: method(function() {
                    return bool(i < value.length);
                }, "native", 0),
                next: method(function() {
                    return string(value.charAt(i++));
                }, "native", 0)
            };
        }, "native", 0),
        ord: method(function() {
            return number(this._value.charCodeAt(0));
        }, "native", 0),
        hashcode: method(function() {
            var hashCode = 0;
            each(this._value, function(i) {
                hashCode *= 23;
                hashCode += this._value.charCodeAt(i);
                hashCode %= 0x100000000;
            });

            return number(hashCode);
        }, "native", 0),
        'match()matchesBinding()else': method(function(pat, b, e) {
            return pat['matchObject()matchesBinding()else'](this)(b)(e);
        }, "native", 1, 1, 1),
        'matchObject()matchesBinding()else': method(function(obj, b, e) {
            return (asBoolean(this['=='](obj)) ? b : e).apply(obj);
        }, "native", 1, 1, 1),
        indices: method(function() {
            var indices = [];
            each(this._value, function(i) {
                indices.push(number(i + 1));
            });

            return list(indices);
        }, "native", 0),
        asNumber: method(function() {
            return number(Number(this._value));
        }, "native", 0),
        match: method(function(other) {
            return asBoolean(this['=='](other)) ? match(other) : fail(other);
        }, "native", 1),
        '|': method(function(other) {
            return new GraceOrPattern(this, other);
        }, "native", 1),
        '&': method(function(other) {
            return new GraceAndPattern(this, other);
        }, "native", 1)
    });

    String.prototype['[]'] = String.prototype.at;


    // Grace block constructor.
    function Block(value) {
        this._value = value;
    }

    Block.prototype = extend(Object, {
        apply: method(function(args) {
            if (asNumber(args.size()) < this._value.length) {
                throw "Incorrect number of arguments."
            }

            return this._value.apply(null, args._value);
        }, "native", varargs(1)),
        match: method(match, "native", 1)
    });


    // Grace list constructor.
    function List(values) {
        this._value = values;
    }

    List.prototype = extend(Object, {
        '==': method(function(other) {
            var i, iter, length, list;

            list   = this._value;
            length = list.length;

            if (!has(other, 'size') || !has(other, 'at') ||
                    asNumber(other.size()) !== length) {
                return Boolean['false'];
            }

            if (each(list, function(i, value) {
                if (asBoolean(value['!='](other.at(i)))) {
                    return true;
                }
            })) {
                return Boolean['false'];
            }

            return Boolean['true'];
        }, "native", 1),
        size: method(function() {
            return number(this._value.length);
        }, "native", 0),
        at: method(function(index) {
            return this._value[index - 1];
        }, "native", 1),
        'at()put': method(function(index, value) {
            this._value[index - 1] = value;
            return done;
        }, "native", 1, 1),
        contains: method(function(value1) {
            if (each(this._value, function(i, value2) {
                if (asBoolean(value2['=='](value1))) {
                    return true;
                }
            })) {
                return Boolean['true'];
            }

            return Boolean['false'];
        }, "native", 1),
        iter: method(function() {
            var i, value;

            i = 0;
            value = this._value;

            return {
                havemore: method(function() {
                    return bool(i < value.length);
                }, "native", 0),
                next: method(function() {
                    return value[i++];
                }, "native", 0)
            };
        }, "native", 0),
        push: method(function(value) {
            this._value.push(value);
            return done;
        }, "native", 1),
        pop: method(function() {
            return this._value.pop();
        }, "native", 0),
        first: method(function() {
            return this._value[0];
        }, "native", 0),
        last: method(function() {
            return this._value[this._value.length - 1];
        }, "native", 0),
        prepended: method(function() {
            return list([value].concat(this._value));
        }, "native", 0),
        indices: method(function() {
            var indices;

            indices = [];
            each(this._value, function(i) {
                indices.push(i);
            });

            return list(indices);
        }, "native", 0),
        asString: method(function() {
            var str = "[";
            each(this._value, function(i, value) {
                str += asString(value) + ",";
            });

            return string(str.substring(0, str.length - 1) + "]");
        }, "native", 0)
    });


    // TODO
    function Type() {}


    // Var args notifier.
    function VarArgs(value) {
        this.value = value;
    }

    VarArgs.prototype.valueOf = function() {
        return this.value;
    }


    // Matching constructs.
    function match() {}
    function fail() {}


    // Constructs a method with the given access annotation and function. Also
    // takes information about the signature of the method.
    function method(func, access) {
        var params = slice.call(arguments, 2);

        function Return(value) {
            this.value = value;
        }
        Return.prototype.toString = returnToString;

        function localReturn(value) {
            throw new Return(value);
        }

        function methodFunc(self, args) {
            if (access === "native") {
                return func.apply(self, args);
            }

            // try {
                return func.apply(localReturn, args);
            // } catch (e) {
            //     if (e instanceof Return) {
            //         return e.value;
            //     } else {
            //         throw e;
            //     }
            // }
        }

        function makeSignature(i) {
            if (i >= params.length) {
                return null;
            }

            var length  = params[i];
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


    // Standard toString method for Return objects.
    function returnToString() {
        return "Bad return location";
    };


    /** Native modules in the standard library ********************************/

    var prelude = {
        Done:        Done,
        done:        done,
        Object:      makeType(Object),
        Boolean:     makeType(Boolean),
        Number:      makeType(Number),
        String:      makeType(String),
        print:       print,
        'for()do':   for_do,
        'while()do': while_do
    };

    // TODO


    /** Global grace export ***************************************************/

    var grace = {
        'native': {
            object:  object,
            'true':  Boolean['true'],
            'false': Boolean['false'],
            number:  number,
            string:  string,
            block:   block,
            list:    list,
            varargs: varargs,
            method:  method
        }, prelude: function() {
            return prelude;
        }
    };

    if (typeof module === "undefined") {
        this.grace = grace;
    } else {
        module.exports = grace;
    }

})();
