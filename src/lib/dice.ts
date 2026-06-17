/**
 * Кубики с честным равномерным распределением.
 *
 * Используем `crypto.getRandomValues` + rejection sampling, чтобы избежать modulo-bias:
 * на не-степенях двойки (например d20) простое `value % sides` смещает распределение
 * в сторону младших значений. Отбрасываем значения из «хвоста», который не делится на `sides` нацело.
 *
 * См. KTD1 в docs/plans/2026-06-17-001-feat-mausritter-locations-generator-plan.md.
 */

const UINT32_RANGE = 0x1_0000_0000;

/**
 * Бросает кубик с `sides` гранями. Возвращает целое в `[1, sides]`.
 *
 * @throws RangeError если `sides` не целое >= 1.
 */
export function roll(sides: number): number {
  if (!Number.isInteger(sides) || sides < 1) {
    throw new RangeError(`roll(sides): sides должно быть целым >= 1, получено ${sides}`);
  }
  if (sides === 1) return 1;

  // limit — наибольшее значение Uint32, кратное sides.
  // Всё что >= limit отбрасываем, чтобы не было перекоса.
  const limit = Math.floor(UINT32_RANGE / sides) * sides;

  const buf = new Uint32Array(1);
  // eslint-disable-next-line no-constant-condition
  while (true) {
    crypto.getRandomValues(buf);
    const value = buf[0];
    if (value < limit) {
      return (value % sides) + 1;
    }
  }
}

/**
 * Выбирает случайный элемент из таблицы. Возвращает 0-based индекс и значение.
 *
 * @throws RangeError если таблица пуста.
 */
export function pick<T>(table: readonly T[]): { index: number; value: T } {
  if (table.length === 0) {
    throw new RangeError('pick(table): таблица пуста');
  }
  const index = roll(table.length) - 1;
  return { index, value: table[index] as T };
}
