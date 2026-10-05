import { afterEach, beforeEach, expect, test } from 'bun:test';
import { cleanup, render, screen } from '@testing-library/svelte';
import ReferenceListTestBed from './ReferenceListTestBed.svelte';

beforeEach(cleanup);

afterEach(cleanup);

test('each row shows its own label before its outcome', () => {
  // #given distinct outcomes with labels that use the row and its position
  const rows = [
    { code: 'A', outcome: 'Clear' },
    { code: 'B', outcome: 'Omen' },
  ];

  // #when the reference table renders both snippets
  render(ReferenceListTestBed, { rows, hitIndex: null });
  // #then each label stays paired with its outcome in display order
  expect(screen.getAllByRole('listitem').map((row) => row.textContent)).toEqual([
    '1: A Clear',
    '2: B Omen',
  ]);
});

test.each([0, 1, 2, null])('marks only the rolled row for hitIndex %s', (hitIndex) => {
  // #given a roll or the state before the first roll
  const rows = [
    { code: 'A', outcome: 'Clear' },
    { code: 'B', outcome: 'Omen' },
    { code: 'C', outcome: 'Encounter' },
  ];

  // #when the reference table is rendered
  const { container } = render(ReferenceListTestBed, { rows, hitIndex });
  // #then only that row is marked
  expect(
    [...container.querySelectorAll('[data-hit]')].map((row) => [
      row.getAttribute('data-row-index'),
      row.getAttribute('data-hit'),
    ]),
  ).toEqual(hitIndex === null ? [] : [[String(hitIndex), 'true']]);
});

test('the rolled row has a left border as a non-colour marker', () => {
  // #given a rolled outcome
  const rows = [
    { code: 'A', outcome: 'Clear' },
    { code: 'B', outcome: 'Omen' },
  ];

  // #when the reference table is rendered
  render(ReferenceListTestBed, { rows, hitIndex: 1 });
  // #then the marker is present on the rolled row only
  expect(
    screen.getAllByRole('listitem').map((row) => row.classList.contains('border-l-2')),
  ).toEqual([false, true]);
});

test('every reference row has its positional index', () => {
  // #given three outcomes
  const rows = [
    { code: 'A', outcome: 'Clear' },
    { code: 'B', outcome: 'Omen' },
    { code: 'C', outcome: 'Encounter' },
  ];

  // #when the reference table is rendered
  render(ReferenceListTestBed, { rows, hitIndex: 1 });
  // #then every row exposes its index
  expect(screen.getAllByRole('listitem').map((row) => row.getAttribute('data-row-index'))).toEqual([
    '0',
    '1',
    '2',
  ]);
});
