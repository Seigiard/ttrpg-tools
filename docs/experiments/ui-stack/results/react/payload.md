# Payload

HTML is read from dist. Linked scripts, modulepreload links, stylesheets, Astro island component-url and renderer-url attributes are resolved. Static JS imports are counted as initial-load JS. Dynamic imports are counted as lazy JS. Library labels come from chunk filenames and content heuristics for React, Astro, Base UI, Nanostores, Lucide and pdf-lib.

| Route | External JS gzip | Lazy JS gzip | Inline JS gzip | CSS gzip | HTML gzip | Requests |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| / | 0 | 0 | 0 | 8627 | 1140 | 2 |
| /mausritter/encounters | 66881 | 0 | 1902 | 8627 | 5241 | 4 |
| /mausritter/locations | 68914 | 0 | 1902 | 8627 | 7967 | 4 |
| /mausritter/weather | 67181 | 0 | 1902 | 8627 | 5660 | 4 |
| /paper-minis | 275592 | 0 | 1902 | 8627 | 5357 | 4 |
| /the-black-hack/prices | 68785 | 0 | 1902 | 8627 | 6209 | 4 |
