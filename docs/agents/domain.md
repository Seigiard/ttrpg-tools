# Domain Docs

How engineering skills consume this repository's domain documentation.

## Before exploring

- Read `CONTEXT-MAP.md` at the repository root.
- Follow the map to the `CONTEXT.md` for each context relevant to the work.
- Read system-wide decisions in `docs/adr/`.
- Read context-specific decisions in the ADR directory beside the mapped context. For
  Grimoire Press, that is `docs/grimoire/adr/`.

If a referenced file does not exist, proceed silently. `/domain-modeling` creates domain
documents lazily when terms or decisions are resolved.

## Layout

This is a multi-context repository:

```text
/
├── CONTEXT-MAP.md
├── docs/
│   ├── adr/                  # system-wide decisions
│   └── grimoire/
│       ├── CONTEXT.md        # Grimoire Press vocabulary
│       └── adr/              # Grimoire Press decisions
└── src/
```

## Consumer rules

Use the glossary's canonical terms in issues, tests, and implementation. If a needed
concept is absent, either reconsider the new term or note the gap for `/domain-modeling`.

If proposed work contradicts an ADR, surface the conflict explicitly rather than
silently overriding the decision.
