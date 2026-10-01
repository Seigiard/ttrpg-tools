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
