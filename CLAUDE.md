# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Проектные конвенции TTRPG Tools. Только неочевидное — остальное читается в коде, `README.md` и `docs/DESIGN.md`.

## Agent skills

### Issue tracker

Issues live in GitHub Issues for `Seigiard/ttrpg-tools`, managed with the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage roles use the default label strings (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` at the repo root and ADRs in `docs/adr/`. See `docs/agents/domain.md`.

## Команды

```sh
bun run dev          # дев-сервер, http://localhost:4321
bun run build        # сборка в dist/
bun run size         # production build + bundle size check
bun run size:check   # check an existing dist/ build
bun test             # unit-тесты
bun run test:browser # Playwright/Chromium: browser-тесты Paper minis
bun test src/data/range-table.test.ts   # один файл
bun test -t "pickRange"                  # по паттерну имени describe/test
bun run lint         # oxlint (TS/TSX)
bun run typecheck    # astro check
bun run format       # oxfmt (TS/TSX/CSS); .astro — bun run format:astro (prettier)
```

CI (`.github/workflows/ci.yml`) на каждый PR гоняет **lint + format:check + typecheck + test + build + size:check + test:browser** — всё должно проходить. Перед завершением работы прогоняй эти же шаги; `size:check` запускай после сборки. Деплой (Cloudflare Workers + Static Assets) идёт сам из `main`; см. README.

Тесты используют happy-dom через `preload` в `bunfig.toml` (`test-setup.ts`) — DOM доступен без ручной настройки. Алиас `@/` → `src/`.

Browser-тесты Paper minis живут в `tests/paper-minis/`. Меняешь путь с Canvas API, декодированием изображения или скачиванием PDF — добавь сценарий только для поведения, которого не видит happy-dom, и запусти `bun run test:browser`. Chromium ставится один раз: `bunx playwright install chromium`.

## Архитектура: генераторы по таблицам

Каждый инструмент — Astro-страница со static-контентом + React-остров (`client:load`). Генератор разложен на изолированные слои; добавление нового идёт по этой же цепочке:

1. **Данные** — `src/data/<system>/<tool>.ts`: чистые таблицы + формула `RollSpec` (`{count, sides}`). Перевод авторский, шероховатость оригинала (открытые вопросы в скобках) сохраняем.
2. **Хелпер броска** — вся случайность идёт через `src/lib/dice.ts` или `src/lib/seeded-rng.ts`; поверх них выбирай хелпер по форме таблицы:
   - равномерная `1d{length}` или произвольная `NdX` с одним индексом на сумму → `data/random-table.ts` (`pickFromTable`).
   - суммы сгруппированы в диапазоны (`2d6 → 3–5`, `d6 → 3–6`) → `data/range-table.ts` (`pickRange` / `validateRanges` / `findRangeIndex`). `weather-table.ts` — тонкая доменная обёртка над ним; новые range-генераторы строятся на `range-table`.
   - честный RNG (crypto + rejection sampling против modulo-bias) живёт в `src/lib/dice.ts`.
   - стейт, который восстанавливается из ссылки (цены The Black Hack), выводит грани из seed через `src/lib/seeded-rng.ts`. Его контракт заморожен: перед изменением генерации или порядка потребления значений прочитай шапку этого файла.
3. **Стор** — `src/stores/<tool>-store.ts`: фабрика `create…Store(table)` возвращает nanostores-атомы (`$…`) + операции. Без React — логика state-машины тестируется здесь напрямую.
4. **Компонент** — `src/components/<Tool>Generator.tsx`: только presentation. Стор создаётся через `useMemo(() => create…Store(table), [table])`, подписка — `useStore` из `@nanostores/react`. Примитивы UI (`Button`, `Card`, `Tabs`) — в `src/components/ui/` (shadcn-стиль); переиспользуй их, не верстай сырыми элементами.
5. **Страница** — `src/pages/<system>/<tool>.astro` (`ToolLayout` + `AttributionFooter`) и карточка-ссылка в `src/pages/index.astro`.

Paper minis живёт вне этой цепочки: стор без таблицы (`createPaperMinisStore()`), страница `src/pages/paper-minis.astro`. Перед изменением раскладки листа, калибровки, имён экспортируемых файлов или базовых стилей прочитай ADR в `docs/adr/`.

### SSR-гоча

Первый бросок — в `useEffect` на клиенте, **не** в store-init и не в `useState`. Иначе SSR-снепшот и клиент дадут разные значения и hydration сломается. Пример из `LocationGenerator`; имена атомов и операций у каждого стора свои:

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

Токены — `src/styles/global.css` (`@theme` Tailwind v4), правила и палитра — `docs/DESIGN.md`. Используй семантические классы (`bg-primary`, `text-text-muted`, `font-display`), не сырые hex. Только системные шрифты. Цвет — не единственный носитель смысла (подсветка строки = цвет + левая граница).
