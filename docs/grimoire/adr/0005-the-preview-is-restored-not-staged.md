# A failed Preview refresh restores the Preview rather than staging into a detached container

When the pagination engine fails, the author must keep seeing the last book that
paginated successfully. Broken markup already behaves that way, because parsing throws
before the engine is ever asked to lay anything out; the engine's own failure did not,
because the pagination adapter emptied the preview as its first statement and only then
handed the document over.

The attractive fix was to lay the next book out in a staging container held outside the
document and swap it into the preview only once pagination resolved. That never empties
the Preview at all, so it would also remove the flash of empty space a slow refresh shows
on the way to succeeding. We measured whether the engine can work that way, and it
cannot.

## What a detached container actually produces

Driving the real engine through the real adapter, in a real browser, once into the
visible preview and once into a `div` that was never appended to the document:

| book | pages, in the preview | pages, detached |
| --- | --- | --- |
| one short paragraph, A5 | 1 | 1 |
| six paragraphs, two columns, A5 | 2 | 1 |
| thirty sections of prose, A5 | 19 | 1 |

The page sizes were the only part that survived: both containers reported the same
559.37 x 793.70 for A5 and the same 793.70 x 1122.52 for A4. That is not a measurement:
it is the book's declared `@page size` resolved from CSS, which needs no layout to
compute. Everything that is a measurement collapsed. A detached element has no geometry
at all, so nothing the engine lays out ever overflows, so no page ever ends: the whole
book piles onto page one, and the content simply runs off it. Swapping that result into
the document afterwards does not repair it, because the fragmentation decisions were
already made and baked into the DOM.

So the risk this decision was gated on turned out to be worse than expected. The concern
was that page sizes would come back as zero; instead the sizes are right and the
pagination is wrong, which is the failure that would have shipped quietly.

## The decision

On an ordinary engine error, `paginate` remembers the container's children and attributes
before it empties it, and puts both back. The adapter is all-or-nothing about the visible
content: when a normal call settles, the container holds either a newly paginated book or
what it held on the way in. A first-ever failure needs no special handling; it restores an
empty container into an empty container.

The attributes are part of that ordinary-error promise and not a detail. The engine marks
the container `data-vivliostyle-viewer-status="loading"` when it starts and never marks it
back on the error path, so restoring only the child nodes leaves the container itself
describing the run that failed. Nothing styles off those attributes today, which is why
this is not a visible defect. It is still the difference between the guarantee being true
and being nearly true, and a nearly-true guarantee is the kind a later change quietly
relies on.

## What the guarantee covers after a timeout

[`Seigiard/grimoire-press#10`](https://github.com/Seigiard/grimoire-press/issues/10)
bound a pagination call at 30 seconds without progress. Each page-navigation event
restarts the bound, so a large book may run longer overall while an engine that stops
answering still releases the caller. A bound is another way for the call to settle, so
the restore runs there too. That exposed the limit of the wording above.

A run that fails has finished. A run that is given up on has not: the engine cannot be
called off because `CoreViewer` in `@vivliostyle/core` 2.45.1 exposes no teardown method.
`removeListener` detaches the adapter's handlers from the viewer's event target, but the
object that writes to the container is the viewer's internal one, and nothing detaches
that.

Measured, driving a real book to a real timeout mid-layout and letting the abandoned run
run on:

| what the abandoned run writes | reaches the preview? |
| --- | --- |
| its pages | no: 37 pages laid out, none of them in the document |
| `data-vivliostyle-viewer-status`, `data-vivliostyle-page-progression` | yes, about 200ms after the restore |

The pages are kept out by this decision itself, not by anything the timeout added. The
restore takes the engine's own viewport subtree out of the document along with the rest
of the children, and a detached element has no geometry to lay out against. The run halts
where it stands, writing into a subtree nobody can see.

The attributes are not kept out, because the engine writes those straight onto the
container it was handed. The guarantee holds for children, and for attributes it holds
only against this adapter's own handlers, not against the engine. Nothing styles off
those attributes today, so this is residue rather than a visible defect.

An attached staging container is what actually closes that gap, since the engine would
then be writing into an element the preview never shows. That remains deferred.

## Consequences

The failure case is fixed and the flash is not. A slow refresh still blanks the Preview
while the engine works, so the author keeps the one signal they currently have that the
editor is doing something. If the flash is ever removed, that signal has to arrive with
it.

A staging container attached to the document but positioned out of sight does paginate
correctly: the same three books produced 1, 2 and 19 pages there, page for page identical
to the visible preview. That is the route to reopen if the flash becomes worth removing.
It costs a second full copy of the book in the document for the duration of every refresh,
which is why it was not taken on the strength of a flash alone.
