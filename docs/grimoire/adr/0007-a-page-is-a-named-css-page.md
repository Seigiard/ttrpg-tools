# A page is a named CSS page

A `Page` uses CSS Paged Media's `page: <name>` rather than a hand-sized canvas element.
Vivliostyle then breaks flow on both sides, supports page-specific orientation and margin
boxes, and gives absolutely positioned content the page area as its frame of reference.

No `position: relative` wrapper is emitted: measurement showed that such a wrapper takes
the page-area containing block away and reintroduces margin-collapse and bottom-position
errors. A named page is a style, not a quota, so the adapter still counts physical page
indices and reports any declared page that spans more than one sheet. Content positioned
off the sheet is clipped and is not separately diagnosed.
