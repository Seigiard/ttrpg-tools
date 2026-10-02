import { afterEach, expect, test } from 'bun:test';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import PaperMinisGenerator from './PaperMinisGenerator';

afterEach(() => {
  cleanup();
  localStorage.removeItem('pmg-settings');
});

async function openCalibration() {
  localStorage.setItem('pmg-settings', JSON.stringify({ normalization: false }));
  // Only the PNG header is read at this seam; no pixel decoding takes place.
  const bytes = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==',
    'base64',
  );
  bytes.writeUInt32BE(200, 20);
  render(<PaperMinisGenerator />);
  await act(async () => {
    fireEvent.change(screen.getByLabelText('Добавить изображения', { selector: 'input' }), {
      target: { files: [new File([bytes], 'figure.png', { type: 'image/png' })] },
    });
  });
  fireEvent.click(screen.getByRole('button', { name: 'Задать рост' }));
  return within(screen.getByRole('dialog'));
}

test('calibration lines expose named vertical sliders in the tab order', async () => {
  // #given
  const dialog = await openCalibration();
  // #when
  const sliders = ['Голова', 'Ступни'].map((name) => {
    const slider = dialog.getByRole<HTMLButtonElement>('slider', { name });
    slider.focus();
    return {
      focused: document.activeElement === slider,
      tabIndex: slider.tabIndex,
      orientation: slider.getAttribute('aria-orientation'),
      value: slider.getAttribute('aria-valuenow'),
    };
  });
  // #then
  expect(sliders).toEqual([
    { focused: true, tabIndex: 0, orientation: 'vertical', value: '0' },
    { focused: true, tabIndex: 0, orientation: 'vertical', value: '100' },
  ]);
});
test('back keyboard steps and announced pixels use the active artwork height', async () => {
  // #given
  await openCalibration();
  fireEvent.click(screen.getByRole('button', { name: 'Отмена' }));
  const bytes = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==',
    'base64',
  );
  bytes.writeUInt32BE(400, 20);
  await act(async () => {
    fireEvent.change(
      screen.getByLabelText('Оборот: отражение лицевой стороны', { selector: 'input' }),
      {
        target: { files: [new File([bytes], 'back.png', { type: 'image/png' })] },
      },
    );
  });
  fireEvent.click(screen.getByRole('button', { name: 'Задать рост' }));
  const dialog = within(screen.getByRole('dialog'));
  // #when
  fireEvent.click(dialog.getByRole('tab', { name: 'Зад' }));
  const head = dialog.getByRole('slider', { name: 'Голова' });
  fireEvent.keyDown(head, { key: 'ArrowDown' });
  const onePixel = head.getAttribute('aria-valuenow');
  fireEvent.keyDown(head, { key: 'ArrowDown', shiftKey: true });
  const back = [head.getAttribute('aria-valuenow'), head.getAttribute('aria-valuetext')];
  fireEvent.click(dialog.getByRole('tab', { name: 'Перед' }));
  fireEvent.keyDown(head, { key: 'ArrowDown' });
  // #then
  expect({ onePixel, back, front: head.getAttribute('aria-valuenow') }).toEqual({
    onePixel: '0.25',
    back: ['2.75', '11 пикселей от верха'],
    front: '0.5',
  });
});
test('arrows move each line by artwork pixels and update the live print height', async () => {
  // #given
  const dialog = await openCalibration();
  const head = dialog.getByRole('slider', { name: 'Голова' });
  const feet = dialog.getByRole('slider', { name: 'Ступни' });
  // #when
  const handled = fireEvent.keyDown(head, { key: 'ArrowDown' });
  const onePixel = head.getAttribute('aria-valuenow');
  fireEvent.keyDown(head, { key: 'ArrowDown', shiftKey: true });
  fireEvent.keyDown(head, { key: 'ArrowUp' });
  fireEvent.keyDown(feet, { key: 'ArrowUp', shiftKey: true });
  fireEvent.keyDown(feet, { key: 'ArrowUp' });
  fireEvent.keyDown(feet, { key: 'ArrowDown' });
  // #then
  expect({
    handled,
    onePixel,
    positions: [head.getAttribute('aria-valuenow'), feet.getAttribute('aria-valuenow')],
    readout: dialog.getByText(/Рост 35 мм ·/).textContent,
  }).toEqual({
    handled: false,
    onePixel: '0.5',
    positions: ['5', '95'],
    readout: 'Рост 35 мм · напечатается 39 мм',
  });
});

test('slider ranges announce the movement allowed by the other line', async () => {
  // #given
  const dialog = await openCalibration();
  const head = dialog.getByRole('slider', { name: 'Голова' });
  const feet = dialog.getByRole('slider', { name: 'Ступни' });
  // #when
  fireEvent.keyDown(feet, { key: 'ArrowUp', shiftKey: true });
  // #then
  expect(
    [head, feet].map((el) => [el.getAttribute('aria-valuemin'), el.getAttribute('aria-valuemax')]),
  ).toEqual([
    ['0', '85'],
    ['10', '100'],
  ]);
});
test('keyboard moves keep both lines inside the artwork and at least 10 percent apart', async () => {
  // #given
  const dialog = await openCalibration();
  const head = dialog.getByRole('slider', { name: 'Голова' });
  const feet = dialog.getByRole('slider', { name: 'Ступни' });
  const positions = () => [
    Number(head.getAttribute('aria-valuenow')),
    Number(feet.getAttribute('aria-valuenow')),
  ];
  // #when
  fireEvent.keyDown(head, { key: 'ArrowUp', shiftKey: true });
  fireEvent.keyDown(feet, { key: 'ArrowDown', shiftKey: true });
  const edges = positions();
  for (let i = 0; i < 25; i++) fireEvent.keyDown(head, { key: 'ArrowDown', shiftKey: true });
  const headLimit = positions();
  for (let i = 0; i < 25; i++) fireEvent.keyDown(head, { key: 'ArrowUp', shiftKey: true });
  for (let i = 0; i < 25; i++) fireEvent.keyDown(feet, { key: 'ArrowUp', shiftKey: true });
  const feetLimit = positions();
  const unhandled = fireEvent.keyDown(feet, { key: 'Tab' });
  // #then
  expect({ edges, headLimit, feetLimit, unhandled, afterTab: positions() }).toEqual({
    edges: [0, 100],
    headLimit: [90, 100],
    feetLimit: [0, 10],
    unhandled: true,
    afterTab: [0, 10],
  });
});
