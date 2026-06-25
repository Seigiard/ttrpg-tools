# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Проектные конвенции TTRPG Tools. Только неочевидное — остальное читается в коде, `README.md` и `docs/DESIGN.md`.

## Команды

```sh
bun run dev          # дев-сервер, http://localhost:4321
bun run build        # сборка в dist/
bun test             # все тесты
bun test src/data/range-table.test.ts   # один файл
bun test -t "pickRange"                  # по паттерну имени describe/test
bun run lint         # oxlint (TS/TSX)
bun run typecheck    # astro check
bun run format       # oxfmt (TS/TSX/CSS); .astro — bun run format:astro (prettier)
```

CI (`.github/workflows/ci.yml`) на каждый PR гоняет **lint + format:check + typecheck + test + build** — всё должно проходить. Перед завершением работы прогоняй эти же шаги. Деплой (Cloudflare Workers + Static Assets) идёт сам из `main`; см. README.

Тесты используют happy-dom через `preload` в `bunfig.toml` (`test-setup.ts`) — DOM доступен без ручной настройки. Алиас `@/` → `src/`.

## Архитектура: генераторы по таблицам

Каждый инструмент — Astro-страница со statiс-контентом + React-остров (`client:load`). Генератор разложен на изолированные слои; добавление нового идёт по этой же цепочке:

1. **Данные** — `src/data/<system>/<tool>.ts`: чистые таблицы + формула `RollSpec` (`{count, sides}`). Перевод авторский, шероховатость оригинала (открытые вопросы в скобках) сохраняем.
2. **Хелпер броска** — переиспользуй существующий, не пиши свой RNG:
   - равномерная `1d{length}` или произвольная `NdX` с одним индексом на сумму → `data/random-table.ts` (`pickFromTable`).
   - суммы сгруппированы в диапазоны (`2d6 → 3–5`, `d6 → 3–6`) → `data/range-table.ts` (`pickRange` / `validateRanges` / `findRangeIndex`). `weather-table.ts` — тонкая доменная обёртка над ним; новые range-генераторы строятся на `range-table`.
   - честный RNG (crypto + rejection sampling против modulo-bias) живёт в `src/lib/dice.ts` — единственный источник случайности.
3. **Стор** — `src/stores/<tool>-store.ts`: фабрика `create…Store(table)` возвращает nanostores-атомы (`$…`) + операции. Без React — логика state-машины тестируется здесь напрямую.
4. **Компонент** — `src/components/<Tool>Generator.tsx`: только presentation. Стор создаётся через `useMemo(() => create…Store(table), [table])`, подписка — `useStore` из `@nanostores/react`. Примитивы UI (`Button`, `Card`, `Tabs`) — в `src/components/ui/` (shadcn-стиль); переиспользуй их, не верстай сырыми элементами.
5. **Страница** — `src/pages/<system>/<tool>.astro` (`ToolLayout` + `AttributionFooter`) и карточка-ссылка в `src/pages/index.astro`.

### SSR-гоча

Первый бросок — в `useEffect` на клиенте, **не** в store-init и не в `useState`. Иначе SSR-снепшот и клиент дадут разные значения и hydration сломается:

```tsx
useEffect(() => {
  if (store.$roll.get() === null) store.rollAll();
}, [store]);
```

## Тесты: инварианты, не зеркала

- **Data-тесты** (`<system>/<tool>.test.ts`): проверяй ИНВАРИАНТЫ, не значения. Хорошо: `validateRanges`/`validateTable` не throws, у всех строк непустой `ru`/`question`/`hint`, уникальность (исход встречается ровно раз). Плохо: `rows[0].ru === 'Враждебное'`, `roll === {count:1,sides:6}` — это зеркало соседнего файла, ломается на смене редакции перевода без реальной регрессии.
- **Тонкие wrapper'ы не тестируем** — если функция делегирует в покрытый хелпер, тест дублирует базовый. Базовые утили (`range-table`, `dice`) покрываем подробно — из них питается всё.
- **Стор-тесты**: уникальное поведение state-машины (начальное состояние, броски, no-op, независимость частей).
- **Компонент-тесты**: presentation — `data-testid`, маршрутизация кликов, специфика разметки (`data-*`-флаги, подсветка строк). Не пересекаются со стор-тестами.
- **Детерминизм бросков** — `mockCrypto` из `src/test-utils/mock-crypto.ts` (не копировать локально). `roll(sides) = value % sides + 1`, т.е. mock-значение задаёт грань напрямую.

## Дизайн

Токены — `src/styles/global.css` (`@theme` Tailwind v4), правила и палитра — `docs/DESIGN.md`. Используй семантические классы (`bg-primary`, `text-text-muted`, `font-display`), не сырые hex. Только системные шрифты. Цвет — не единственный носитель смысла (подсветка строки = цвет + левая граница + bold).
