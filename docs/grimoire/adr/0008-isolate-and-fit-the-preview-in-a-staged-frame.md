# Isolate and fit the preview in a staged frame

The production preview paginates each book inside a fresh, same-origin sandboxed iframe
that is attached off-screen while Vivliostyle works, then swaps that frame into view on
success. A frame is the only boundary here that keeps the site's global CSS and custom
properties out of the rendered book. Pagination selects this behavior explicitly with
`{ mode: "isolated" }`; the `data-isolated` marker on the production container only
enables the application's resize observation and is not part of the adapter API.

`CoreViewer` has `autoResize` disabled in both modes. The application instead owns one
`ResizeObserver` on the production preview container. A real width or height change is
coalesced through the ordinary repaint queue, which creates a fresh frame at the current
dimensions and recomputes both pagination and `fitToScreen`. The queue prefers a newer
pending source; otherwise it repaints the source that most recently committed, so
resizing while auto-refresh is off cannot reveal unpublished edits.

The staging frame must stay attached because ADR-0005 measured detached pagination as
silently wrong. Keeping the prior frame attached until success preserves the last good
preview on errors and timeouts, while removing an old frame also disposes the old
viewer's window. Focused pagination fixtures use the direct compatibility default so
they can inspect engine output directly; that path retains ADR-0005's exact child and
attribute restoration behavior.

Before a staged frame replaces the prior book, it is made visible and keyboard reachable
and receives parent-owned link and form guards. Non-fragment links open through the
parent window rather than navigating the preview frame, form submissions are blocked,
and fragment links remain available to Vivliostyle's internal navigation. A failed
isolated run removes only its frame: the engine never mutates the outer container, so
rollback does not overwrite concurrent classes or ARIA attributes there.
