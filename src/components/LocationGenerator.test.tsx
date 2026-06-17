import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { mausritterLocations } from '@/data/mausritter/locations';
import { LocationGenerator } from './LocationGenerator';

/**
 * Мокаем crypto.getRandomValues, чтобы тесты были детерминистичными.
 * Возвращаем заранее заданную последовательность Uint32 значений.
 *
 * Все тесты потребляют минимум 2 значения на mount (auto-roll в useEffect):
 * первое для landmark, второе для detail.
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

  test('сразу после монтирования показан результат (без клика)', () => {
    restoreCrypto = mockCrypto([0, 2]);
    render(<LocationGenerator table={mausritterLocations} />);

    expect(screen.getByTestId('result-card')).toBeDefined();
    const landmark = screen.getByTestId('result-landmark');
    const detail = screen.getByTestId('result-detail');
    expect(landmark.textContent).toContain(mausritterLocations.landmarks.countryside[0].ru);
    expect(detail.textContent).toContain(mausritterLocations.details[2].ru);
  });

  test('клик «Бросить локацию» перебрасывает обе части', () => {
    restoreCrypto = mockCrypto([
      0,
      2, // mount
      4,
      9, // reroll
    ]);
    render(<LocationGenerator table={mausritterLocations} />);

    fireEvent.click(screen.getByTestId('roll-button'));

    expect(screen.getByTestId('result-landmark').textContent).toContain(
      mausritterLocations.landmarks.countryside[4].ru,
    );
    expect(screen.getByTestId('result-detail').textContent).toContain(
      mausritterLocations.details[9].ru,
    );
  });

  test('reroll ориентира не меняет деталь', () => {
    restoreCrypto = mockCrypto([
      0,
      5, // mount: landmark=0, detail=5
      7, // reroll landmark: idx 7
    ]);
    render(<LocationGenerator table={mausritterLocations} />);
    const detailBefore = screen.getByTestId('result-detail').textContent;

    fireEvent.click(screen.getByRole('button', { name: /перебросить ориентир/i }));

    expect(screen.getByTestId('result-detail').textContent).toBe(detailBefore);
    expect(screen.getByTestId('result-landmark').textContent).toContain(
      mausritterLocations.landmarks.countryside[7].ru,
    );
  });

  test('reroll детали не меняет ориентир', () => {
    restoreCrypto = mockCrypto([
      3,
      10, // mount: landmark=3, detail=10
      15, // reroll detail: idx 15
    ]);
    render(<LocationGenerator table={mausritterLocations} />);
    const landmarkBefore = screen.getByTestId('result-landmark').textContent;

    fireEvent.click(screen.getByRole('button', { name: /перебросить деталь/i }));

    expect(screen.getByTestId('result-landmark').textContent).toBe(landmarkBefore);
    expect(screen.getByTestId('result-detail').textContent).toContain(
      mausritterLocations.details[15].ru,
    );
  });

  test('смена биома автоматически перебрасывает (а не сбрасывает в null)', () => {
    restoreCrypto = mockCrypto([
      0,
      0, // mount: countryside, landmark=0, detail=0
      11,
      4, // смена биома на forest: landmark=11, detail=4
    ]);
    render(<LocationGenerator table={mausritterLocations} />);

    fireEvent.click(screen.getByRole('tab', { name: 'Лес' }));

    expect(screen.getByTestId('result-card')).toBeDefined();
    expect(screen.getByTestId('result-landmark').textContent).toContain(
      mausritterLocations.landmarks.forest[11].ru,
    );
  });

  test('подсветка строки в справочной таблице соответствует выпавшему индексу', () => {
    restoreCrypto = mockCrypto([4, 11]); // mount
    render(<LocationGenerator table={mausritterLocations} />);

    const landmarkTable = screen.getByTestId('reference-landmarks');
    const hitLandmark = landmarkTable.querySelector('[data-hit="true"]');
    expect(hitLandmark?.getAttribute('data-row-index')).toBe('4');

    const detailTable = screen.getByTestId('reference-details');
    const hitDetail = detailTable.querySelector('[data-hit="true"]');
    expect(hitDetail?.getAttribute('data-row-index')).toBe('11');
  });

  test('detail с question рендерит вопрос italic под основным текстом', () => {
    restoreCrypto = mockCrypto([
      0,
      0, // mount: detail idx 0 — «Древний храм культа летучих мышей» (Что было призвано?)
    ]);
    render(<LocationGenerator table={mausritterLocations} />);

    const detail = screen.getByTestId('result-detail');
    const em = detail.querySelector('em');
    expect(em?.textContent).toBe(mausritterLocations.details[0].question);
  });
});
