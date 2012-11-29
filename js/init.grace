import js
import mgcollections

def compiler = js.global.grace.modules["compiler"]
def jQuery   = js.global["jQuery"]
def eval     = js.global["eval"]

method q(value) {
    jQuery.apply(value)
}

q({
    q("#compile").on("click", { compile })
    q("#run").on("click", { run })
    q("#compile-and-run").on("click", {
        compile
        run
    })

    q("#test-cases").on("change", { loadTestCase })
})

method compile {
    def source = q("#source").val
    def target = q("#target").val

    def stdout = q("#stdout").val("")
    def stderr = q("#stderr").val("")

    def extensions = mgcollections.map.new

    def defaultVisibility = q("#default-visibility").val

    if(defaultVisibility == "public-methods") then {
        extensions.put("DefaultVisibility", "confidential")
        extensions.put("DefaultMethodVisibility", "public")
    } elseif(defaultVisibility == "public") then {
        extensions.put("DefaultVisibility", "public")
    }

    compiler.reload
    catch {
        compiler.apply
    } case { e : Exception ->
        print(e)
    }
}

method run {
    eval.apply(q("#output").val)
}

method loadTestCase {}

