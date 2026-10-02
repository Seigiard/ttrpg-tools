# Payload

HTML is read from dist. Linked scripts, modulepreload links, stylesheets, Astro island component-url and renderer-url attributes are resolved. Static JS imports are counted as initial-load JS. Dynamic imports are counted as lazy JS. Library labels come from chunk filenames and content heuristics for React, Astro, Base UI, Nanostores, Lucide and pdf-lib.

| Route | External JS gzip | Lazy JS gzip | Inline JS gzip | CSS gzip | HTML gzip | Requests |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| / | 0 | 0 | 0 | 8034 | 1140 | 2 |
| /mausritter/encounters | 2019 | 0 | 1902 | 8034 | 5225 | 4 |
| /mausritter/locations | 3973 | 0 | 1902 | 8034 | 7938 | 4 |
| /mausritter/weather | 2305 | 0 | 1902 | 8034 | 5642 | 4 |
| /paper-minis | 194877 | 0 | 1902 | 8034 | 5319 | 4 |
| /the-black-hack/prices | 3912 | 0 | 1902 | 8034 | 6180 | 4 |
