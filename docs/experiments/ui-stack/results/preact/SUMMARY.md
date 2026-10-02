# UI stack measurements

# Payload

HTML is read from dist. Linked scripts, modulepreload links, stylesheets, Astro island component-url and renderer-url attributes are resolved. Static JS imports are counted as initial-load JS. Dynamic imports are counted as lazy JS. Library labels come from chunk filenames and content heuristics for React, Astro, Base UI, Nanostores, Lucide and pdf-lib.

| Route | External JS gzip | Lazy JS gzip | Inline JS gzip | CSS gzip | HTML gzip | Requests |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| / | 0 | 0 | 0 | 8034 | 1140 | 2 |
| /mausritter/encounters | 21413 | 0 | 1902 | 8034 | 5225 | 11 |
| /mausritter/locations | 24368 | 0 | 1902 | 8034 | 7938 | 11 |
| /mausritter/weather | 23217 | 0 | 1902 | 8034 | 5642 | 12 |
| /paper-minis | 213012 | 0 | 1902 | 8034 | 5319 | 9 |
| /the-black-hack/prices | 23852 | 0 | 1902 | 8034 | 6180 | 11 |


See network.md, timings.md, versions.json and screenshots/.
