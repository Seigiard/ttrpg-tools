import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { mausritterEncounters } from '@/data/mausritter/encounters';
import { mockCrypto } from '@/test-utils/mock-crypto';
import { EncounterGenerator } from './EncounterGenerator';

/**
 * Тесты компонента — только presentation-слой. Логика бросков покрыта в
 * encounter-store.test.ts и range-table.test.ts.
 *
 * mount авто-бросает обе части: сначала check (d6), затем reaction (2d6) —
 * поэтому первое mock-значение идёт в check.
 */

describe('EncounterGenerator (Preact presentation)', () => {
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

  test('после монтирования показаны обе карточки: проверка и реакция', async () => {
    // #given check d6=1 (mock 0), reaction 2d6=2 (mock 0,0)
    restoreCrypto = mockCrypto([0, 0, 0]);
    render(<EncounterGenerator table={mausritterEncounters} />);

    expect(screen.getByTestId('check-result-card')).toBeDefined();
    expect(screen.getByTestId('reaction-result-card')).toBeDefined();
    await waitFor(() => {
      expect(screen.getByTestId('check-result').getAttribute('data-outcome')).toBe('encounter');
    });
  });

  test('исход проверки помечен data-outcome и показывает подпись', async () => {
    // #given check d6=1 → столкновение
    restoreCrypto = mockCrypto([0, 0, 0]);
    render(<EncounterGenerator table={mausritterEncounters} />);

    await waitFor(() => {
      const result = screen.getByTestId('check-result');
      expect(result.getAttribute('data-outcome')).toBe('encounter');
      expect(result.textContent).toContain(mausritterEncounters.check.rows[0].ru);
    });
  });

  test('исход «ничего» при d6=4', async () => {
    // #given check d6=4 (mock 3), reaction 2d6 (mock 0,0)
    restoreCrypto = mockCrypto([3, 0, 0]);
    render(<EncounterGenerator table={mausritterEncounters} />);

    await waitFor(() => {
      expect(screen.getByTestId('check-result').getAttribute('data-outcome')).toBe('clear');
    });
  });

  test('результат реакции показывает отношение и вопрос', async () => {
    // #given reaction 2d6=12 (mock 5,5) → дружелюбное; check d6 (mock 0)
    restoreCrypto = mockCrypto([0, 5, 5]);
    render(<EncounterGenerator table={mausritterEncounters} />);

    const lastRow = mausritterEncounters.reactions.rows[4];
    await waitFor(() => {
      const reaction = screen.getByTestId('reaction-result');
      expect(reaction.textContent).toContain(lastRow.ru);
      expect(reaction.querySelector('em')?.textContent).toBe(lastRow.question);
    });
  });

  test('клик «Проверить» перебрасывает только проверку', async () => {
    // #given mount: check d6=1; reaction. Затем клик: check d6=4 (mock 3)
    restoreCrypto = mockCrypto([0, 0, 0, 3]);
    render(<EncounterGenerator table={mausritterEncounters} />);

    await waitFor(() => {
      expect(screen.getByTestId('check-result').getAttribute('data-outcome')).toBe('encounter');
    });
    fireEvent.click(screen.getByTestId('check-roll-button'));

    await waitFor(() => {
      expect(screen.getByTestId('check-result').getAttribute('data-outcome')).toBe('clear');
    });
  });

  test('result-карточки обёрнуты Skeleton и присутствуют в DOM (защита от layout-shift)', async () => {
    restoreCrypto = mockCrypto([0, 0, 0]);
    render(<EncounterGenerator table={mausritterEncounters} />);

    const checkCard = screen.getByTestId('check-result-card');
    const reactionCard = screen.getByTestId('reaction-result-card');
    for (const card of [checkCard, reactionCard]) {
      // Skeleton-обёртки вшиты в карточку — значит высоту держит контент в обоих состояниях.
      expect(card.querySelector('[data-slot="skeleton"]')).not.toBeNull();
      // После броска маска снята.
    }
    await waitFor(() => {
      expect(checkCard.querySelector('[data-loading="true"]')).toBeNull();
      expect(reactionCard.querySelector('[data-loading="true"]')).toBeNull();
    });
  });

  test('подсветка в справочниках соответствует выпавшим строкам', async () => {
    // #given check d6=2 → строка 1 (omen); reaction 2d6=2 → строка 0
    restoreCrypto = mockCrypto([1, 0, 0]);
    render(<EncounterGenerator table={mausritterEncounters} />);

    await waitFor(() => {
      const checkRef = screen.getByTestId('check-reference');
      expect(checkRef.querySelector('[data-hit="true"]')?.getAttribute('data-row-index')).toBe('1');

      const reactionRef = screen.getByTestId('reaction-reference');
      expect(reactionRef.querySelector('[data-hit="true"]')?.getAttribute('data-row-index')).toBe('0');
    });
  });
});
