/**
 * Мокает `crypto.getRandomValues` детерминированной последовательностью —
 * для воспроизводимых бросков в тестах.
 *
 * `roll(sides)` в `lib/dice.ts` вычисляет `value % sides + 1`, поэтому каждое
 * mock-значение напрямую задаёт грань: для d6 mock `0` → грань 1, mock `5` → грань 6.
 * Бросок `count d sides` потребляет `count` значений по порядку.
 *
 * Возвращает функцию восстановления оригинала — вызывать в `afterEach`.
 */
export function mockCrypto(sequence: number[]): () => void {
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
