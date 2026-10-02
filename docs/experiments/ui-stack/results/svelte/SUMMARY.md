# UI stack measurements

# Payload

HTML is read from dist. Linked scripts, modulepreload links, stylesheets, Astro island component-url and renderer-url attributes are resolved. Static JS imports are counted as initial-load JS. Dynamic imports and their transitive JS dependencies are counted as lazy JS. Library labels come from chunk filenames and content heuristics for Preact, React, Astro, Base UI, Nanostores, Lucide and pdf-lib.

| Route | External JS gzip | Lazy JS gzip | Inline JS gzip | CSS gzip | HTML gzip | Requests |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| / | 0 | 0 | 0 | 8196 | 1140 | 2 |
| /mausritter/encounters | 34312 | 0 | 1902 | 8196 | 5473 | 10 |
| /mausritter/locations | 36878 | 0 | 1902 | 8196 | 7867 | 10 |
| /mausritter/weather | 35301 | 0 | 1902 | 8196 | 5622 | 10 |
| /paper-minis | 227940 | 6109 | 1902 | 8196 | 5406 | 7 |
| /the-black-hack/prices | 35891 | 0 | 1902 | 8196 | 6189 | 9 |


See network.md, timings.md, versions.json and screenshots/.
