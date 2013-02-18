import "js" as js

// DOM elements.
type Elements = {
    on(event : String) do(block : Block)
    value -> String
    value:=(to : String)
}

// Triggers the given block once the page is finished loading.
method onReady(block : Block) is public {
    jQuery.apply(block)
}

// Retrieves a DOM element from its ID.
method getById(id : String) -> Elements is public {
    newElements("#{id}")
}

// Retrieves a DOM element by a CSS selector.
method getBySelector(selector : String) -> Elements is public {
    newElements(selector)
}


def jQuery = js.global["jQuery"]

method newElements(selector : String) -> Elements {
    def els = jQuery.apply(selector)
    object {
        // Retrieves the value of the first element.
        method value -> String is public {
            els.val
        }

        // Sets the value of all the elements.
        method value:=(to : String) is public {
            els.val(to)
        }

        // Binds the block to run when the event is triggered on any element.
        method on(event : String) do(block : Block) is public {
            els.on(event, block)
        }
    }
}

