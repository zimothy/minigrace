import "dom"           as dom
import "js"            as js
import "mgcollections" as collections

def compiler = js.global.grace.modules["compiler"]

dom.onReady {
    dom.getById("compile").on("click") do { compile }
    dom.getById("run").on("click") do { run }
    dom.getById("compile-and-run").on("click") do {
        compile
        run
    }

    dom.getById("test-cases").on("change") do { loadTestCase }
}

method compile {
    def source = dom.getById("source").value
    def target = dom.getById("target").value

    def stdout = dom.getById("stdout")
    def stderr = dom.getById("stderr")

    stdout.value := ""
    stderr.value := ""

    def extensions = collections.map.new

    def defaultVisibility = dom.getById("default-visibility").value

    if(defaultVisibility == "public-methods") then {
        extensions.put("DefaultVisibility", "confidential")
        extensions.put("DefaultMethodVisibility", "public")
    } elseif(defaultVisibility == "public") then {
        extensions.put("DefaultVisibility", "public")
    }

    compiler.reload
    catch {
        //compiler.apply
    } case { e : Exception ->
        print(e)
    }
}

method run {
    js.eval(dom.getById("output").value)
}

method loadTestCase {}

