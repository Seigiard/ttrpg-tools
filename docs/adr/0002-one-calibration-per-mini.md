# One height calibration per mini, shared by front and back

A mini has one pair of head and feet lines, stored as fractions of the artwork height and applied to both the front and the back. The calibration dialog shows both artworks side by side at the same height, with the lines running across both. When the two sides do not line up, the player places the lines as a compromise.

This replaces the per-side calibration shipped in #76, where the back could carry its own lines or inherit the front's printed height.

## Considered options

- **Separate lines per side** (#76): exact for mismatched art, but the front and the back match in about 99% of real minis. It doubled the dialog (tabs, two drafts), the stored state and the sizing rules for a rare case.
- **Front-only lines, back inherits the front's printed height**: one set of lines, but the player never sees whether they fit the back.

## Consequences

Calibration is reset when an existing image is replaced, when all images are removed, or when normalization is toggled. Adding the missing side or removing one of two sides keeps it.
