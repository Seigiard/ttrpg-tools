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
  [['Goblin MK2.png', 'goblin mk2-back.png'], [['Goblin MK2', 'Goblin MK2.png', 'goblin mk2-back.png']]],
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
  expect(rows('goblin.png', 'goblin-back.png', 'goblin-back.jpg', 'ogre.png', 'ogre-back.png')).toEqual([
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
