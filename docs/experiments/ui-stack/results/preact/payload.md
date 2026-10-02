# Payload

HTML is read from dist. Linked scripts, modulepreload links, stylesheets, Astro island component-url and renderer-url attributes are resolved. Static JS imports are counted as initial-load JS. Dynamic imports and their transitive JS dependencies are counted as lazy JS. Library labels come from chunk filenames and content heuristics for Preact, React, Astro, Base UI, Nanostores, Lucide and pdf-lib.

| Route | External JS gzip | Lazy JS gzip | Inline JS gzip | CSS gzip | HTML gzip | Requests |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| / | 0 | 0 | 0 | 8149 | 1140 | 2 |
| /mausritter/encounters | 21714 | 3012 | 1902 | 8149 | 5433 | 11 |
| /mausritter/locations | 24440 | 3012 | 1902 | 8149 | 7938 | 11 |
| /mausritter/weather | 23289 | 3012 | 1902 | 8149 | 5642 | 12 |
| /paper-minis | 213098 | 9121 | 1902 | 8149 | 5320 | 9 |
| /the-black-hack/prices | 23923 | 3012 | 1902 | 8149 | 6181 | 11 |
