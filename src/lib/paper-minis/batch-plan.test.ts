import { expect, test } from 'bun:test';
import { planBatch } from './batch-plan';

const file = (name: string) => new File([], name);
const names = (...fileNames: string[]) => planBatch(fileNames.map(file)).map((row) => row.name);

test.each([
  ['big-bad_wolf.PNG', 'Big bad wolf'],
  ['bytedance-seed_seedream  5-0-lite-generated.jpg', 'Bytedance seed seedream 5 0 lite generated'],
  ['  _goblin MK2-.webp', 'Goblin MK2'],
  ['archive.tar.png', 'Archive.tar'],
  ['noextension', 'Noextension'],
  ['ёж.png', 'Ёж'],
])('%s is named %s', (fileName, expected) => {
  expect(names(fileName)).toEqual([expected]);
});

test.each(['.png', '-_ .jpg', '---'])('%s cleans up to an empty name', (fileName) => {
  expect(names(fileName)).toEqual(['']);
});

test('every file becomes its own row as the front, in input order, without a back or size', () => {
  // #given
  const files = ['c.png', 'a.png', 'b.png'].map(file);
  // #when
  const plan = planBatch(files);
  // #then
  expect(plan).toEqual([
    { name: 'C', front: files[0] },
    { name: 'A', front: files[1] },
    { name: 'B', front: files[2] },
  ]);
});

// Rows as file names, so each case reads like the acceptance table in the spec.
const rows = (...fileNames: string[]) =>
  planBatch(fileNames.map(file)).map((row) => [row.name, row.front.name, row.back?.name]);

test.each([
  [['goblin.png', 'goblin-back.png'], [['Goblin', 'goblin.png', 'goblin-back.png']]],
  [['goblin-front.png', 'goblin-back.png'], [['Goblin', 'goblin-front.png', 'goblin-back.png']]],
  [['goblin-back.png', 'goblin.png'], [['Goblin', 'goblin.png', 'goblin-back.png']]],
  [['goblin.png', 'Goblin-BACK.png'], [['Goblin', 'goblin.png', 'Goblin-BACK.png']]],
  [['goblin.png', 'goblin_back.png'], [['Goblin', 'goblin.png', 'goblin_back.png']]],
  [['goblin.png', 'goblin back.png'], [['Goblin', 'goblin.png', 'goblin back.png']]],
  [['Goblin-Front.png', 'goblin-back.png'], [['Goblin', 'Goblin-Front.png', 'goblin-back.png']]],
  [
    ['big_bad_wolf.png', 'big-bad-wolf-back.png'],
    [['Big bad wolf', 'big_bad_wolf.png', 'big-bad-wolf-back.png']],
  ],
  [
    ['Goblin MK2.png', 'goblin mk2-back.png'],
    [['Goblin MK2', 'Goblin MK2.png', 'goblin mk2-back.png']],
  ],
])('%p pairs into one row with both sides', (fileNames, expected) => {
  expect(rows(...fileNames)).toEqual(expected);
});

test('a back with no front becomes its own row, with the file as the front', () => {
  expect(rows('knight-back.png')).toEqual([['Knight', 'knight-back.png', undefined]]);
});

test('an orphan back keeps its own position among the rows', () => {
  // #given
  const fileNames = ['ogre.png', 'knight-back.png', 'goblin-back.png', 'goblin.png'];
  // #when
  const plan = rows(...fileNames);
  // #then
  expect(plan).toEqual([
    ['Ogre', 'ogre.png', undefined],
    ['Knight', 'knight-back.png', undefined],
    ['Goblin', 'goblin.png', 'goblin-back.png'],
  ]);
});

test('one back loads into every front with the same name', () => {
  expect(rows('goblin.png', 'goblin-front.jpg', 'goblin-back.png')).toEqual([
    ['Goblin', 'goblin.png', 'goblin-back.png'],
    ['Goblin', 'goblin-front.jpg', 'goblin-back.png'],
  ]);
});

test('a front that two backs match stays unpaired, and each back becomes its own row', () => {
  expect(rows('goblin-back.webp', 'goblin.png', 'goblin-back.png')).toEqual([
    ['Goblin', 'goblin-back.webp', undefined],
    ['Goblin', 'goblin.png', undefined],
    ['Goblin', 'goblin-back.png', undefined],
  ]);
});

test('an ambiguous name does not block pairing of other names', () => {
  expect(
    rows('goblin.png', 'goblin-back.png', 'goblin-back.jpg', 'ogre.png', 'ogre-back.png'),
  ).toEqual([
    ['Goblin', 'goblin.png', undefined],
    ['Goblin', 'goblin-back.png', undefined],
    ['Goblin', 'goblin-back.jpg', undefined],
    ['Ogre', 'ogre.png', 'ogre-back.png'],
  ]);
});

test('every dropped file lands in the plan, as a front or as a back', () => {
  // #given
  const files = [
    'goblin.png',
    'goblin-back.png',
    'goblin-back.jpg',
    'ogre-front.png',
    'ogre-back.png',
    'troll.png',
    'troll-front.png',
    'troll-back.png',
    'knight-back.png',
    'back.png',
  ].map(file);
  // #when
  const plan = planBatch(files);
  // #then
  const planned = new Set(plan.flatMap((row) => (row.back ? [row.front, row.back] : [row.front])));
  expect(files.filter((dropped) => !planned.has(dropped))).toEqual([]);
});

test('a back named only by its marker becomes a row with an empty name', () => {
  expect(rows('back.png')).toEqual([['', 'back.png', undefined]]);
});

test.each([
  ['ogre-large.png', 'Ogre', 'large'],
  ['ogre-large-back.png', 'Ogre', 'large'],
  ['ogre-back-large.png', 'Ogre', 'large'],
  ['ogre-large-tall.png', 'Ogre', 'large-tall'],
  ['ogre_large_tall_back.png', 'Ogre', 'large-tall'],
  ['ogre-back-large-tall.png', 'Ogre', 'large-tall'],
  ['dwarf-medium_short.png', 'Dwarf', 'medium-short'],
  ['dwarf medium short.png', 'Dwarf', 'medium-short'],
  ['bugbear-Medium-TALL.PNG', 'Bugbear', 'medium-tall'],
  ['imp-tiny.png', 'Imp', 'tiny'],
  ['wolf-small.png', 'Wolf', 'small'],
  ['knight-medium.png', 'Knight', 'medium'],
  ['giant-huge.png', 'Giant', 'huge'],
  ['kraken-gargantuan.png', 'Kraken', 'gargantuan'],
  ['dragon-large.png', 'Dragon', 'large'],
  ['large.png', '', 'large'],
])('%s reads as %p on the %s slot', (fileName, name, slot) => {
  // #given
  const files = [file(fileName)];
  // #when
  const [row] = planBatch(files);
  // #then
  expect([row.name, row.heightSlot]).toEqual([name, slot]);
});

test.each([
  ['goblin-custom.png', 'Goblin custom'],
  ['goblin-tall.png', 'Goblin tall'],
  ['goblin-short.png', 'Goblin short'],
  ['goblin-large-small.png', 'Goblin large'],
  ['goblin-back-back.png', 'Goblin back'],
])('%s strips only slot ids, each marker kind once, and is named %p', (fileName, name) => {
  expect(names(fileName)).toEqual([name]);
});

// Rows with their size, so the size cases read like the acceptance table.
const sizedRows = (...fileNames: string[]) =>
  planBatch(fileNames.map(file)).map((row) => [
    row.name,
    row.front.name,
    row.back?.name,
    row.heightSlot,
  ]);

const detailedRows = (...fileNames: string[]) =>
  planBatch(fileNames.map(file)).map((row) => ({
    name: row.name,
    front: row.front.name,
    back: row.back?.name,
    heightSlot: row.heightSlot,
    customWidthMm: row.customWidthMm,
    customHeightMm: row.customHeightMm,
    count: row.count,
  }));

test('x1 is ignored and leaves the default count implicit', () => {
  // #given
  const fileName = 'goblin-small-front-x1.png';
  // #when
  const plannedRows = detailedRows(fileName);
  // #then
  expect(plannedRows).toEqual([
    {
      name: 'Goblin',
      front: fileName,
      back: undefined,
      heightSlot: 'small',
      customWidthMm: undefined,
      customHeightMm: undefined,
      count: undefined,
    },
  ]);
});

test('x0 is consumed as a broken count marker', () => {
  // #given
  const fileName = 'goblin-small-front-x0.png';
  // #when
  const plannedRows = detailedRows(fileName);
  // #then
  expect(plannedRows).toEqual([
    {
      name: 'Goblin',
      front: fileName,
      back: undefined,
      heightSlot: 'small',
      customWidthMm: undefined,
      customHeightMm: undefined,
      count: undefined,
    },
  ]);
});

test('junk after x stays in the name', () => {
  // #given
  const fileName = 'goblin-small-front-xmany.png';
  // #when
  const plannedRows = detailedRows(fileName);
  // #then
  expect(plannedRows).toEqual([
    {
      name: 'Goblin small front xmany',
      front: fileName,
      back: undefined,
      heightSlot: undefined,
      customWidthMm: undefined,
      customHeightMm: undefined,
      count: undefined,
    },
  ]);
});

test('a valid count marker plans the row count', () => {
  // #given
  const fileName = 'goblin-small-front-x4.png';
  // #when
  const plannedRows = detailedRows(fileName);
  // #then
  expect(plannedRows).toEqual([
    {
      name: 'Goblin',
      front: fileName,
      back: undefined,
      heightSlot: 'small',
      customWidthMm: undefined,
      customHeightMm: undefined,
      count: 4,
    },
  ]);
});

test.each([
  ['xorn-small-front.png', 'Xorn', 'small'],
  ['goblin-xbow-front.png', 'Goblin xbow', undefined],
])('%s keeps an x-prefixed name token', (fileName, name, heightSlot) => {
  // #given
  const files = [fileName];
  // #when
  const plannedRows = detailedRows(...files);
  // #then
  expect(plannedRows).toEqual([
    {
      name,
      front: fileName,
      back: undefined,
      heightSlot,
      customWidthMm: undefined,
      customHeightMm: undefined,
      count: undefined,
    },
  ]);
});

test('custom-WxH plans a custom size with dimensions', () => {
  // #given
  const fileName = 'goblin-custom-30x45-front.png';
  // #when
  const plannedRows = detailedRows(fileName);
  // #then
  expect(plannedRows).toEqual([
    {
      name: 'Goblin',
      front: fileName,
      back: undefined,
      heightSlot: 'custom',
      customWidthMm: 30,
      customHeightMm: 45,
      count: undefined,
    },
  ]);
});

test('a custom marker with a non-positive dimension falls back to the default size', () => {
  // #given
  const fileName = 'goblin-custom-0x45-front.png';
  // #when
  const plannedRows = detailedRows(fileName);
  // #then
  expect(plannedRows).toEqual([
    {
      name: 'Goblin',
      front: fileName,
      back: undefined,
      heightSlot: undefined,
      customWidthMm: undefined,
      customHeightMm: undefined,
      count: undefined,
    },
  ]);
});

test('a name ending in custom without dimensions keeps custom in the name', () => {
  // #given
  const fileName = 'goblin-custom-front.png';
  // #when
  const plannedRows = detailedRows(fileName);
  // #then
  expect(plannedRows).toEqual([
    {
      name: 'Goblin custom',
      front: fileName,
      back: undefined,
      heightSlot: undefined,
      customWidthMm: undefined,
      customHeightMm: undefined,
      count: undefined,
    },
  ]);
});

test('front and back with different counts still pair', () => {
  // #given
  const fileNames = ['goblin-small-front-x2.png', 'goblin-small-back-x5.png'];
  // #when
  const plannedRows = detailedRows(...fileNames);
  // #then
  expect(plannedRows).toEqual([
    {
      name: 'Goblin',
      front: 'goblin-small-front-x2.png',
      back: 'goblin-small-back-x5.png',
      heightSlot: 'small',
      customWidthMm: undefined,
      customHeightMm: undefined,
      count: 2,
    },
  ]);
});

test('a side and a size pair the same way in both files', () => {
  expect(sizedRows('ogre-large-tall-front.png', 'ogre-large-tall-back.png')).toEqual([
    ['Ogre', 'ogre-large-tall-front.png', 'ogre-large-tall-back.png', 'large-tall'],
  ]);
});

test('an unsized back goes to every sized front with the same name', () => {
  expect(sizedRows('goblin-small-front.png', 'goblin-large-front.png', 'goblin-back.png')).toEqual([
    ['Goblin', 'goblin-small-front.png', 'goblin-back.png', 'small'],
    ['Goblin', 'goblin-large-front.png', 'goblin-back.png', 'large'],
  ]);
});

test('sized backs go only to fronts of their own size', () => {
  expect(
    sizedRows(
      'goblin-small-front.png',
      'goblin-large-front.png',
      'goblin-small-back.png',
      'goblin-large-back.png',
    ),
  ).toEqual([
    ['Goblin', 'goblin-small-front.png', 'goblin-small-back.png', 'small'],
    ['Goblin', 'goblin-large-front.png', 'goblin-large-back.png', 'large'],
  ]);
});

test('an unsized front takes the size of its back', () => {
  expect(sizedRows('goblin.png', 'goblin-large-back.png')).toEqual([
    ['Goblin', 'goblin.png', 'goblin-large-back.png', 'large'],
  ]);
});

test('an unsized front that two sized backs match stays unpaired', () => {
  expect(sizedRows('goblin.png', 'goblin-small-back.png', 'goblin-large-back.png')).toEqual([
    ['Goblin', 'goblin.png', undefined, undefined],
    ['Goblin', 'goblin-small-back.png', undefined, 'small'],
    ['Goblin', 'goblin-large-back.png', undefined, 'large'],
  ]);
});

test('a back of another size does not pair and becomes its own row at its size', () => {
  expect(sizedRows('goblin-small-front.png', 'goblin-large-back.png')).toEqual([
    ['Goblin', 'goblin-small-front.png', undefined, 'small'],
    ['Goblin', 'goblin-large-back.png', undefined, 'large'],
  ]);
});

test('a back is never attached to a front of another size', () => {
  // #given
  const sizeByFile: Record<string, string | undefined> = {
    'goblin-small.png': 'small',
    'goblin-large.png': 'large',
    'goblin-small-back.png': 'small',
    'ogre-huge.png': 'huge',
    'ogre-tiny-back.png': 'tiny',
    'troll.png': undefined,
    'troll-large-back.png': 'large',
  };
  const files = Object.keys(sizeByFile).map(file);
  // #when
  const plan = planBatch(files);
  // #then
  const clashes = plan.filter((row) => {
    if (!row.back) return false;
    const frontSize = sizeByFile[row.front.name];
    const backSize = sizeByFile[row.back.name];
    return frontSize !== undefined && backSize !== undefined && frontSize !== backSize;
  });
  expect(clashes).toEqual([]);
});
