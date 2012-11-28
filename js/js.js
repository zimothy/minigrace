module.exports = nativeObject(function(method, getter) {
    getter("global", global);

    method("call()with", function(name, args) {
        return global[name].apply(null, args);
    }, [stringType], varargs(objectType));

    // Intended for accessing methods as Javascript functions.
    // Note that it also works on normal Grace objects.
    method("getFrom()property", function(object, name) {
        return object[name];
    }, [objectType], [stringType]);
});

