import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { mausritterLocations } from '@/data/mausritter/locations';
import { LocationGenerator } from './LocationGenerator';

/**
 * Мокаем crypto.getRandomValues, чтобы тесты были детерминистичными.
 * Возвращаем заранее заданную последовательность Uint32 значений.
 */
function mockCrypto(sequence: number[]) {
  const original = crypto.getRandomValues.bind(crypto);
  let i = 0;
  crypto.getRandomValues = ((buf: Uint32Array) => {
    const value = sequence[i++];
    if (value === undefined) throw new Error('тестовая последовательность исчерпана');
    buf[0] = value;
    return buf;
  }) as typeof crypto.getRandomValues;
  return () => {
    crypto.getRandomValues = original;
  };
}

describe('LocationGenerator', () => {
  let restoreCrypto: (() => void) | null = null;

  beforeEach(() => {
    cleanup();
  });

  afterEach(() => {
    if (restoreCrypto) {
      restoreCrypto();
      restoreCrypto = null;
    }
  });

  test('начальное состояние: нет результата, есть кнопка «Бросить локацию»', () => {
    render(<LocationGenerator table={mausritterLocations} />);
    expect(screen.getByTestId('roll-button')).toBeDefined();
    expect(screen.queryByTestId('result-card')).toBeNull();
  });

  test('клик «Бросить локацию» создаёт результат с обеими частями', () => {
    // Для d20 limit = floor(2^32 / 20) * 20 = 4294967280.
    // Любое value < limit принимается; result = value % 20.
    // Хотим landmarkIndex = 0, detailIndex = 2 → value = 0 и value = 2.
    restoreCrypto = mockCrypto([0, 2]);
    render(<LocationGenerator table={mausritterLocations} />);

    fireEvent.click(screen.getByTestId('roll-button'));

    expect(screen.getByTestId('result-card')).toBeDefined();
    const landmark = screen.getByTestId('result-landmark');
    const detail = screen.getByTestId('result-detail');
    expect(landmark.textContent).toContain(mausritterLocations.landmarks.countryside[0].ru);
    expect(detail.textContent).toContain(mausritterLocations.details[2].ru);
  });

  test('reroll ориентира не меняет деталь', () => {
    restoreCrypto = mockCrypto([
      0, // первый roll: landmark idx 0
      5, // первый roll: detail idx 5
      7, // reroll landmark: idx 7
    ]);
    render(<LocationGenerator table={mausritterLocations} />);

    fireEvent.click(screen.getByTestId('roll-button'));
    const detailBefore = screen.getByTestId('result-detail').textContent;

    fireEvent.click(screen.getByRole('button', { name: /перебросить ориентир/i }));
    const detailAfter = screen.getByTestId('result-detail').textContent;

    expect(detailAfter).toBe(detailBefore);
    // landmark должен поменяться (idx был 0, стал 7)
    expect(screen.getByTestId('result-landmark').textContent).toContain(
      mausritterLocations.landmarks.countryside[7].ru,
    );
  });

  test('reroll детали не меняет ориентир', () => {
    restoreCrypto = mockCrypto([
      3, // landmark idx 3
      10, // detail idx 10
      15, // reroll detail: idx 15
    ]);
    render(<LocationGenerator table={mausritterLocations} />);

    fireEvent.click(screen.getByTestId('roll-button'));
    const landmarkBefore = screen.getByTestId('result-landmark').textContent;

    fireEvent.click(screen.getByRole('button', { name: /перебросить деталь/i }));
    const landmarkAfter = screen.getByTestId('result-landmark').textContent;

    expect(landmarkAfter).toBe(landmarkBefore);
    expect(screen.getByTestId('result-detail').textContent).toContain(
      mausritterLocations.details[15].ru,
    );
  });

  test('подсветка строки в справочной таблице соответствует выпавшему индексу', () => {
    restoreCrypto = mockCrypto([
      4, // landmark idx 4
      11, // detail idx 11
    ]);
    const { container } = render(<LocationGenerator table={mausritterLocations} />);
    fireEvent.click(screen.getByTestId('roll-button'));

    const landmarkTable = screen.getByTestId('reference-landmarks');
    const hitLandmark = landmarkTable.querySelector('[data-hit="true"]');
    expect(hitLandmark).not.toBeNull();
    expect(hitLandmark?.getAttribute('data-row-index')).toBe('4');

    const detailTable = screen.getByTestId('reference-details');
    const hitDetail = detailTable.querySelector('[data-hit="true"]');
    expect(hitDetail?.getAttribute('data-row-index')).toBe('11');

    // Чтобы линтер не ругался на неиспользованный container.
    expect(container).toBeDefined();
  });

  test('detail с question рендерит вопрос italic под основным текстом', () => {
    restoreCrypto = mockCrypto([
      0, // landmark
      0, // detail idx 0: «Древний храм культа летучих мышей» (Что было призвано?)
    ]);
    render(<LocationGenerator table={mausritterLocations} />);
    fireEvent.click(screen.getByTestId('roll-button'));

    const detail = screen.getByTestId('result-detail');
    const em = detail.querySelector('em');
    expect(em).not.toBeNull();
    expect(em?.textContent).toBe(mausritterLocations.details[0].question);
  });
});
