# A failed repaint restores the preview

The author must keep seeing the last successfully paginated book after an engine failure.
A detached staging container cannot be used because it has no geometry: real tests showed
long and multi-column documents collapsing onto one page.

`paginate` therefore remembers the preview's children and attributes, empties the live
container for layout, and restores both on error or timeout. A timed-out Vivliostyle run
cannot be cancelled. Its detached pages stay invisible, although it may later stamp
bookkeeping attributes on the live container. Removing that residue would require an
attached, visually hidden staging container and a second temporary copy of the book.
