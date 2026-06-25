---
title: "feat: Skeleton-плейсхолдеры в result-карточках вместо layout-shift"
date: 2026-06-25
type: feat
branch: feat/skeleton-result-cards
status: ready
depth: standard
---

# feat: Skeleton-плейсхолдеры в result-карточках вместо layout-shift

## Summary

Сейчас result-карточка каждого генератора рендерится условно — `{roll ? <Card/> : null}`. Первый бросок происходит в `useEffect` на клиенте (SSR-гоча: бросок нельзя делать в store-init, иначе hydration ломается), поэтому при SSR и начальной гидрации карточки нет вовсе. Когда эффект срабатывает и заполняет `$roll`, карточка появляется и толкает таблицу-справочник вниз — это и есть layout-shift, видимый при загрузке страницы.

Делаем result-карточку постоянно присутствующей в разметке. Внутри оборачиваем текстовый контент в новый shadcn-примитив `Skeleton`: `loading=true` (бросок ещё не сделан) → текст-плейсхолдер под shimmer-маской, занимающий ту же высоту; `loading=false` → реальный результат. Высота карточки не меняется между состояниями → сдвиг исчезает.

Начинаем с `EncounterGenerator` (страница «Проверка столкновения», две карточки), оцениваем, затем тем же приёмом правим `WeatherGenerator` и `LocationGenerator`. Все три — в этом плане, но отдельными юнитами с явной точкой оценки после первого.

---

## Problem Frame

- **Что ломается:** при загрузке любой страницы-генератора result-карточка «впрыгивает» после клиентского `useEffect`, сдвигая контент ниже. Плохой CLS, дёргающийся первый экран.
- **Почему так:** бросок обязан быть в `useEffect` (см. `CLAUDE.md` → «SSR-гоча»). Значит `$roll === null` на SSR-снепшоте и в первом клиентском рендере — это неустранимо. Устранимо другое: **условный рендер** карточки по `roll`.
- **Граница:** справочные таблицы (`CheckReference`, `ReactionReference`, `ReferenceTable`, `ReferenceTables`) уже рендерятся всегда и сдвига не дают — их не трогаем. Источник сдвига ровно один: result-`Card`.

---

## Key Technical Decisions

### KTD-1. Skeleton — wrapper вокруг контента, а не отдельный блок

API по образцу запроса пользователя и shadcn (`https://ui.shadcn.com/docs/components/radix/skeleton`, доработанный):

```tsx
<p className="font-display text-3xl">
  <Skeleton loading={loading}>{loading ? 'Плейсхолдер' : row.ru}</Skeleton>
</p>
```

- `Skeleton` оборачивает **текст**, а не `<p>`. Внешний `<p>` (или ячейка) остаётся и несёт блочность + размер шрифта, поэтому плейсхолдер и реальный текст рендерятся одним и тем же кеглем/line-height → одинаковая высота строки.
- Базовый shadcn-skeleton — это просто `<div className="bg-accent animate-pulse rounded-md" />` (пустой блок фиксированного размера). Нам он не подходит: пустой блок не знает высоту будущего контента. Поэтому берём идею (`animate-pulse rounded-md` + токен фона) и меняем модель: контент всегда внутри, при загрузке он маскируется.

### KTD-2. Обёртка присутствует в обоих состояниях (нулевой сдвиг by construction)

`Skeleton` рендерит один и тот же `inline`-элемент при `loading` true и false — переключается только оформление, не само наличие/тип узла. Модель маскировки взята из park-ui (`packages/preset/src/recipes/skeleton.ts`): прячем **всех потомков**, а не только цвет текста.

```tsx
function Skeleton({ loading = false, className, children, ...props }: SkeletonProps) {
  return (
    <span
      data-slot="skeleton"
      data-loading={loading || undefined}
      aria-hidden={loading || undefined}
      className={cn(
        'rounded-md',
        loading &&
          'animate-pulse shrink-0 bg-text-muted/20 text-transparent select-none ' +
            'pointer-events-none cursor-default [&_*]:invisible',
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}
```

*(directional — финальные классы/токен фона уточняются при реализации против `docs/DESIGN.md`)*

- При `loading`: `text-transparent` гасит текст, `[&_*]:invisible` прячет любые дочерние элементы (иконки и т.п.) — по образцу park-ui (`color: transparent` + `* { visibility: hidden }`); `bg-…` рисует shimmer-бар ровно по боксу, `animate-pulse` — пульсация. `pointer-events-none`/`select-none`/`cursor-default`/`shrink-0` — заглушку нельзя выделить/кликнуть, и она не схлопывается во flex-контексте.
- Узел `<span>` одинаков в обоих состояниях ⇒ box-model не меняется ⇒ сдвиг невозможен в принципе, а не «подогнан по высоте». (park-ui делает так же — `loading` это вариант на том же узле.)
- `aria-hidden` при загрузке — скринридер не читает текст-заглушку.
- *Опционально (polish):* на `loading=false` короткий `fade-in` реального контента (~0.1s), как `animation: fade-in` в park-ui. Не обязательно для устранения сдвига.

### KTD-3. Плейсхолдер по числу строк, не по содержанию

Высоту определяет число строк × line-height. Для каждого места плейсхолдер подбираем так, чтобы его рендер занимал столько же строк, сколько типичный реальный контент (обычно 1 строка для заголовка-исхода, 1 строка для подсказки/вопроса). Ширина плейсхолдера на вертикальный сдвиг не влияет — не выверяем её попиксельно.

### KTD-4. Токен фона — семантический, не сырой hex

Per `CLAUDE.md`/`docs/DESIGN.md`: shimmer использует семантический токен (кандидат — `bg-text-muted/20`). Точный токен подбирается при реализации в `EncounterGenerator` и переиспользуется без изменений в остальных.

---

## Implementation Units

### U1. Примитив `Skeleton`

**Goal:** добавить переиспользуемый wrapper-примитив `Skeleton` в общую ui-папку.

**Requirements:** фундамент для U2–U4 (KTD-1, KTD-2).

**Dependencies:** нет.

**Files:**
- `src/components/ui/skeleton.tsx` (создать)
- `src/components/ui/skeleton.test.tsx` (создать)

**Approach:**
- Реализовать по KTD-2: `SkeletonProps = React.ComponentProps<'span'> & { loading?: boolean }`, named export `Skeleton`, `cn` из `@/lib/utils`.
- Стиль и data-атрибуты как в card.tsx/tabs.tsx (`data-slot`, `cn(...)`). Следовать раскладке файла из `rules/typescript.md` (импорты → тип → главный экспорт).

**Patterns to follow:** `src/components/ui/card.tsx`, `src/components/ui/tabs.tsx` — оформление, `data-slot`, использование `cn`.

**Test scenarios:**
- `loading=false`: children отрендерены, обёртка БЕЗ pulse/маскирующих классов (`data-loading` отсутствует), текст читаем.
- `loading=true`: children присутствуют в DOM (важно — высота из них), у узла есть `data-loading` и `aria-hidden`, применены `animate-pulse` и `text-transparent`; интерактивность погашена (`pointer-events-none`/`select-none`).
- Один и тот же тип узла (`data-slot="skeleton"`) присутствует в обоих состояниях — переключение `loading` не добавляет/убирает уровень вложенности (защита инварианта «нулевой сдвиг»).
- `className` от вызывающего домешивается, не затирая базовые классы.

**Verification:** `bun test src/components/ui/skeleton.test.tsx` зелёный; `bun run typecheck` чист.

---

### U2. `EncounterGenerator` — постоянные карточки со skeleton (пилот)

**Goal:** обе result-карточки (проверка d6, реакция 2d6) рендерятся всегда; до первого броска — skeleton. **Это страница для оценки подхода.**

**Requirements:** устранить layout-shift на `/mausritter/encounters` (Problem Frame).

**Dependencies:** U1.

**Files:**
- `src/components/EncounterGenerator.tsx` (изменить)
- `src/components/EncounterGenerator.test.tsx` (изменить)

**Approach:**
- В `CheckSection`/`ReactionSection` убрать `{roll && row ? <Card/> : null}` — `Card` рендерить безусловно. Завести `const loading = !roll` (или `!row`).
- Обернуть в `Skeleton loading={loading}`: значение броска в шапке (`d6 = …` / `2d6 = …`), заголовок-исход (`text-3xl`), подсказку/вопрос. Плейсхолдеры — по KTD-3.
- При `loading` сохранить нейтральный тон заголовка (`outcomeTone` зависит от `row` — на заглушке использовать дефолтный muted, не угадывать исход).
- `data-testid="check-result-card"` / `"reaction-result-card"` остаются на `Card` (теперь присутствуют всегда).

**Patterns to follow:** структура `Card`/`CardHeader`/`CardContent` уже в файле; менять только условие рендера и оборачивание текста.

**Test scenarios:**
- До броска (рендер без срабатывания `useEffect`): обе карточки `check-result-card` и `reaction-result-card` присутствуют в DOM; внутри — узлы `data-slot="skeleton"` с `data-loading`.
- После броска (эффект отработал / явный клик по `check-roll-button`): в той же карточке skeleton снят (`data-loading` отсутствует), показан реальный `data-outcome` и текст исхода.
- Клик по `reaction-roll-button` обновляет только карточку реакции — карточка проверки не трогается (независимость state-машин сохранена).
- Highlight в `CheckReference`/`ReactionReference` по-прежнему появляется после броска (регрессия не затронула справочник).

**Verification:** `bun test src/components/EncounterGenerator.test.tsx` зелёный. Ручная проверка в `bun run dev` на `/mausritter/encounters`: при перезагрузке справочная таблица не «прыгает».

---

### U3. Оценка пилота (gate)

**Goal:** подтвердить, что подход на U2 решает задачу, прежде чем тиражировать.

**Dependencies:** U2.

**Files:** нет (ручная оценка).

**Approach / критерии готовности:**
- Визуально: на медленной загрузке (DevTools → Network throttling) справочная таблица под карточкой не сдвигается; skeleton виден и сменяется результатом без скачка высоты.
- API `Skeleton` удобен в реальном использовании; не потребовалось хаков вроде ручного `min-height`.
- Если что-то из этого не так — скорректировать U1/U2 до перехода к U4 (например, добавить вариант плейсхолдера на N строк).

**Test expectation:** none — gate-юнит, оценка глазами + результаты тестов U1/U2.

---

### U4. `WeatherGenerator` и `LocationGenerator` — тиражирование

**Goal:** применить тот же приём к оставшимся двум генераторам.

**Requirements:** устранить layout-shift на `/mausritter/weather` и `/mausritter/locations`.

**Dependencies:** U3 (подход подтверждён).

**Files:**
- `src/components/WeatherGenerator.tsx` (изменить)
- `src/components/WeatherGenerator.test.tsx` (изменить)
- `src/components/LocationGenerator.tsx` (изменить)
- `src/components/LocationGenerator.test.tsx` (изменить)

**Approach:**
- Weather: `ResultCard` рендерить безусловно (убрать `{roll ? … : null}`); skeleton на `2d6 = …`, заголовок погоды (`text-3xl`), блок harsh-предупреждения. Нюанс: `harsh`-текст показывается только для непогоды — на заглушке держать нейтральный плейсхолдер фиксированной высоты, не мигать предупреждением.
- Location: `ResultCard` рендерить безусловно; внутри две `ResultRow` (Ориентир, Деталь) — skeleton на `d20 = …`, `ru` (`text-2xl`), `question`. Кнопки reroll при загрузке `disabled` (бросать нечего).
- `data-testid="result-card"` остаётся на карточке (теперь всегда в DOM).

**Patterns to follow:** ровно решение из U2; `Skeleton`-токен и плейсхолдеры переиспользуются без изменений (KTD-4).

**Test scenarios:**
- Weather до броска: `result-card` присутствует, внутри skeleton; после броска — реальный `data-testid="result-weather"` с корректным `data-harsh`.
- Weather: смена сезона табами до/после броска не ломает карточку; highlight в `reference-weather` появляется после броска.
- Location до броска: `result-card` присутствует со skeleton; reroll-кнопки `disabled`. После броска — `result-landmark`/`result-detail` с реальным текстом, reroll активны.
- Location: точечный reroll (`onRerollLandmark`) меняет только ориентир, деталь не трогается.

**Verification:** `bun test src/components/WeatherGenerator.test.tsx src/components/LocationGenerator.test.tsx` зелёные. Ручная проверка обеих страниц на throttling — без сдвига.

---

## System-Wide Impact

- **Новый shared-примитив** `src/components/ui/skeleton.tsx` — после U1 доступен всем будущим генераторам; добавление новой карточки сразу идёт со skeleton (стоит отразить в `CLAUDE.md` после слияния, если приём приживётся — *deferred*).
- **SSR-инвариант не меняется:** бросок остаётся в `useEffect`. Меняется только то, что карточка теперь рендерится и на SSR (со skeleton) — снепшот SSR и первый клиентский рендер совпадают (оба `loading`), hydration-mismatch не возникает.
- **Тесты:** существующие компонент-тесты, проверявшие отсутствие карточки до броска (если такие есть), нужно обновить на «карточка есть, внутри skeleton» — учтено в файлах U2/U4.

---

## Scope Boundaries

**В работе:**
- `Skeleton`-примитив + три генератора (Encounter → оценка → Weather/Location).

### Deferred to Follow-Up Work
- Обновление `CLAUDE.md` (шаг 4 архитектурной цепочки) — упомянуть skeleton как стандарт для result-карточек, если приём приживётся после слияния.
- Любые анимационные изыски сверх `animate-pulse` (shimmer-градиент и т.п.).
- Skeleton для справочных таблиц — они не дают сдвига, не трогаем.

**Вне scope:**
- Изменение механики броска, RNG, store-API.
- Редизайн карточек/типографики.

---

## Open Questions (defer to implementation)

- Точный семантический токен фона shimmer (`bg-text-muted/20` — кандидат) — решается в U2 против `docs/DESIGN.md` и фиксируется для U4.
- Нужен ли плейсхолдер на 2 строки для длинных `question` в реакции/локации — выяснится на оценке U3; при необходимости добавить проп/вариант в `Skeleton`.

---

## Verification (overall)

Перед завершением — полный CI-набор из `CLAUDE.md`:

```sh
bun run lint && bun run format:check && bun run typecheck && bun test && bun run build
```

Плюс ручная проверка трёх страниц на Network throttling: при загрузке справочная таблица под карточкой не сдвигается.

---

## Sources & Research

- shadcn Skeleton (база, доработана под wrapper-API): `https://ui.shadcn.com/docs/components/radix/skeleton`
- park-ui Skeleton recipe (модель маскировки `loading`: тот же узел, скрытие потомков, fade-in): `https://github.com/chakra-ui/park-ui/blob/main/packages/preset/src/recipes/skeleton.ts`
- Существующие ui-примитивы как образец оформления: `src/components/ui/card.tsx`, `src/components/ui/tabs.tsx`, `src/components/ui/button.tsx`
- SSR-гоча и слой-архитектура: `CLAUDE.md`
