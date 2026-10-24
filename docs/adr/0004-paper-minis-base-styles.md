# Paper minis base styles

A paper mini has one of three Base styles: tent, flat or foamboard. Tent is the existing folded ⊥ stand and stays the default. Flat and foamboard minis stand in a standee or clip, so they end in a Tongue instead of Tabs and a Floor strip. The Base style is one setting for the whole print, not a property of each mini. A set printed for standees uses one kind of standee, and one style per print keeps the export file names (ADR-0003) and a single geometry for the whole layout.

## Shapes

- **Tent**: Floor strip, front Tab, front Face, Fold, back Face, back Tab. Unchanged.
- **Flat**: Tongue, front Face, Fold, back Face, Tongue. The mini folds at the top, the faces are glued back to back, and the two Tongues go into the slot together.
- **Foamboard**: each Face is a separate piece with its own Tongue. All front pieces print on Front sheets and all back pieces on Back sheets.

The Tongue is centred, base width minus 4 mm wide and 6 mm deep for every size. The duplicate number badge sits on the back Tongue. A piece keeps a rectangular footprint, so the guillotine layout (ADR-0001) does not change. The player cuts the rectangle, then two short cuts at the Tongue's shoulders, which carry inward corner marks.

## Foamboard sheets

A Back sheet is the horizontal mirror of its Front sheet: the same placements reflected across the page centre, so every back lands behind its front through the board. The back artwork itself is not mirrored. A mini without back artwork prints its front mirrored left to right on the Back sheet. Both sheets carry Registration marks in the four corners. Back pieces extend their background 1.5 mm past the cut line, so a small printer offset leaves no white edge. Cut marks print on Front sheets only, because the player cuts from the front. The PDF interleaves the sheets: front 1, back 1, front 2, and so on, and the first Back sheet reserves the scale bar band, mirrored, so the two layouts match.

## Considered options

- **Base style per mini**: allows mixed sets, but needs a new marker in the export file name and mixes geometries in one layout. No real set needed it.
- **Foamboard front and back as a pair side by side**, or as independent pieces: each piece would be glued and matched by hand. Gluing two full sheets to a board and cutting through once is less work and lines up better.
- **Full-width Tongue**: cuts in one straight line, but is wider than a standee's slot.
