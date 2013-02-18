(function() {
    var global = this, grace, instance, prelude;
    function makeModule() {
        var object = grace.object, method = grace.method,
            varargs = grace.varargs;
        return object(prelude, null, function(self) {
            method(self, "global", function() {
                return global;
            }, "public", "def");
            method(self, "call()with", function(name, args) {
                return global[name].apply(null, args);
            }, "public", [prelude.String()], varargs(prelude.Object()));
            method(self, "eval", function(code) {
                return eval(code);
            }, "public", [prelude.String()]);
        });
    }
    function getInstance() {
        return instance ? instance : instance = makeModule();
    }
    if (typeof module === "undefined") {
        grace = this.grace;
        prelude = grace.prelude;
        grace.modules.js = getInstance;
    } else {
        grace = require("gracelib");
        prelude = require("StandardPrelude");
        module.exports = getInstance();
    }
})();

