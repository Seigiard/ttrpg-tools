# feat: Mausritter locations generator (первая итерация платформы TTRPG Tools)

**Origin:** `docs/brainstorms/2026-06-17-ttrpg-tools-platform-requirements.md`
**Тип:** feat
**Глубина:** Standard
**Дата:** 2026-06-17

## Summary

Создать с нуля SPA-платформу TTRPG-инструментов (`ttrpg-tools`) с первым работающим экраном `/mausritter/locations`: интерактивный генератор локаций по двум d20-таблицам Mausritter на русском языке. Стек: Astro + React islands + TypeScript + Tailwind + shadcn (Base UI primitives). Хостинг: Cloudflare Pages (оставляет открытой дверь под будущие AI-Workers без миграции). Внутренний RNG строится на `crypto.getRandomValues` + rejection sampling — не на `Math.random`. Дизайн-токены — отдельный артефакт `docs/DESIGN.md` по образцу awesome-design-skills.

---

## Problem Frame

Сейчас в репо пусто. Брифа достаточно, чтобы оценить целевую форму платформы и первой работающей фичи. Задача плана — превратить рамку из брифа в исполнимую последовательность шагов: инициализация стека, конфигурация деплоя, дизайн-токены, дайс-библиотека, типизированные данные таблиц, интерактивный компонент, страница инструмента.

Главные технические решения, которые должен закрепить план:
- Как именно ставится shadcn с Base UI (а не Radix).
- Как обеспечивается честное равномерное распределение d20.
- Какая форма JSON-схемы данных таблиц переживёт добавление новых систем (Cairn, Mörk Borg) без миграции.
- Как лежит первый Astro-проект, чтобы добавление следующих инструментов было аддитивным.

---

## Requirements

Из origin-документа карьерно переносятся:

- **R1.** Платформа SPA, билд под статику, хостинг Cloudflare Pages. (origin: «Стек», «Деплой»)
- **R2.** URL-схема `/<система>/<инструмент>` — первой реализуется `/mausritter/locations`. (origin: «Структура репо», «Первая итерация»)
- **R3.** Перевод вступительного текста статьи Mausritter Locations на русский. (origin: «Что должно работать»)
- **R4.** Селектор биома (Countryside / Forest / River / Human town) с русскими названиями. (origin: «Что должно работать»)
- **R5.** Кнопка «Бросить локацию» собирает результат из Landmark (по выбранному биому) + Location detail. (origin: «Что должно работать»)
- **R6.** Каждую часть результата можно перебросить отдельно, не теряя вторую. (origin: «Что должно работать»)
- **R7.** Под результатом видны исходные таблицы как справка. Выпавшая строка подсвечена. (origin: «Что должно работать»)
- **R8.** Атрибуция Mausritter Third Party License в футере. (origin: «Что должно работать»)
- **R9.** Броски — `crypto.getRandomValues` + rejection sampling. Не `Math.random`. (origin: «Стек», обсуждение в крите)
- **R10.** UI-компоненты — shadcn с Base UI как primitives. (origin: «Стек»)
- **R11.** Дизайн-токены — `docs/DESIGN.md` по образцу [bergside/awesome-design-skills/ant](https://github.com/bergside/awesome-design-skills/tree/main/skills/ant) (frontmatter с токенами + секции SKILL.md-стиля). (origin: «Стили / дизайн-токены»)
- **R12.** Менеджер пакетов — bun. Test runner — встроенный `bun test`. (origin: «Стек»)
- **R13.** Архитектура должна позволять добавлять новые системы и инструменты аддитивно, не переписывая существующее. (origin: «Цель», «Следующие шаги»)

**Вне рамки первой итерации (origin → Scope Boundaries ниже):** журнал бросков, localStorage, шеринг по URL, тёмная тема, PWA, мобильная оптимизация, карточки врагов, бестиарии, AI-описания.

---

## Scope Boundaries

### В рамках этого плана

- Скелет Astro-проекта с настроенными React + Tailwind + shadcn/Base UI.
- Cloudflare Pages деплой (через git-интеграцию, не Wrangler-CLI в первой итерации).
- `docs/DESIGN.md` с токенами и правилами.
- `src/lib/dice.ts` с crypto-RNG.
- Типизированные данные локаций Mausritter (перевод на русский).
- Компонент `LocationGenerator` + страница `/mausritter/locations`.
- Главная страница `/` — минимальный лендинг со списком инструментов (один пункт пока).

### Deferred to Follow-Up Work (отдельные планы)

- Карточки врагов Mausritter.
- Дополнительные генераторы Mausritter (settlements, NPCs и т. п.).
- Подключение других TTRPG-систем (Cairn, Mörk Borg, OSE).
- Cloudflare Worker `/api/describe` для AI-генерации описаний.
- localStorage-журнал брошенных локаций.
- Шеринг состояния броска по URL.
- Тёмная тема / PWA / оффлайн-режим.

### Outside this product's identity (из origin)

- БД, аутентификация, синхронизация между устройствами.
- Многопользовательский режим.
- Любые системы кроме TTRPG (видеоигры, варгеймы).
- UI-конструктор своих таблиц (таблицы редактируются как код).

---

## Key Technical Decisions

### KTD1. RNG: `crypto.getRandomValues` + rejection sampling

Для честного равномерного `[1, sides]` на не-степенях-двойки (особенно d20) `Uint32 % sides` даёт небольшой modulo-bias. Алгоритм: генерим `Uint32`, отбрасываем значения из «хвоста» (`>= maxValid = floor(2^32 / sides) * sides`), берём `result = value % sides + 1`. Запас потерь на d20: ~10⁻⁹, на d100: ~10⁻⁹ — пренебрежимо. Этот же приём переиспользуем когда подключим `rpg-dice-roller` (инжектим свой RNG).

**Альтернативы рассмотрены:** `Math.random() * sides | 0 + 1` (дешевле, но привязан к качеству PRNG движка и теряет точность на больших гранях); seeded PRNG вроде Mulberry32 (для повторяемых сессий — отложено до появления требования воспроизводимости).

### KTD2. shadcn + Base UI

`npx shadcn create` поддерживает выбор Radix или Base UI как primitive layer (с декабря 2025). Берём Base UI согласно предпочтению. API одинаковый, отличается реализация под капотом.

**Альтернативы:** Radix (отвергнуто — пользователь предпочитает Base UI), чистый Base UI без shadcn (отвергнуто — теряем готовые tailwind-стили и token-конвенции shadcn).

### KTD3. Astro static + Cloudflare Pages git-интеграция

`output: 'static'` в `astro.config`, билд `bun run build`, выход `dist/`. Cloudflare Pages — через подключение GitHub-репо, без Wrangler. Preview-деплои для PR автоматически. Workers оставляем «на потом» — не подключаем в первой итерации, чтобы не плодить пустую инфраструктуру.

### KTD4. Данные таблиц как `as const` TypeScript

Не JSON, не YAML. Причины: (1) типизация распространяется в UI без отдельной кодгенерации; (2) опечатка в названии биома ловится компилятором; (3) `as const` даёт литеральные типы для autocomplete. Файл `src/data/mausritter/locations.ts` экспортирует структуру вида `{ landmarks: Record<BiomeKey, readonly LocationRow[]>; details: readonly LocationRow[] }`. Под расширение на другие системы (`src/data/cairn/...`) — общий interface `LocationTable` в `src/data/types.ts`.

### KTD5. Атомарность бросков — состояние в React, не в URL

Текущий результат броска — `useState` в `LocationGenerator`. Перебросить часть = обновить один ключ объекта-результата. В первой итерации никакого URL-state и no localStorage, согласно origin. Дверь под URL-state (`useSearchParams`-аналог) оставляем — структура объекта-результата `{ landmark: LandmarkRoll, detail: DetailRoll }` сериализуется тривиально.

### KTD6. Линтер/форматтер — Biome

Один инструмент вместо ESLint + Prettier. Биjar tooling, быстрее, нативно работает с TS/TSX. Astro-файлы форматируются `prettier-plugin-astro` (отдельно) — единственное исключение.

### KTD7. Тесты — `bun test`

Встроенный, без vitest/jest. Покрывает `lib/dice.ts` (статистика и rejection sampling), компонент тестируется через `@testing-library/react` + `happy-dom`.

---

## Output Structure

```text
ttrpg-tools/
├── astro.config.mjs
├── tailwind.config.mjs
├── tsconfig.json
├── biome.json
├── components.json                       # shadcn config (style + primitives=base-ui)
├── package.json
├── bunfig.toml                           # bun test config (preload happy-dom)
├── README.md
├── docs/
│   ├── DESIGN.md                         # дизайн-токены + правила
│   ├── brainstorms/
│   │   └── 2026-06-17-ttrpg-tools-platform-requirements.md
│   └── plans/
│       └── 2026-06-17-001-feat-mausritter-locations-generator-plan.md
└── src/
    ├── env.d.ts
    ├── styles/global.css                 # tailwind + CSS-переменные дизайн-токенов
    ├── pages/
    │   ├── index.astro                   # лендинг со списком инструментов
    │   └── mausritter/
    │       └── locations.astro           # страница инструмента
    ├── content/                          # MDX-вступления (если решим выносить)
    │   └── mausritter/locations.intro.mdx
    ├── layouts/
    │   └── ToolLayout.astro
    ├── components/
    │   ├── LocationGenerator.tsx
    │   ├── LocationGenerator.test.tsx
    │   ├── AttributionFooter.astro
    │   └── ui/                           # shadcn-компоненты (Button, Tabs, Card)
    ├── data/
    │   ├── types.ts                      # общие типы LocationTable, RollResult
    │   └── mausritter/
    │       └── locations.ts              # типизированные d20-таблицы
    └── lib/
        ├── dice.ts                       # roll(sides), pick(table)
        └── dice.test.ts
```

---

## High-Level Technical Design

### Поток броска локации

```text
┌────────────────────┐  click "Бросить"   ┌──────────────────────┐
│ BiomeSelector       ├─────────────────►│ LocationGenerator     │
│ (4 сегмента, Tabs)  │                  │ state: { landmark,    │
└────────────────────┘                  │         detail }      │
        ▲                                └──────────┬───────────┘
        │ selected biome                            │ rollAll() / rollPart()
        │                                            ▼
        │                                  ┌──────────────────────┐
        │                                  │ lib/dice.ts          │
        │                                  │ roll(20) → 1..20     │
        │                                  │ pick(table[roll-1])  │
        │                                  └──────────┬───────────┘
        │                                            │
┌───────┴────────────┐    биом + индексы            ▼
│ ResultCard          │◄──────────────────  data/mausritter/locations.ts
│ - Landmark row      │
│ - Detail row        │
│ - reroll-this btn × 2 │
└─────────────────────┘
        ▲
        │ выпавший индекс
        ▼
┌─────────────────────┐
│ ReferenceTables     │   подсвечивает строку с выпавшим индексом
└─────────────────────┘
```

### Расширение под другие системы (будущее)

```text
src/data/types.ts
  interface LocationTable<Biome extends string> {
    landmarks: Record<Biome, readonly LocationRow[]>;
    details: readonly LocationRow[];
  }

src/data/mausritter/locations.ts  ─┐
src/data/cairn/encounters.ts       │ конкретные таблицы реализуют интерфейс
src/data/mork-borg/locations.ts    │
                                   ┘
src/components/LocationGenerator.tsx
  принимает `table: LocationTable<Biome>` пропсом → переиспользуется для разных систем
```

В первой итерации `LocationGenerator` импортирует `mausritter/locations` напрямую — generic-параметризация добавляется когда появится второй стол данных (не сейчас, согласно YAGNI).

---

## Implementation Units

### U1. Инициализация Astro-проекта (bun + TypeScript + Tailwind + React)

**Goal:** Чистый Astro-проект, открывающийся локально (`bun run dev`) и собирающийся в `dist/` (`bun run build`).

**Requirements:** R1, R12

**Dependencies:** —

**Files:**
- `package.json`
- `astro.config.mjs`
- `tailwind.config.mjs`
- `tsconfig.json`
- `bunfig.toml`
- `biome.json`
- `src/env.d.ts`
- `src/pages/index.astro` (заглушка)
- `src/styles/global.css`
- `README.md`
- `.gitignore`

**Approach:**
1. `bun create astro@latest .` → minimal template, TypeScript strict, без примеров.
2. Astro integrations: `@astrojs/react`, `@astrojs/tailwind`, `@astrojs/mdx`.
3. `astro.config.mjs` — `output: 'static'`, `site: 'https://ttrpg-tools.pages.dev'` (поправим если поменяется), `integrations: [react(), tailwind({ applyBaseStyles: false }), mdx()]`. `applyBaseStyles: false` — стили вешаем сами через `src/styles/global.css`.
4. Tailwind v3 — добавим `content: ['./src/**/*.{astro,html,js,jsx,ts,tsx,md,mdx}']`.
5. `biome.json` для линта/форматирования TS/TSX, `prettier-plugin-astro` отдельно для `.astro`-файлов.
6. `bunfig.toml` — `preload = ["happy-dom/register"]` для DOM в тестах.
7. README — README с командами разработки.

**Patterns to follow:** Astro starter из официальной доки; bun-init документация.

**Execution note:** не подключать shadcn в этом юните — он идёт в U3 отдельно.

**Test scenarios:**
- Test expectation: none — этот юнит чисто конфигурационный. Проверка: `bun run dev` поднимается на http://localhost:4321 и отдаёт заглушку index.astro; `bun run build` без ошибок создаёт `dist/index.html`.

**Verification:**
- `bun run dev` показывает «Hello TTRPG Tools» (или любой минимальный текст).
- `bun run build` завершается успешно, `dist/` создан.
- `bun run lint` / `bun run format` запускаются без ошибок на пустом проекте.

---

### U2. `docs/DESIGN.md` + интеграция токенов в Tailwind

**Goal:** Дизайн-токены формализованы как артефакт и доступны Tailwind как CSS-переменные / theme-расширение.

**Requirements:** R11

**Dependencies:** U1

**Files:**
- `docs/DESIGN.md` (новый, по образцу [skills/ant/DESIGN.md](https://github.com/bergside/awesome-design-skills/blob/main/skills/ant/DESIGN.md) + [skills/ant/SKILL.md](https://github.com/bergside/awesome-design-skills/blob/main/skills/ant/SKILL.md))
- `tailwind.config.mjs` (обновление: `theme.extend.colors`, `fontFamily`, `borderRadius`, `spacing` из токенов)
- `src/styles/global.css` (CSS-переменные :root)

**Approach:**
1. `docs/DESIGN.md` копирует структуру ant-skill: YAML-frontmatter с `colors / typography / rounded / spacing` + секции Overview, Style Foundations, Colors, Typography, Spacing, Components (пока пустая, дополняется по мере появления), Accessibility (WCAG 2.2 AA, focus-visible, touch-target ≥ 44px), Writing tone (русский, без англицизмов), Rules: Do / Don't, Anti-patterns, QA checklist.
2. Палитра: тёплая бумага (`surface #FBF7EF`), охра-сиена `primary #B45309` для интерактивных элементов, тёмный текст `#1C1917`. Шрифты: Cormorant Garamond (заголовки), Inter (тело), JetBrains Mono (метки). Это пристрелочный диалект — может корректироваться в U-юнитах когда увидим живьём.
3. Токены проникают в Tailwind через `theme.extend` (имена цветов `primary / surface / text-muted / border` и т. п.). CSS-переменные дублируют их в `:root` для случаев, когда нужен прямой доступ.
4. `prettier`/`biome` не трогаем MD — оставляем как есть.

**Patterns to follow:** [bergside/awesome-design-skills/ant/DESIGN.md](https://github.com/bergside/awesome-design-skills/blob/main/skills/ant/DESIGN.md) — структура YAML + секции.

**Test scenarios:**
- Test expectation: none — артефакт + конфиг. Проверка: Tailwind видит `bg-primary`, `text-surface`, `font-display` (Cormorant) и компилирует их в готовые классы.

**Verification:**
- В тестовой странице `index.astro` пара `<div class="bg-primary text-surface font-display">` рендерится с ожидаемыми цветами и шрифтом.
- `docs/DESIGN.md` проходит ручную проверку: frontmatter валидный YAML, все секции из ant-образца присутствуют.

---

### U3. `npx shadcn create` с Base UI + базовые компоненты UI

**Goal:** shadcn-инфраструктура подключена с Base UI как primitive layer; `Button`, `Tabs`, `Card` доступны в `src/components/ui/`.

**Requirements:** R10

**Dependencies:** U1, U2 (токены должны быть в Tailwind — shadcn-компоненты ссылаются на цвета `primary`, `secondary` и т. п.)

**Files:**
- `components.json` (shadcn-конфиг с `primitives: "base-ui"`)
- `src/components/ui/button.tsx`
- `src/components/ui/tabs.tsx`
- `src/components/ui/card.tsx`
- `src/lib/utils.ts` (`cn` helper из shadcn)
- `package.json` (новые зависимости от Base UI)

**Approach:**
1. `bun x shadcn@latest init` → выбрать Base UI как primitive library, Tailwind v3, путь `src/components/ui`, утилиты `src/lib/utils.ts`.
2. Проверить что `components.json` содержит `"primitives": "base-ui"` (или эквивалент в актуальной версии CLI).
3. `bun x shadcn@latest add button tabs card` — генерирует компоненты в `src/components/ui/`.
4. Подкрутить варианты `button` под палитру: `default` → `primary`, `outline` → border `primary`. Это правка готового файла, не новый компонент.
5. Убедиться, что shadcn-генерированные стили используют CSS-переменные из U2 (а не свои дефолтные `--primary`-токены) — при необходимости переименовать в `tailwind.config.mjs`.

**Patterns to follow:** [shadcn changelog 2026-01](https://ui.shadcn.com/docs/changelog/2026-01-base-ui) — Base UI как primitives.

**Test scenarios:**
- Test expectation: none — генерация + ручная настройка. Проверка в U7 при использовании компонентов.

**Verification:**
- `import { Button } from '@/components/ui/button'` работает в `.tsx` файле.
- На тестовой странице рендерится `<Button>Бросить</Button>` со стилями primary из U2.

---

### U4. `src/lib/dice.ts` — crypto-RNG + rejection sampling

**Goal:** Криптостойкий равномерный RNG для целых в `[1, sides]` без modulo-bias. Покрытие тестами.

**Requirements:** R9

**Dependencies:** U1

**Files:**
- `src/lib/dice.ts`
- `src/lib/dice.test.ts`

**Approach:**
1. `roll(sides: number): number` — генерим `Uint32` через `crypto.getRandomValues(new Uint32Array(1))[0]`. Вычисляем `limit = Math.floor(0x1_0000_0000 / sides) * sides`. Если значение `>= limit` — повторяем. Возвращаем `value % sides + 1`.
2. `pick<T>(table: readonly T[]): { index: number; value: T }` — `const index = roll(table.length) - 1; return { index, value: table[index] }`. Используется компонентом, чтобы знать какую строку подсветить в справочной таблице.
3. Граничные случаи: `sides < 1` или нецелое → throw (`RangeError`). `sides === 1` → всегда возвращает 1.
4. `dice.test.ts` использует `bun test`.

**Test scenarios:**
- **Happy path:** `roll(20)` 10000 раз — каждое значение из `[1, 20]` появляется ≥ 1 раз; среднее ∈ `[10.0, 11.0]` (для 10k бросков — широкий запас по CI).
- **Распределение:** для `roll(20)` 100000 раз χ²-тест с 19 степенями свободы даёт p-value > 0.001 (т. е. не отклоняем uniform). Чтобы не таскать stats-lib — вручную считаем χ² и сравниваем с критическим значением 43.82 (α=0.001).
- **Граница sides=1:** `roll(1)` всегда возвращает 1.
- **Граница sides=256:** все значения из `[1, 256]` достижимы в 100000 бросков (256 — степень двойки, проверяет что rejection sampling не отбрасывает валидные значения).
- **Невалидный вход:** `roll(0)` бросает `RangeError`; `roll(-5)` бросает `RangeError`; `roll(1.5)` бросает `RangeError`.
- **`pick` consistency:** `pick(['a', 'b', 'c'])` 1000 раз — все три значения наблюдаются, `index` соответствует `value` (т. е. `table[index] === value`).
- **Rejection sampling корректность:** мокаем `crypto.getRandomValues`, возвращаем последовательность значений включающую «отбрасываемое» (≥ `limit` для d20). Проверяем, что `roll(20)` пропускает его и возвращает следующее валидное.

**Verification:**
- `bun test src/lib/dice.test.ts` — все сценарии green.

---

### U5. Mausritter location data (типизированные таблицы, перевод)

**Goal:** Данные локаций Mausritter (4 биома × 20 landmarks + 20 location details) типизированы и переведены на русский.

**Requirements:** R3, R4, R13

**Dependencies:** U1

**Files:**
- `src/data/types.ts`
- `src/data/mausritter/locations.ts`

**Approach:**
1. `src/data/types.ts`:
   ```text
   type LocationRow = { ru: string; question?: string }  // question для строк с "(What was summoned?)"
   interface LocationTable<Biome extends string> {
     biomes: readonly Biome[]                              // ["countryside", "forest", "river", "human-town"]
     biomeLabels: Record<Biome, string>                    // русские названия для UI
     landmarks: Record<Biome, readonly LocationRow[]>      // длина каждого массива = 20
     details: readonly LocationRow[]                       // длина = 20
   }
   ```
2. `locations.ts` экспортирует константу с `as const`-аннотацией, реализующую интерфейс. Биомы: `"countryside" | "forest" | "river" | "human-town"`. Русские названия: «Деревня», «Лес», «Река», «Город людей».
3. Переводим все 80 landmarks + 20 details по таблице из [losing.games/2019-07-24-mausritter-locations](https://losing.games/2019-07-24-mausritter-locations/). Где есть вопрос в скобках (`(What was summoned?)`) — выносим в `question` отдельным полем, оставляя `ru` без хвоста; UI рендерит вопрос italic под основным значением.
4. Перевод — литературный, но без отсебятины: сохраняем шероховатость оригинала (см. brief: «Settlement…»).
5. Compile-time guard: длина каждого `landmarks[biome]` и `details` фиксированно 20 — выражаем через `readonly [LocationRow, LocationRow, ..., LocationRow]` (tuple длины 20) или хотя бы рантайм-assert на старте Astro-сборки.

**Patterns to follow:** [исходник losing.games](https://losing.games/2019-07-24-mausritter-locations/) как источник правды; терминология — общеупотребительный игровой русский для OSR (Mausritter community переводов на момент написания не имеет официальных, переводчик — автор).

**Test scenarios:**
- **Compile-time:** TypeScript видит ровно 4 биома в union; попытка добавить пятый ключ в `landmarks` без расширения union → ошибка компиляции.
- **Runtime length check:** `Object.values(locations.landmarks).every(arr => arr.length === 20)` → true.
- **Runtime length check:** `locations.details.length === 20`.
- **Sanity:** `locations.biomes` содержит ровно 4 уникальных значения, все они есть как ключи в `landmarks` и `biomeLabels`.

**Verification:**
- `bun test src/data/mausritter/locations.test.ts` — runtime-проверки green.
- `bun run build` — TypeScript strict не ругается.
- Ручная проверка перевода — пробежать глазами по таблицам, сверить с источником.

---

### U6. `LocationGenerator` React island

**Goal:** Интерактивный компонент: селектор биома + кнопка броска + результат + кнопки переброса частей + справочные таблицы.

**Requirements:** R4, R5, R6, R7

**Dependencies:** U2, U3, U4, U5

**Files:**
- `src/components/LocationGenerator.tsx`
- `src/components/LocationGenerator.test.tsx`

**Approach:**
1. Props: `table: LocationTable<Biome>` (пока конкретный `MausritterBiome`, generic-параметризация — позже).
2. Локальное состояние:
   ```text
   type Roll = { biome: Biome; landmarkIndex: number; detailIndex: number } | null
   const [roll, setRoll] = useState<Roll>(null)
   const [biome, setBiome] = useState<Biome>('countryside')
   ```
3. `rollAll()`: `setRoll({ biome, landmarkIndex: pick(table.landmarks[biome]).index, detailIndex: pick(table.details).index })`.
4. `rerollLandmark()` / `rerollDetail()`: переобновляют один индекс в roll, оставляя другой.
5. Селектор биома — `shadcn/ui Tabs` в варианте 4 сегмента; смена биома **не** пересоздаёт результат автоматически (broken по дизайну — иначе ломается воркфлоу «бросаю → меняю биом → перебрасываю только landmark»). Чтобы избежать стейл-результата (landmark из биома X, но выбран биом Y), при смене биома без переброса показываем ненавязчивую подсказку «landmark из биома X». В первой итерации — упрощённо: при смене биома сбрасываем `roll` в `null`. Это менее идеально, но избегает класса багов и соответствует первой итерации.
6. `Card` (shadcn) для блока результата. `Button` (primary) для «Бросить локацию» и (outline, иконка) для «перебросить часть».
7. Под результатом — компонент `ReferenceTables`, рендерит landmark-таблицу для текущего биома (с подсвеченной выпавшей строкой) + details-таблицу (с подсвеченной выпавшей строкой). Подсветка: класс `bg-primary/10 border-l-2 border-primary`.

**Patterns to follow:** свежие compound-style shadcn-компоненты для Tabs/Card; React-19 idioms (no `forwardRef` если не нужен).

**Execution note:** test-first для логики state-машины (`rollAll` / `rerollLandmark` / `rerollDetail` / смена биома) — поведение явное и легко покрывается. UI-стили валидируются глазами в браузере, не в snapshot.

**Test scenarios:**
- **Initial state:** компонент монтируется без бросков → нет блока результата, видна только кнопка «Бросить локацию» и селектор биома.
- **Roll all:** клик «Бросить локацию» → блок результата появляется, оба индекса в диапазоне `[0, 19]`, текст landmark и detail соответствует `table.landmarks[biome][landmarkIndex].ru` и `table.details[detailIndex].ru`.
- **Reroll landmark не трогает detail:** делаем `rollAll`, запоминаем `detailIndex`, кликаем «Перебросить ориентир» 20 раз — `detailIndex` остаётся прежним каждый раз. (`rollAll` детерминистично менять indexы нельзя, но равенство = постоянство — проверяется через мок `crypto.getRandomValues`.)
- **Reroll detail не трогает landmark:** симметрично.
- **Смена биома сбрасывает roll:** делаем `rollAll`, переключаем `Tabs` на другой биом → блок результата исчезает, повторный клик «Бросить» использует новый биом.
- **Подсветка справочной таблицы:** после `rollAll(biome=forest)` с моком `crypto.getRandomValues` возвращающим landmarkIndex=5, проверяем что 6-я строка `forest`-таблицы имеет класс `bg-primary/10` (или эквивалентный data-attr — проверяется через `screen.getByTestId` или `getByText` + `closest('tr').className`).
- **Question под результатом:** если выпавшая строка имеет `question`, она рендерится italic под основным значением (проверяется через `getByText(question, { selector: 'em' })`).
- **Accessibility:** focus-visible работает на «Бросить локацию» — `tab` ставит фокус на кнопку, видимый outline.

**Verification:**
- `bun test src/components/LocationGenerator.test.tsx` все сценарии green.
- Ручная проверка в браузере: ритм взаимодействия не сбоит (кнопка не "залипает", переброс одной части ощущается мгновенным).

---

### U7. Страница `/mausritter/locations` + атрибуция + лендинг

**Goal:** Целевая страница, на которой работает генератор, со вступительным текстом и футером атрибуции. Главная страница `/` с навигацией к доступным инструментам.

**Requirements:** R2, R3, R8

**Dependencies:** U6

**Files:**
- `src/layouts/ToolLayout.astro`
- `src/pages/index.astro` (обновление: список из одного пункта)
- `src/pages/mausritter/locations.astro`
- `src/content/mausritter/locations.intro.mdx` (или инлайн в `.astro` — решаем при реализации; MDX выигрывает если вступление длиннее 5-6 параграфов)
- `src/components/AttributionFooter.astro`

**Approach:**
1. `ToolLayout.astro` — общий шелл инструмента: html-каркас, подключение `global.css`, header с возвратом на главную, slot для контента, `<AttributionFooter />`.
2. `locations.astro` — `<ToolLayout title="Локации Mausritter">`, вступительный MDX-импорт, `<LocationGenerator client:load table={mausritterLocations} />`. `client:load` — потому что это основной интерактив страницы, lazy-hydration не нужен.
3. Перевод вступления: «Это вторая часть серии Mausritter — генератор деталей локаций гекса для быстрого заполнения карты интересными местами. В Mausritter гекскраулы идут в масштабе 1 миля на гекс. В каждом гексе должен быть один заметный ориентир с интересной деталью». (Финальная редактура — на этапе реализации.)
4. `AttributionFooter.astro`: «Основано на Mausritter Isaac Williams. Распространяется по [Mausritter Third Party License](https://losing.games/mausritter/) (см. оригинал условий). Перевод и платформа — авторские.» **Перед публикацией:** проверить точный текст лицензии Mausritter Third Party License, скорректировать формулировку футера. Это R-уровневое обязательство (см. Risks).
5. `index.astro` — список инструментов с одним пунктом «Mausritter — Локации» → `/mausritter/locations`. Минимальная типографика, тот же `ToolLayout`-аналог или упрощённый layout.

**Test scenarios:**
- **Smoke:** `bun run build`, `dist/mausritter/locations/index.html` существует, содержит «Локации Mausritter» в `<title>`, содержит fallback-разметку компонента (Astro рендерит SSR-снапшот islands).
- **Smoke:** `dist/index.html` содержит ссылку на `/mausritter/locations`.
- **Атрибуция:** в `dist/mausritter/locations/index.html` присутствует слово «Mausritter» и ссылка на losing.games в футере.
- **MDX-импорт:** если используем `.mdx` для вступления, он рендерится без ошибок (отлавливается на сборке).
- **No console errors:** в браузере (ручная проверка) — нет warnings/errors при загрузке страницы.

**Verification:**
- `bun run build` без ошибок, страницы существуют, ссылки работают.
- Запуск `bun run preview` → визит `/mausritter/locations` → клик «Бросить» → виден результат с подсветкой в таблице ниже. Клик «Перебросить ориентир» — меняется только верхняя часть.

---

### U8. Cloudflare Pages деплой через git-интеграцию

**Goal:** На push в `main` сайт автоматически собирается и деплоится на Cloudflare Pages.

**Requirements:** R1

**Dependencies:** U1, U7 (нужен хотя бы один работающий маршрут чтобы убедиться что деплой реально работает)

**Files:**
- `README.md` (раздел «Деплой»)
- Возможно `.github/workflows/ci.yml` — только если хотим запускать тесты/линт на PR (Cloudflare Pages сам не блокирует merge на провалившемся билде, поэтому это полезно)

**Approach:**
1. Создать GitHub-репо `ttrpg-tools` (пользователь делает руками — это происходит вне репозитория).
2. В Cloudflare dashboard: Pages → Connect to Git → выбрать репо → конфиг билда:
   - Framework preset: Astro
   - Build command: `bun run build`
   - Output directory: `dist`
   - Node version: latest LTS, Bun: latest (Cloudflare Pages поддерживает bun через env var `BUN_VERSION`)
3. Preview-деплои для PR — включить в настройках проекта (включены по умолчанию).
4. `.github/workflows/ci.yml` (опционально, но полезно): на PR — `bun install`, `bun test`, `bun run build`. Без деплоя — деплоит Cloudflare.
5. В `README.md` — раздел «Деплой» с инструкцией как переподключить если что-то отвалится.

**Test scenarios:**
- Test expectation: ручная верификация. Автотестов на CI-конфиг не делаем.

**Verification:**
- Push в `main` → в Cloudflare Pages появляется новый билд → доступен по поддомену вида `ttrpg-tools.pages.dev` (или другому, выданному при создании проекта).
- Открытие URL в браузере: `/` показывает лендинг, `/mausritter/locations` — рабочий генератор.
- PR (любой пустой коммит) → preview-деплой создаётся и доступен по preview-URL.

---

## Risks & Dependencies

- **Лицензия Mausritter (R8, U7).** Origin-документ помечает её как unverified. Перед публикацией перевода таблиц (U5+U7) — открыть [losing.games/mausritter](https://losing.games/mausritter/) и официальный SRD, выписать точный текст Mausritter Third Party License и требования к атрибуции. Если ограничения окажутся жёстче ожидаемого (например, запрет переводов или требование коммерческой лицензии) — пересмотреть формулировку футера, способ публикации, или ограничиться личным non-public хостингом. Это **блокирующая проверка перед мержем U7 в main**, не до начала разработки.
- **shadcn + Base UI CLI ergonomics.** Поддержка с декабря 2025; CLI достаточно стабилен ([changelog 2026-01](https://ui.shadcn.com/docs/changelog/2026-01-base-ui)). Если на этапе U3 окажется что конкретные компоненты ещё не доку­мен­ти­ро­ваны для Base UI — fallback: брать Base UI primitives напрямую (`@base-ui-components/react`) и стилить вручную в `src/components/ui/`. План остаётся прежним, меняется только U3.
- **`crypto.getRandomValues` в bun-test.** В `bun test` под happy-dom `crypto.getRandomValues` доступен (Web Crypto API часть стандартного DOM-окружения). Если что-то не так — polyfill через `node:crypto.webcrypto.getRandomValues`. Не блокер.
- **Bun + Astro stability.** Astro официально поддерживает bun ([astro docs/install bun](https://docs.astro.build/en/recipes/bun/)). Если возникнут странности при сборке — fallback на pnpm в качестве PM, оставив bun как test runner.
- **Cloudflare Pages bun support.** Cloudflare Pages поддерживает bun через env var `BUN_VERSION`. Если что-то не подхватится — fallback `npm install && npm run build` через `package.json` scripts.

---

## Open Questions

- **Точный текст Mausritter Third Party License.** Резолюция — внутри U7 при работе над `AttributionFooter`. Не блокирует начало разработки.
- **Тёмная тема — будет ли она когда-нибудь.** Origin говорит «не в первой итерации». Если в обозримом будущем — да, токены в U2 стоит закладывать с расчётом на инверсию (HSL вместо HEX, готовый dark-вариант для каждого). Решаем в U2 при написании DESIGN.md.
- **Sticky result card на скролле.** Origin предлагает «sticky или фиксированный отступ, чтобы оставаться видимой при скролле к справочным таблицам». В первой итерации — обычная карточка наверху, без sticky. Если по факту неудобно — добавляем sticky в follow-up.

---

## Sources & Research

- Origin: `docs/brainstorms/2026-06-17-ttrpg-tools-platform-requirements.md`
- Источник перевода: [Mausritter: Locations — losing.games](https://losing.games/2019-07-24-mausritter-locations/)
- shadcn + Base UI: [официальный changelog 2026-01](https://ui.shadcn.com/docs/changelog/2026-01-base-ui) (подтверждает что Base UI как primitive layer официально поддерживается с `npx shadcn create` с декабря 2025)
- Дизайн-токены: [bergside/awesome-design-skills — ant skill (DESIGN.md + SKILL.md)](https://github.com/bergside/awesome-design-skills/tree/main/skills/ant)
- RNG: внутреннее решение, обоснование в KTD1 (rejection sampling — стандартный приём для устранения modulo-bias)
- Dice notation parser (в перспективе): [dice-roller/rpg-dice-roller](https://github.com/dice-roller/rpg-dice-roller)
