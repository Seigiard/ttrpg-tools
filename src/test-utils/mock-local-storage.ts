/**
 * Подменяет `window.localStorage` изолированным in-memory хранилищем —
 * для детерминированных тестов персистенса без утечки состояния между тестами.
 *
 * `failSetItem: true` эмулирует quota/приватный режим: `setItem` бросает,
 * как настоящий Storage при переполнении.
 *
 * Возвращает `store` для инспекции содержимого и `restore` — вызывать в `afterEach`.
 */

export interface MockLocalStorageOptions {
  /** Начальное содержимое хранилища. */
  initial?: Record<string, string>;
  /** Каждый `setItem` бросает исключение. */
  failSetItem?: boolean;
}

export interface MockLocalStorageHandle {
  /** Живое содержимое мока — для ассертов. */
  store: Map<string, string>;
  restore(): void;
}

export function mockLocalStorage(options: MockLocalStorageOptions = {}): MockLocalStorageHandle {
  const store = new Map<string, string>(Object.entries(options.initial ?? {}));

  const fake: Storage = {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => {
      if (options.failSetItem) {
        throw new Error('mockLocalStorage: setItem запрещён (эмуляция quota/приватного режима)');
      }
      store.set(key, String(value));
    },
    removeItem: (key) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
    key: (index) => [...store.keys()][index] ?? null,
    get length() {
      return store.size;
    },
  };

  // happy-dom может держать разные биндинги на globalThis и window — подменяем оба.
  const targets = [globalThis, typeof window === 'undefined' ? null : window]
    .filter((t): t is typeof globalThis => t !== null)
    .filter((t, i, all) => all.indexOf(t) === i);

  const originals = targets.map((target) => ({
    target,
    descriptor: Object.getOwnPropertyDescriptor(target, 'localStorage'),
  }));
  for (const target of targets) {
    Object.defineProperty(target, 'localStorage', { value: fake, configurable: true });
  }

  return {
    store,
    restore() {
      for (const { target, descriptor } of originals) {
        if (descriptor) {
          Object.defineProperty(target, 'localStorage', descriptor);
        } else {
          delete (target as { localStorage?: Storage }).localStorage;
        }
      }
    },
  };
}
