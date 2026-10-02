# Paper minis export file names are the import contract

Exported paper minis use one PNG file per side, named `{name}-{size}-{side}[-xN][-hNNN-fNNN].png`. Batch import reads the same contract from the end of the name, so exported zips and extracted PNGs can restore the minis without a manifest.

`name` keeps the player's name with separators written as `-`; an empty name becomes `mini-N`, and collisions get `-2`, `-3`, and so on after the name. `size` is a height slot id or `custom-WxH` in millimetres, `side` is `front` or `back`, `xN` is written only when count is above one, and `hNNN-fNNN` stores Calibration head and feet lines in thousandths of the prepared artwork height. Marker order is flexible when importing because markers are read from the end, one marker kind at a time.

The accepted risk is that a player name ending in a marker word is read as that marker. We keep this because the format stays readable in a file manager and matches the existing batch naming style.
