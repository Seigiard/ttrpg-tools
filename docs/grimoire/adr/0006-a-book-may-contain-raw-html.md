# A book may contain raw HTML and inline CSS

Grimoire source is Markdown plus its capitalized structural tags. Lowercase HTML blocks
pass through Markdown rendering unescaped. This remains deliberate because a `Page` is a
composed canvas and inventing a placement vocabulary would reimplement CSS.

The tradeoff is that lowercase tag mistakes receive browser behavior rather than an
unknown-tag diagnostic, and files shared between people may carry arbitrary markup. The
editor is currently local and single-user. Any future component vocabulary must earn its
place through naming and reuse, not by making layout possible.

Executable scripts are not part of this escape hatch. Rendered books carry a
`script-src 'none'` content policy, and the preview disables Vivliostyle document
scripts, so imported markup cannot execute code in the shared site origin.
