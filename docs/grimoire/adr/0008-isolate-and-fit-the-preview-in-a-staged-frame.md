# Isolate and fit the preview in a staged frame

The production preview paginates each book inside a fresh, same-origin sandboxed iframe
that is attached off-screen while Vivliostyle works, then swaps that frame into view on
success. A frame is the only boundary here that keeps the site's global CSS and custom
properties out of the rendered book; its own window also lets `fitToScreen` and
`autoResize` follow the preview size without leaking another resize listener onto the
long-lived app window after every repaint.

The staging frame must stay attached because ADR-0005 measured detached pagination as
silently wrong. Keeping the prior frame attached until success preserves the last good
preview on errors and timeouts, while removing an old frame also disposes the old
viewer's window and resize listener. Focused pagination fixtures remain unframed so they
can inspect the engine output directly; that path retains ADR-0005's restoration
behavior.
