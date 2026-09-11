# Host Grimoire Press as an Astro route

Grimoire Press lives at `/grimoire` in TTRPG Tools so the catalogue, deployment, and preview environments stay in one repository. Astro owns the route and shared site shell, while the editor remains vanilla TypeScript because CodeMirror and Vivliostyle already own its interactive DOM; rewriting it as React would add lifecycle complexity without a product benefit.
