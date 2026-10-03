# UI stack measurements

# Payload

HTML is read from dist. Linked scripts, modulepreload links, stylesheets, Astro island component-url and renderer-url attributes are resolved. Static JS imports are counted as initial-load JS. Dynamic imports and their transitive JS dependencies are counted as lazy JS. Library labels come from chunk filenames and content heuristics for Preact, React, Astro, Base UI, Nanostores, Lucide and pdf-lib.

| Route | External JS gzip | Lazy JS gzip | Inline JS gzip | CSS gzip | HTML gzip | Requests |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| / | 0 | 0 | 0 | 8141 | 1141 | 2 |
| /mausritter/encounters | 21459 | 3013 | 1902 | 8141 | 5436 | 11 |
| /mausritter/locations | 24172 | 3013 | 1902 | 8141 | 7939 | 11 |
| /mausritter/weather | 23023 | 3013 | 1902 | 8141 | 5643 | 12 |
| /paper-minis | 213353 | 9122 | 1902 | 8141 | 5491 | 9 |
| /the-black-hack/prices | 23661 | 3013 | 1902 | 8141 | 6182 | 11 |


See network.md, timings.md, versions.json and screenshots/.
