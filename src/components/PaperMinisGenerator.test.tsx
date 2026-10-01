import { afterEach, beforeEach, expect, test } from 'bun:test';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import PaperMinisGenerator from './PaperMinisGenerator';

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==',
  'base64',
);
beforeEach(() => {
  localStorage.setItem('pmg-settings', JSON.stringify({ normalization: false }));
});
afterEach(() => {
  cleanup();
  localStorage.removeItem('pmg-settings');
});

async function addFront() {
  await act(async () => {
    fireEvent.change(screen.getByLabelText('Добавить изображения', { selector: 'input' }), {
      target: { files: [new File([png], 'front.png', { type: 'image/png' })] },
    });
  });
}

test('clearing copies keeps the field empty until a new count is entered', async () => {
  // #given
  render(<PaperMinisGenerator />);
  await addFront();
  const input = screen.getByRole<HTMLInputElement>('spinbutton', { name: 'Количество копий' });
  fireEvent.change(input, { target: { value: '2' } });
  // #when
  fireEvent.change(input, { target: { value: '' } });
  const cleared = input.value;
  fireEvent.change(input, { target: { value: `${input.value}3` } });
  // #then
  expect({
    cleared,
    value: input.value,
    summary: document.querySelector('[aria-live="polite"]')?.textContent,
  }).toEqual({ cleared: '', value: '3', summary: 'Миниатюр: 3 → листов: 1 (A4)' });
});

test('a thumbnail drop uses the first supported image even after an unsupported file', async () => {
  // #given
  render(<PaperMinisGenerator />);
  fireEvent.click(screen.getByRole('button', { name: 'Добавить пустую строку' }));
  // #when
  await act(async () => {
    fireEvent.drop(screen.getByRole('button', { name: 'Лицевая сторона' }), {
      dataTransfer: {
        files: [
          new File(['text'], 'notes.txt', { type: 'text/plain' }),
          new File([png], 'figure.png', { type: 'image/png' }),
        ],
      },
    });
  });
  // #then
  expect(document.querySelector('[aria-live="polite"]')?.textContent).toBe(
    'Миниатюр: 1 → листов: 1 (A4)',
  );
});

test('the back slot announces the selected file and returns to reflection after removal', async () => {
  // #given
  render(<PaperMinisGenerator />);
  await addFront();
  // #when
  await act(async () => {
    fireEvent.change(
      screen.getByLabelText('Оборот: отражение лицевой стороны', { selector: 'input' }),
      {
        target: { files: [new File([png], 'back.png', { type: 'image/png' })] },
      },
    );
  });
  const back = screen.getByRole('button', { name: 'Оборот: back.png' });
  const selected = back.getAttribute('aria-label');
  fireEvent.click(screen.getByRole('button', { name: 'Убрать оборот' }));
  // #then
  expect([
    selected,
    screen
      .getByRole('button', { name: 'Оборот: отражение лицевой стороны' })
      .getAttribute('aria-label'),
  ]).toEqual(['Оборот: back.png', 'Оборот: отражение лицевой стороны']);
});

test('rendered dwarf and bugbear choices retain distinct heights on the same base', async () => {
  // #given
  render(<PaperMinisGenerator />);
  fireEvent.click(screen.getByRole('button', { name: 'Добавить пустую строку' }));
  const select = screen.getByRole<HTMLSelectElement>('combobox', { name: 'Высота существа' });
  // #when
  fireEvent.change(select, { target: { value: 'medium-short' } });
  const dwarfGeometry = select.title;
  fireEvent.change(select, { target: { value: 'medium-tall' } });
  // #then
  expect({
    dwarf: within(select)
      .getByRole('option', { name: /дварф/ })
      .getAttribute('value'),
    bugbear: within(select)
      .getByRole('option', { name: /багбир/ })
      .getAttribute('value'),
    geometry: [dwarfGeometry, select.title],
  }).toEqual({
    dwarf: 'medium-short',
    bugbear: 'medium-tall',
    geometry: ['Основание 25 мм · высота 27 мм', 'Основание 25 мм · высота 43 мм'],
  });
});
