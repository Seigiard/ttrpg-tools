import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { blackHackPrices, totalDiceCount } from '@/data/the-black-hack/prices';
import { serialize, type PricesState } from '@/data/the-black-hack/prices-codec';
import type { SettlementType } from '@/data/types';
import { itemPrice } from '@/stores/the-black-hack-prices-store';
import { mockCrypto } from '@/test-utils/mock-crypto';
import { mockLocalStorage, type MockLocalStorageHandle } from '@/test-utils/mock-local-storage';
import { BlackHackPricesGenerator } from './BlackHackPricesGenerator';

/**
 * Тесты компонента: presentation + первый в репо слой персистенса.
 * Логика бросков покрыта в the-black-hack-prices-store.test.ts, кодек — в prices-codec.test.ts.
 */

const STORAGE_KEY = 'the-black-hack:prices';
const PAGE_URL = 'http://localhost/the-black-hack/prices';

function setPageUrl(url: string): void {
  (window as unknown as { happyDOM: { setURL(url: string): void } }).happyDOM.setURL(url);
}

/** Полный стейт с гранью (n + offset) % 8 + 1 у n-го кубика в каноническом порядке. */
function makeState(settlement: SettlementType, offset = 0): PricesState {
  let n = 0;
  return {
    settlement,
    rolls: blackHackPrices.categories.map((c) =>
      c.items.map(() => Array.from({ length: c.roll.count }, () => ((n++ + offset) % 8) + 1)),
    ),
  };
}

/** Мок-последовательность на один полный бросок таблицы. */
function fullSequence(offset = 0): number[] {
  return Array.from({ length: totalDiceCount(blackHackPrices) }, (_, n) => (n + offset) % 8);
}

function currentUrlParam(name: string): string | null {
  return new URLSearchParams(window.location.search).get(name);
}

describe('BlackHackPricesGenerator', () => {
  let restoreCrypto: (() => void) | null = null;
  let storage: MockLocalStorageHandle;

  beforeEach(() => {
    cleanup();
    setPageUrl(PAGE_URL);
    storage = mockLocalStorage();
  });

  afterEach(() => {
    if (restoreCrypto) {
      restoreCrypto();
      restoreCrypto = null;
    }
    storage.restore();
  });

  test('голый mount: цены выброшены, URL содержит s, v, r', () => {
    restoreCrypto = mockCrypto(fullSequence());
    render(<BlackHackPricesGenerator table={blackHackPrices} />);

    expect(document.querySelector('[data-loading="true"]')).toBeNull();
    expect(currentUrlParam('s')).toBe('rural');
    expect(currentUrlParam('v')).toBe(blackHackPrices.version);
    expect(currentUrlParam('r')).toMatch(/^[1-8]+$/);
  });

  test('mount с валидным URL-стейтом: RNG не вызывается, цены соответствуют граням', () => {
    // #given пустой мок: любой бросок упал бы
    restoreCrypto = mockCrypto([]);
    const state = makeState('city');
    setPageUrl(`${PAGE_URL}?${serialize(state, blackHackPrices)}`);

    render(<BlackHackPricesGenerator table={blackHackPrices} />);

    const common = blackHackPrices.categories[0];
    const expected = itemPrice(state.rolls[0][0], common, common.items[0]);
    const firstPrice = screen
      .getByTestId('category-common')
      .querySelector('[data-testid="item-price"]');
    expect(firstPrice?.textContent).toContain(String(expected));
  });

  test('URL-стейт приоритетнее localStorage, localStorage перезаписан стейтом из URL', () => {
    // #given AE2: в хранилище «город», в ссылке «большой город»
    restoreCrypto = mockCrypto([]);
    storage.store.set(STORAGE_KEY, serialize(makeState('town', 2), blackHackPrices));
    const urlState = makeState('city');
    const urlQuery = serialize(urlState, blackHackPrices);
    setPageUrl(`${PAGE_URL}?${urlQuery}`);

    render(<BlackHackPricesGenerator table={blackHackPrices} />);

    expect(screen.getByRole('tab', { selected: true }).textContent).toBe('Большой город');
    expect(storage.store.get(STORAGE_KEY)).toBe(urlQuery);
  });

  test('mount без URL-стейта при валидном localStorage: стейт восстановлен, URL дополнен', () => {
    restoreCrypto = mockCrypto([]);
    const stored = makeState('town', 4);
    const storedQuery = serialize(stored, blackHackPrices);
    storage.store.set(STORAGE_KEY, storedQuery);

    render(<BlackHackPricesGenerator table={blackHackPrices} />);

    expect(screen.getByRole('tab', { selected: true }).textContent).toBe('Город');
    expect(window.location.search).toBe(`?${storedQuery}`);
  });

  test('битый URL-стейт (неверная длина r) при валидном localStorage: фолбэк на localStorage', () => {
    restoreCrypto = mockCrypto([]);
    const stored = makeState('town', 4);
    storage.store.set(STORAGE_KEY, serialize(stored, blackHackPrices));
    setPageUrl(`${PAGE_URL}?s=city&v=${blackHackPrices.version}&r=123`);

    render(<BlackHackPricesGenerator table={blackHackPrices} />);

    expect(screen.getByRole('tab', { selected: true }).textContent).toBe('Город');
  });

  test('эффект синхронизации не перезаписывает входящий URL-стейт промежуточным состоянием', () => {
    restoreCrypto = mockCrypto([]);
    const urlQuery = serialize(makeState('town', 5), blackHackPrices);
    setPageUrl(`${PAGE_URL}?${urlQuery}`);

    render(<BlackHackPricesGenerator table={blackHackPrices} />);

    expect(window.location.search).toBe(`?${urlQuery}`);
    expect(storage.store.get(STORAGE_KEY)).toBe(urlQuery);
  });

  test('клик «Перебросить всё»: цены меняются, URL и localStorage обновлены', () => {
    restoreCrypto = mockCrypto(fullSequence(1));
    const initial = makeState('city');
    setPageUrl(`${PAGE_URL}?${serialize(initial, blackHackPrices)}`);
    render(<BlackHackPricesGenerator table={blackHackPrices} />);
    const rBefore = currentUrlParam('r');

    fireEvent.click(screen.getByTestId('roll-button'));

    const rAfter = currentUrlParam('r');
    expect(rAfter).not.toBe(rBefore);
    expect(storage.store.get(STORAGE_KEY)).toBe(`s=city&v=${blackHackPrices.version}&r=${rAfter}`);
  });

  test('клик по табу типа: цены переброшены, URL обновлён', () => {
    // #given AE4
    restoreCrypto = mockCrypto(fullSequence(3));
    setPageUrl(`${PAGE_URL}?${serialize(makeState('rural'), blackHackPrices)}`);
    render(<BlackHackPricesGenerator table={blackHackPrices} />);
    const rBefore = currentUrlParam('r');

    fireEvent.click(screen.getByRole('tab', { name: 'Город' }));

    expect(currentUrlParam('s')).toBe('town');
    expect(currentUrlParam('r')).not.toBe(rBefore);
  });

  test('тип «сельская местность»: секции редкого и экзотического отсутствуют в DOM', () => {
    // #given AE3
    restoreCrypto = mockCrypto([]);
    setPageUrl(`${PAGE_URL}?${serialize(makeState('rural'), blackHackPrices)}`);

    render(<BlackHackPricesGenerator table={blackHackPrices} />);

    expect(screen.getByTestId('category-common')).toBeDefined();
    expect(screen.queryByTestId('category-rare')).toBeNull();
    expect(screen.queryByTestId('category-exotic')).toBeNull();
  });

  test('строка брони показывает цену с множителем предмета', () => {
    restoreCrypto = mockCrypto([]);
    const state = makeState('city');
    setPageUrl(`${PAGE_URL}?${serialize(state, blackHackPrices)}`);

    render(<BlackHackPricesGenerator table={blackHackPrices} />);

    const rare = blackHackPrices.categories[1];
    const armorIndex = rare.items.findIndex((i) => i.multiplier !== undefined);
    const armor = rare.items[armorIndex];
    const expected = itemPrice(state.rolls[1][armorIndex], rare, armor);
    const row = screen.getByText(armor.ru).closest('tr');
    expect(row?.querySelector('[data-testid="item-price"]')?.textContent).toContain(
      String(expected),
    );
  });

  test('localStorage.setItem с исключением не ломает рендер и обновление URL', () => {
    storage.restore();
    storage = mockLocalStorage({ failSetItem: true });
    restoreCrypto = mockCrypto(fullSequence());

    render(<BlackHackPricesGenerator table={blackHackPrices} />);

    expect(document.querySelector('[data-loading="true"]')).toBeNull();
    expect(currentUrlParam('r')).toMatch(/^[1-8]+$/);
  });
});
