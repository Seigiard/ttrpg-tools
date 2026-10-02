# UI stack measurements

# Payload

HTML is read from dist. Linked scripts, modulepreload links, stylesheets, Astro island component-url and renderer-url attributes are resolved. Static JS imports are counted as initial-load JS. Dynamic imports are counted as lazy JS. Library labels come from chunk filenames and content heuristics for React, Astro, Base UI, Nanostores, Lucide and pdf-lib.

| Route | External JS gzip | Lazy JS gzip | Inline JS gzip | CSS gzip | HTML gzip | Requests |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| / | 0 | 0 | 0 | 8694 | 1141 | 2 |
| /mausritter/encounters | 33950 | 0 | 1902 | 8694 | 5256 | 10 |
| /mausritter/locations | 36878 | 0 | 1902 | 8694 | 7866 | 10 |
| /mausritter/weather | 35301 | 0 | 1902 | 8694 | 5621 | 10 |
| /paper-minis | 227851 | 0 | 1902 | 8694 | 5407 | 7 |
| /the-black-hack/prices | 35891 | 0 | 1902 | 8694 | 6189 | 9 |


See network.md, timings.md, versions.json and screenshots/.
