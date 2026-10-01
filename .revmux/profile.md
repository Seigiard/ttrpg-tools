# TTRPG Tools — review calibration

## Product and blast radius

TTRPG Tools is a catalogue of browser-based tools for tabletop role-playing games.
Astro renders the pages. React islands provide interaction. Cloudflare serves the
static build. Read `CLAUDE.md` for project conventions and `docs/DESIGN.md` for the UI.

A failure interrupts a game, changes a generated result, loses a user's prepared
state, or produces an unusable printout. A shared helper can affect several tools;
a page-specific defect usually affects one. Rate findings against that reach.

## Failures worth reporting

- A route or island fails to load, hydrate, or accept keyboard input.
- The server render and the first client render disagree. Browser state and random
  rolls belong in client effects, not store construction or render.
- A roll has biased probabilities or maps to the wrong table row. Random-table and
  range-table helpers share the crypto-backed dice implementation.
- A saved or shared result changes on reload when the tool promises stable state.
- An asynchronous result replaces a newer selection, restores a removed item, or
  makes an estimate disagree with the generated output.
- A printable result has wrong physical dimensions, overlapping cut-outs, missing
  pieces, or unreadable orientation. The consequence includes wasted paper and ink.
- A control cannot be reached or understood with a keyboard, or important state is
  conveyed by colour alone.
- A changed instruction or document would lead a later contributor to implement
  the wrong behaviour. Identify the misleading instruction and its consumer.

## Deliberate conventions

- Each tool uses an Astro page and a React island. UI primitives come from
  `src/components/ui/`. Independent store instances use nanostores.
- Keep domain rules separate from presentation. Table generators use the existing
  random-table or range-table helpers; tools with other domains need their own rules.
- Use Russian product copy, semantic colour tokens and system font stacks.
- Stored preferences are best-effort. A storage failure must leave the tool usable.
- Tests run with Bun and happy-dom. Judge a test by its independent observable
  contract, not its assertion count. Data invariants are preferred over snapshots
  of nearby constants; thin wrappers do not need duplicate tests.
- Resolve active domain terminology through `GLOSSARY.md`. Report a conflict
  with an applicable ADR by naming the decision and the changed behaviour.

## Reporting bar

Give a reachable scenario, the affected consumer and the observable consequence.
For missing coverage, name a defect the proposed test would catch and an oracle
independent of the implementation. Distinguish introduced regressions from existing
limitations, especially when code is moved between projects.

Prioritise broken behaviour and misleading contracts. Style preferences, speculative
abstractions and tooling substitutions are not findings on their own. A convention
violation earns a finding when it causes a concrete defect or maintenance hazard.
Finding nothing is a valid result.
