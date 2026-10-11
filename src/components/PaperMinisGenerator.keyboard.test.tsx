import { afterEach, expect, test } from 'bun:test';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import PaperMinisGenerator from './PaperMinisGenerator';

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==',
  'base64',
);

afterEach(() => {
  cleanup();
  localStorage.removeItem('pmg-settings');
});

async function addFront() {
  await act(async () => {
    fireEvent.change(screen.getByLabelText('Добавить изображения', { selector: 'input' }), {
      target: { files: [new File([png], 'figure.png', { type: 'image/png' })] },
    });
  });
}

async function openCalibration(frontHeight = 200) {
  localStorage.setItem('pmg-settings', JSON.stringify({ normalization: false }));

  // Only the PNG header is read at this seam; no pixel decoding takes place.
  const bytes = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==',
    'base64',
  );

  bytes.writeUInt32BE(frontHeight, 20);
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

test.each([
  { frontHeight: 200, backHeight: 400 },
  { frontHeight: 400, backHeight: 200 },
])(
  'keyboard steps and announced pixels use the taller artwork height ($frontHeight/$backHeight)',
  async ({ frontHeight, backHeight }) => {
    // #given
    await openCalibration(frontHeight);
    fireEvent.click(screen.getByRole('button', { name: 'Отмена' }));

    const bytes = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==',
      'base64',
    );

    bytes.writeUInt32BE(backHeight, 20);
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
    const head = dialog.getByRole('slider', { name: 'Голова' });
    fireEvent.keyDown(head, { key: 'ArrowDown' });
    const onePixel = head.getAttribute('aria-valuenow');
    fireEvent.keyDown(head, { key: 'ArrowDown', shiftKey: true });
    const afterShift = [head.getAttribute('aria-valuenow'), head.getAttribute('aria-valuetext')];
    // #then
    expect({ tabs: dialog.queryAllByRole('tab').length, onePixel, afterShift }).toEqual({
      tabs: 0,
      onePixel: '0.25',
      afterShift: ['2.75', '11 пикселей от верха'],
    });
  },
);

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

test('arrow keys prevent scrolling while other keys pass through unchanged', async () => {
  // #given
  const dialog = await openCalibration();
  const head = dialog.getByRole('slider', { name: 'Голова' });
  // #when
  const arrowHandled = fireEvent.keyDown(head, { key: 'ArrowDown' });
  const afterArrow = head.getAttribute('aria-valuenow');
  const tabHandled = fireEvent.keyDown(head, { key: 'Tab' });
  // #then
  expect({
    arrowHandled,
    tabHandled,
    afterArrow,
    afterTab: head.getAttribute('aria-valuenow'),
  }).toEqual({ arrowHandled: false, tabHandled: true, afterArrow: '0.5', afterTab: '0.5' });
});

test.each(['Enter', ' ', 'ArrowDown'])('height picker opens with %j', async (key) => {
  // #given
  render(<PaperMinisGenerator />);
  await addFront();
  const trigger = screen.getByRole('combobox', { name: 'Высота существа' });
  trigger.focus();
  // #when
  fireEvent.keyDown(trigger, { key });
  // #then
  expect(screen.getByRole('listbox')).toBeInstanceOf(HTMLElement);
});

test('height picker arrow navigation selects the highlighted option with Enter', async () => {
  // #given
  render(<PaperMinisGenerator />);
  await addFront();
  const trigger = screen.getByRole('combobox', { name: 'Высота существа' });
  trigger.focus();
  fireEvent.keyDown(trigger, { key: 'Enter' });
  const listbox = screen.getByRole('listbox');
  // #when
  fireEvent.keyDown(trigger, { key: 'ArrowDown' });

  const highlighted = within(listbox)
    .getAllByRole('option')
    .find((option) => option.hasAttribute('data-highlighted'))?.textContent;

  fireEvent.keyDown(trigger, { key: 'Enter' });
  // #then
  expect({ highlighted, value: trigger.textContent }).toEqual({
    highlighted: 'Средний, высокий · 2,1 мбагбир, голиаф',
    value: 'Средний, высокий · 2,1 м',
  });
});

test('height picker closes with Escape and returns focus to its trigger', async () => {
  // #given
  render(<PaperMinisGenerator />);
  await addFront();
  const trigger = screen.getByRole('combobox', { name: 'Высота существа' });
  trigger.focus();
  // #when
  fireEvent.keyDown(trigger, { key: 'Enter' });
  const popupWasOpen = screen.queryByRole('listbox') !== null;
  fireEvent.keyDown(trigger, { key: 'Escape' });
  // #then
  expect({
    popupWasOpen,
    popupClosed: screen.queryByRole('listbox') === null,
    focusReturned: document.activeElement === trigger,
  }).toEqual({ popupWasOpen: true, popupClosed: true, focusReturned: true });
});
