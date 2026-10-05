import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { blackHackPrices, expandRolls } from '@/data/the-black-hack/prices';
import { serialize, type PricesState } from '@/data/the-black-hack/prices-codec';
import { itemPrice } from '@/stores/the-black-hack-prices-store';
import { mockCrypto } from '@/test-utils/mock-crypto';
import { mockLocalStorage, type MockLocalStorageHandle } from '@/test-utils/mock-local-storage';
import BlackHackPricesGenerator from './BlackHackPricesGenerator.svelte';

const STORAGE_KEY = 'the-black-hack:prices';

const PAGE_URL = 'http://localhost/the-black-hack/prices';

function setPageUrl(url: string): void {
  // SAFETY: The Bun preload registers a happy-dom window with the setURL API.
  (window as typeof window & { happyDOM: { setURL(url: string): void } }).happyDOM.setURL(url);
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
    cleanup();
  });

  test('голый mount: цены выброшены, URL содержит s и r с версией', () => {
    // #given crypto отдаёт seed 12345
    restoreCrypto = mockCrypto([12345]);
    // #when the generator mounts without saved state
    render(BlackHackPricesGenerator, { table: blackHackPrices });
    // #then prices are ready and URL carries the serialized state
    expect(document.querySelector('[data-loading="true"]')).toBeNull();
    expect(currentUrlParam('s')).toBe('rural');
    expect(currentUrlParam('r')).toBe(`${(12345).toString(36)}.${blackHackPrices.version}`);
  });

  test('mount с валидным URL-стейтом: crypto не вызывается, цены соответствуют seed', () => {
    // #given пустой мок: любой бросок упал бы
    restoreCrypto = mockCrypto([]);
    const state: PricesState = { settlement: 'city', seed: 777 };
    setPageUrl(`${PAGE_URL}?${serialize(state, blackHackPrices)}`);
    // #when the generator mounts
    render(BlackHackPricesGenerator, { table: blackHackPrices });
    // #then visible prices come from the URL seed
    const rolls = expandRolls(777, blackHackPrices);
    const common = blackHackPrices.categories[0];
    const expected = itemPrice(rolls[0][0], common, common.items[0]);

    const firstPrice = screen
      .getByTestId('category-common')
      .querySelector('[data-testid="item-price"]');

    expect(firstPrice?.textContent).toContain(String(expected));
  });

  test('URL-стейт приоритетнее localStorage, localStorage перезаписан стейтом из URL', () => {
    // #given AE2: в хранилище «город», в ссылке «большой город»
    restoreCrypto = mockCrypto([]);
    storage.store.set(STORAGE_KEY, serialize({ settlement: 'town', seed: 111 }, blackHackPrices));
    const urlQuery = serialize({ settlement: 'city', seed: 222 }, blackHackPrices);
    setPageUrl(`${PAGE_URL}?${urlQuery}`);
    // #when the generator mounts
    render(BlackHackPricesGenerator, { table: blackHackPrices });
    // #then URL wins and storage is overwritten
    expect(screen.getByRole('tab', { selected: true }).textContent).toBe('Большой город');
    expect(storage.store.get(STORAGE_KEY)).toBe(urlQuery);
  });

  test('mount без URL-стейта при валидном localStorage: стейт восстановлен, URL дополнен', () => {
    // #given valid storage state
    restoreCrypto = mockCrypto([]);
    const storedQuery = serialize({ settlement: 'town', seed: 333 }, blackHackPrices);
    storage.store.set(STORAGE_KEY, storedQuery);
    // #when the generator mounts
    render(BlackHackPricesGenerator, { table: blackHackPrices });
    // #then storage is restored into UI and URL
    expect(screen.getByRole('tab', { selected: true }).textContent).toBe('Город');
    expect(window.location.search).toBe(`?${storedQuery}`);
  });

  test('битый URL-стейт (невалидный r) при валидном localStorage: фолбэк на localStorage', () => {
    // #given invalid URL state and valid storage state
    restoreCrypto = mockCrypto([]);
    storage.store.set(STORAGE_KEY, serialize({ settlement: 'town', seed: 333 }, blackHackPrices));
    setPageUrl(`${PAGE_URL}?s=city&r=!!!.${blackHackPrices.version}`);
    // #when the generator mounts
    render(BlackHackPricesGenerator, { table: blackHackPrices });
    // #then storage state is used
    expect(screen.getByRole('tab', { selected: true }).textContent).toBe('Город');
  });

  test('эффект синхронизации не перезаписывает входящий URL-стейт промежуточным состоянием', () => {
    // #given URL state
    restoreCrypto = mockCrypto([]);
    const urlQuery = serialize({ settlement: 'town', seed: 555 }, blackHackPrices);
    setPageUrl(`${PAGE_URL}?${urlQuery}`);
    // #when the generator mounts
    render(BlackHackPricesGenerator, { table: blackHackPrices });
    // #then the URL state stays canonical
    expect(window.location.search).toBe(`?${urlQuery}`);
    expect(storage.store.get(STORAGE_KEY)).toBe(urlQuery);
  });

  test('клик «Перебросить всё»: цены меняются, URL и localStorage обновлены', async () => {
    // #given an existing URL state and a next seed
    restoreCrypto = mockCrypto([999]);
    setPageUrl(`${PAGE_URL}?${serialize({ settlement: 'city', seed: 1 }, blackHackPrices)}`);
    render(BlackHackPricesGenerator, { table: blackHackPrices });
    // #when all prices reroll
    await fireEvent.click(screen.getByTestId('roll-button'));
    // #then URL and storage are updated
    expect(currentUrlParam('r')).toBe(`${(999).toString(36)}.${blackHackPrices.version}`);
    expect(storage.store.get(STORAGE_KEY)).toBe(
      serialize({ settlement: 'city', seed: 999 }, blackHackPrices),
    );
  });

  test('клик по табу типа: цены переброшены, URL обновлён', async () => {
    // #given AE4
    restoreCrypto = mockCrypto([888]);
    setPageUrl(`${PAGE_URL}?${serialize({ settlement: 'rural', seed: 1 }, blackHackPrices)}`);
    render(BlackHackPricesGenerator, { table: blackHackPrices });
    // #when settlement changes
    await fireEvent.click(screen.getByRole('tab', { name: 'Город' }));
    // #then URL records the new settlement and seed
    expect(currentUrlParam('s')).toBe('town');
    expect(currentUrlParam('r')).toBe(`${(888).toString(36)}.${blackHackPrices.version}`);
  });

  test('тип «сельская местность»: секции редкого и экзотического отсутствуют в DOM', () => {
    // #given AE3
    restoreCrypto = mockCrypto([]);
    setPageUrl(`${PAGE_URL}?${serialize({ settlement: 'rural', seed: 42 }, blackHackPrices)}`);
    // #when the generator mounts
    render(BlackHackPricesGenerator, { table: blackHackPrices });
    // #then unavailable categories are absent
    expect(screen.getByTestId('category-common')).toBeDefined();
    expect(screen.queryByTestId('category-rare')).toBeNull();
    expect(screen.queryByTestId('category-exotic')).toBeNull();
  });

  test('строка брони показывает цену с множителем предмета', () => {
    // #given a city seed with armor visible
    restoreCrypto = mockCrypto([]);
    const state: PricesState = { settlement: 'city', seed: 42 };
    setPageUrl(`${PAGE_URL}?${serialize(state, blackHackPrices)}`);
    // #when the generator mounts
    render(BlackHackPricesGenerator, { table: blackHackPrices });
    // #then armor price includes its item multiplier
    const rolls = expandRolls(42, blackHackPrices);
    const rare = blackHackPrices.categories[1];
    const armorIndex = rare.items.findIndex((i) => i.multiplier !== undefined);
    const armor = rare.items[armorIndex];
    const expected = itemPrice(rolls[1][armorIndex], rare, armor);
    const row = screen.getByText(armor.ru).closest('tr');
    expect(row?.querySelector('[data-testid="item-price"]')?.textContent).toContain(
      String(expected),
    );
  });

  test('localStorage.setItem с исключением не ломает рендер и обновление URL', () => {
    // #given storage throws on write
    storage.restore();
    storage = mockLocalStorage({ failSetItem: true });
    restoreCrypto = mockCrypto([12345]);
    // #when the generator mounts
    render(BlackHackPricesGenerator, { table: blackHackPrices });
    // #then render and URL sync still succeed
    expect(document.querySelector('[data-loading="true"]')).toBeNull();
    expect(currentUrlParam('r')).toBe(`${(12345).toString(36)}.${blackHackPrices.version}`);
  });
});
