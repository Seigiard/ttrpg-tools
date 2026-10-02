import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { mausritterEncounters } from '@/data/mausritter/encounters';
import { mockCrypto } from '@/test-utils/mock-crypto';
import EncounterGenerator from './EncounterGenerator.svelte';

describe('EncounterGenerator (presentation)', () => {
  let restoreCrypto: (() => void) | null = null;

  beforeEach(cleanup);

  afterEach(() => {
    if (restoreCrypto) {
      restoreCrypto();
      restoreCrypto = null;
    }
    cleanup();
  });

  test('после монтирования показаны обе карточки: проверка и реакция', () => {
    // #given check d6=1 (mock 0), reaction 2d6=2 (mock 0,0)
    restoreCrypto = mockCrypto([0, 0, 0]);
    // #when the generator mounts
    render(EncounterGenerator, { table: mausritterEncounters });
    // #then both cards are present
    expect(screen.getByTestId('check-result-card')).toBeDefined();
    expect(screen.getByTestId('reaction-result-card')).toBeDefined();
  });

  test('исход проверки помечен data-outcome и показывает подпись', () => {
    // #given check d6=1 → столкновение
    restoreCrypto = mockCrypto([0, 0, 0]);
    // #when the generator mounts
    render(EncounterGenerator, { table: mausritterEncounters });
    // #then the check result carries the outcome and text
    const result = screen.getByTestId('check-result');
    expect(result.getAttribute('data-outcome')).toBe('encounter');
    expect(result.textContent).toContain(mausritterEncounters.check.rows[0].ru);
  });

  test('исход «ничего» при d6=4', () => {
    // #given check d6=4 (mock 3), reaction 2d6 (mock 0,0)
    restoreCrypto = mockCrypto([3, 0, 0]);
    // #when the generator mounts
    render(EncounterGenerator, { table: mausritterEncounters });
    // #then the check outcome is clear
    expect(screen.getByTestId('check-result').getAttribute('data-outcome')).toBe('clear');
  });

  test('история проверок растёт от нового к старому', async () => {
    // #given mount: check d6=1; reaction. Затем клики: d6=2, d6=3
    restoreCrypto = mockCrypto([0, 0, 0, 1, 2]);
    render(EncounterGenerator, { table: mausritterEncounters });
    // #when check rolls twice
    await fireEvent.click(screen.getByTestId('check-roll-button'));
    await fireEvent.click(screen.getByTestId('check-roll-button'));
    // #then history is newest first
    const entries = Array.from(screen.getByTestId('check-history').querySelectorAll('li'));
    expect(entries.map((entry) => entry.textContent)).toEqual([
      'd6 = 3Ничего',
      'd6 = 2Предзнаменование',
      'd6 = 1Столкновение',
    ]);
  });

  test('история проверок хранит не больше пяти записей', async () => {
    // #given mount: check d6=1; reaction. Затем клики: d6=2..6
    restoreCrypto = mockCrypto([0, 0, 0, 1, 2, 3, 4, 5]);
    render(EncounterGenerator, { table: mausritterEncounters });
    // #when check rolls five more times
    await fireEvent.click(screen.getByTestId('check-roll-button'));
    await fireEvent.click(screen.getByTestId('check-roll-button'));
    await fireEvent.click(screen.getByTestId('check-roll-button'));
    await fireEvent.click(screen.getByTestId('check-roll-button'));
    await fireEvent.click(screen.getByTestId('check-roll-button'));
    // #then only the last five entries remain
    const entries = Array.from(screen.getByTestId('check-history').querySelectorAll('li'));
    expect(entries.map((entry) => entry.textContent)).toEqual([
      'd6 = 6Ничего',
      'd6 = 5Ничего',
      'd6 = 4Ничего',
      'd6 = 3Ничего',
      'd6 = 2Предзнаменование',
    ]);
  });

  test('кнопка очистки удаляет историю проверок', async () => {
    // #given mount: check d6=1; reaction. Затем клик: d6=2
    restoreCrypto = mockCrypto([0, 0, 0, 1]);
    render(EncounterGenerator, { table: mausritterEncounters });
    // #when history is cleared
    await fireEvent.click(screen.getByTestId('check-roll-button'));
    await fireEvent.click(screen.getByTestId('check-history-clear'));
    // #then no history entries remain
    expect(screen.getByTestId('check-history').querySelectorAll('li')).toHaveLength(0);
  });

  test('результат реакции показывает отношение и вопрос', () => {
    // #given reaction 2d6=12 (mock 5,5) → дружелюбное; check d6 (mock 0)
    restoreCrypto = mockCrypto([0, 5, 5]);
    // #when the generator mounts
    render(EncounterGenerator, { table: mausritterEncounters });
    // #then the reaction text and question are shown
    const reaction = screen.getByTestId('reaction-result');
    const lastRow = mausritterEncounters.reactions.rows[4];
    expect(reaction.textContent).toContain(lastRow.ru);
    expect(reaction.querySelector('em')?.textContent).toBe(lastRow.question);
  });

  test('клик «Проверить» перебрасывает только проверку', async () => {
    // #given mount: check d6=1; reaction. Затем клик: check d6=4 (mock 3)
    restoreCrypto = mockCrypto([0, 0, 0, 3]);
    render(EncounterGenerator, { table: mausritterEncounters });
    // #when only the check rerolls
    await fireEvent.click(screen.getByTestId('check-roll-button'));
    // #then the check outcome updates
    expect(screen.getByTestId('check-result').getAttribute('data-outcome')).toBe('clear');
  });

  test('result-карточки обёрнуты Skeleton и присутствуют в DOM (защита от layout-shift)', () => {
    // #given a mounted generator
    restoreCrypto = mockCrypto([0, 0, 0]);
    render(EncounterGenerator, { table: mausritterEncounters });
    // #then skeleton wrappers remain but are not loading after the first roll
    for (const testId of ['check-result-card', 'reaction-result-card']) {
      const card = screen.getByTestId(testId);
      expect(card.querySelector('[data-slot="skeleton"]')).not.toBeNull();
      expect(card.querySelector('[data-loading="true"]')).toBeNull();
    }
  });

  test('подсветка в справочниках соответствует выпавшим строкам', () => {
    // #given check d6=2 → строка 1 (omen); reaction 2d6=2 → строка 0
    restoreCrypto = mockCrypto([1, 0, 0]);
    // #when the generator mounts
    render(EncounterGenerator, { table: mausritterEncounters });
    // #then both reference lists mark the rolled row
    const checkRef = screen.getByTestId('check-reference');
    expect(checkRef.querySelector('[data-hit="true"]')?.getAttribute('data-row-index')).toBe('1');

    const reactionRef = screen.getByTestId('reaction-reference');
    expect(reactionRef.querySelector('[data-hit="true"]')?.getAttribute('data-row-index')).toBe(
      '0',
    );
  });
});
