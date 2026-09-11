# The editor carries no UI framework and no state library

The two heavy parts of this application, CodeMirror and Vivliostyle, are both independent
of any framework and both hold their own state. What remains between them is glue. Astro
hosts the route and shared shell; plain TypeScript DOM code wires the editor, persistence,
pagination, printing, and file controls together. The editor adds neither a UI framework
nor a state manager nor a Result library nor an effect system.

## The state this application actually holds

The source text belongs to CodeMirror's own editor state. The parsed document and the
preview markup are derived from it rather than stored. Outside those, the whole surface is
the name of the selected theme, a flag for whether the preview refreshes by itself, and a
draft written to the browser's local storage.

One string and one flag do not need a state manager. The chain from an edit to a refreshed
Preview is one workflow, called from the editor's own update listener.

## Amendment: refresh scheduling

The chain above is no longer quite one function: a Preview refresh now waits for typing
to pause, and a request made while one is already running is coalesced into whatever
comes next rather than started alongside it, so the Preview workflow carries a debounce
timer handle, an in-flight flag, and one pending source string. This is scheduling state,
not model state: none of it is derived reactively from something else changing, none of
it survives past the refresh it belongs to, and none of it is read from anywhere but the
workflow that owns it. The editor session owns that workflow's lifetime together with its
other timers and listeners. This is exactly the kind of wiring this ADR already
anticipated writing by hand. A state library's one advantage here would still be automatic
recomputation from a changing source, and nothing about scheduling a queue of one pending
request calls for that.

## Considered options

**A state library.** Nanostores is mature and costs 265 bytes, so the objection is not its
weight. Its one real benefit here is recomputing the parsed document automatically when
the source changes, and that is the one piece of wiring we would otherwise write once.
Reconsider it if the interface grows past roughly ten controls: introducing it is a cheap
and reversible step, which is why it does not need deciding now.

**A UI framework.** React was assumed early and never earned its place: components are
templates inside a book rather than framework components, the preview is markup handed to
a paginator, and the editor is framework-agnostic. Alpine would suit the shape of the
interface, a handful of controls declared in attributes, but a handful of controls is also
what plain event listeners suit.

**Web components.** These would have to appear in the markup a paginator lays out, and a
shadow root blocks the cascade: inherited properties such as the typeface pass through,
but every rule written against an element selector does not. The base stylesheet is built
entirely from element selectors, so nothing of the theme would survive inside a shadow
root. Page fragmentation across a shadow boundary is also where paginators break.

**htmx.** Its mechanism is to answer an event with an HTTP request and swap the returned
markup into the page. Grimoire has no application backend, and the preview is computed in
the browser from the editor's buffer rather than fetched. There is nothing for it to
request.

**A Result library.** Each author operation has its own small closed error surface:
refreshing the Preview, printing the Book, and loading a saved file. Preview refresh and
printing share the Book markup cases, while engine and file failures stay with the
operation that can produce them. Discriminated unions cover these cases in a few lines
and are matched exhaustively where errors reach the interface. The `better-result`
package is well maintained and would work; these small unions do not need it.

**An effect system.** Effect targets structured concurrency, resource lifetimes and typed
error channels through asynchronous pipelines. This application has no backend, no
concurrent input or output beyond reading one file and writing one draft, and three error
cases. A production report measured roughly 50 KB gzipped added even after tree shaking,
because the fibre runtime cannot be shaken out.

**Several very small libraries** were weighed and rejected on adoption alone: each had
fewer than two hundred stars and under two hundred weekly downloads. One of them addressed
hydrating interactive custom elements, which is the opposite of what this project needs:
markup must be fully resolved before it reaches the paginator.
