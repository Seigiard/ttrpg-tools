# PDF comes from the browser's print engine

The editor shows a live preview and must hand the author a PDF. JavaScript PDF libraries
carry their own layout model and do not understand the book's HTML, CSS, theme, or
embedded typefaces. Rasterising would make text unselectable and reduce print quality.

The browser's print engine produces vector PDFs with embedded typefaces and selectable
text while honoring the complete stylesheet. Therefore printing opens the browser print
dialog, where the author chooses Save as PDF. The preview remains paginated HTML, built
from the same marked-up book as the print path.

Nothing in the editor shell may participate in book layout. This preserves a future
server-side path that loads the same standalone HTML and calls `page.pdf()`.
