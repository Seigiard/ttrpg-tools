# Payload

HTML is read from dist. Linked scripts, modulepreload links, stylesheets, Astro island component-url and renderer-url attributes are resolved. Static JS imports are counted as initial-load JS. Dynamic imports are counted as lazy JS. Library labels come from chunk filenames and content heuristics for React, Astro, Base UI, Nanostores, Lucide and pdf-lib.

| Route | External JS gzip | Lazy JS gzip | Inline JS gzip | CSS gzip | HTML gzip | Requests |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| / | 0 | 0 | 0 | 8694 | 1141 | 2 |
| /mausritter/encounters | 2279 | 0 | 1902 | 8694 | 5256 | 4 |
| /mausritter/locations | 4083 | 0 | 1902 | 8694 | 7866 | 4 |
| /mausritter/weather | 2584 | 0 | 1902 | 8694 | 5621 | 4 |
| /paper-minis | 198206 | 0 | 1902 | 8694 | 5407 | 4 |
| /the-black-hack/prices | 4146 | 0 | 1902 | 8694 | 6189 | 4 |
