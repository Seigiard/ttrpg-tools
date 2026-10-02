# Payload

HTML is read from dist. Linked scripts, modulepreload links, stylesheets, Astro island component-url and renderer-url attributes are resolved. Static JS imports are counted as initial-load JS. Dynamic imports and their transitive JS dependencies are counted as lazy JS. Library labels come from chunk filenames and content heuristics for Preact, React, Astro, Base UI, Nanostores, Lucide and pdf-lib.

| Route | External JS gzip | Lazy JS gzip | Inline JS gzip | CSS gzip | HTML gzip | Requests |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| / | 0 | 0 | 0 | 8124 | 1139 | 2 |
| /mausritter/encounters | 21688 | 3012 | 1902 | 8124 | 5431 | 11 |
| /mausritter/locations | 24368 | 3012 | 1902 | 8124 | 7937 | 11 |
| /mausritter/weather | 23217 | 3012 | 1902 | 8124 | 5641 | 12 |
| /paper-minis | 213031 | 9121 | 1902 | 8124 | 5321 | 9 |
| /the-black-hack/prices | 23852 | 3012 | 1902 | 8124 | 6179 | 11 |
