# TTRPG Tools

Платформа личных инструментов мастера для настольных ролёвок (Mausritter, далее — другие OSR-системы).

Первый инструмент: **Локации Mausritter** (`/mausritter/locations`) — интерактивный генератор по таблицам из [losing.games/2019-07-24-mausritter-locations](https://losing.games/2019-07-24-mausritter-locations/).

## Стек

- [Astro 7](https://astro.build/) — статика по умолчанию, Preact islands там где нужен интерактив.
- Preact + TypeScript (strict).
- [Tailwind CSS v4](https://tailwindcss.com/) — токены через `@theme` в `src/styles/global.css`.
- Локальные UI-примитивы в `src/components/ui/`.
- [oxlint](https://oxc.rs/docs/guide/usage/linter.html) — линт TS/TSX (Rust, быстро).
- [oxfmt](https://oxc.rs/docs/guide/usage/formatter.html) — форматтер TS/TSX/CSS (Prettier-совместимый).
- [Prettier + prettier-plugin-astro](https://github.com/withastro/prettier-plugin-astro) — форматирование `.astro` файлов.
- `bun` — менеджер пакетов и test runner.
- [happy-dom](https://github.com/capricorn86/happy-dom) для DOM в тестах.
- [Playwright](https://playwright.dev/) с Chromium для browser-тестов Canvas API.

## Разработка

```sh
bun install
bun run dev        # http://localhost:4321
bun run build      # сборка в dist/
bun run size       # production build + bundle size check
bun run size:check # check an existing dist/ build
bun run preview    # просмотр сборки
bun test           # быстрые unit-тесты
bun run test:browser # browser-тесты Paper minis
bun run lint       # oxlint
bun run lint:fix   # oxlint --fix
bun run format     # oxfmt
bun run format:check
bun run format:astro
bun run typecheck  # astro check
```

Перед первым локальным запуском browser-тестов установите Chromium: `bunx playwright install chromium`.

### Lint coverage

Oxlint applies the vendored anti-slop rules to TypeScript and TSX, including
expressions and handlers in JSX. Local UI primitives are linted too. They are
owned code in this branch.

Sequential awaits are allowed in the measurement harness and parity tests:
samples must run without competing work, and browser actions depend on earlier
actions. Other Oxlint and anti-slop rules remain enabled there.

See [the experiment lint check](docs/experiments/ui-stack/lint-compatibility.md)
for coverage details and verification results for both candidates.

### Bundle size budgets

[Size Limit](https://github.com/ai/size-limit) checks production assets in
`dist/_astro/` with Brotli compression. `.size-limit.json` sets aggregate budgets
of **360 kB for JavaScript** and **10 kB for CSS**. JavaScript includes all chunks,
including lazy PDF and ZIP exports. These totals measure the whole site's assets,
not the initial download of a single page.

The initial baseline is 287.23 kB of JavaScript and 7.57 kB of CSS. Budgets leave
about 25% headroom, rounded up. CI runs `bun run size:check` after its build and
fails if a budget is exceeded or a configured asset glob has no matches. Run
`bun run size` locally for a fresh build. Investigate unexpected growth before
changing a budget; explain intentional increases in the PR.

On pull requests, a separate `size-report` job runs
[`size-limit-action`](https://github.com/andresz1/size-limit-action) and updates a
comment with each bundle's PR size and percent change against the base branch.
The action formats sizes in 1024-based KB; Size Limit's CLI uses decimal kB.
Both builds use the PR's budgets and comparison tool, so the first PR works even
before the base has Size Limit.
Fork PRs still run the checks, but GitHub's read-only token cannot post a comment.

## Деплой

Cloudflare Workers with Static Assets через git-интеграцию.

Конфиг — `wrangler.toml`. Cloudflare билдит репо и раздаёт статику из `dist/`.

**Первоначальная настройка (один раз):**

1. В Cloudflare Dashboard → **Workers & Pages** → **Create** → **Import a repository**.
2. Выбрать репозиторий `Seigiard/ttrpg-tools`, ветка `main`.
3. Параметры билда:
   - Project name: `ttrpg-tools`
   - Build command: `bun run build`
   - Deploy command: `npx wrangler deploy`
4. В **Advanced settings** → Build variables:
   - `BUN_VERSION` = `1.3.14` (или новее)
5. **Deploy**.

После сохранения первый деплой запустится автоматически (~1–2 мин). Дальше каждый push в `main` триггерит новую сборку; для PR создаются preview-деплои.

**Локальный деплой** (если нужен — нормально пушить через git):

```sh
bun run deploy   # build + wrangler deploy
```

Потребует залогиниться в Wrangler первый раз (`bunx wrangler login`).

**Если что-то отвалится:** проверь в Cloudflare → Project → Build logs. Чаще всего — несовместимость версий Node/Bun или забытый `BUN_VERSION`.

CI на GitHub Actions проверяет lint + format + unit + browser + typecheck + build + bundle size на PR (`.github/workflows/ci.yml`) — Cloudflare сам деплоит, GA только страхует от слома `main`.

## Документация

- `docs/DESIGN.md` — дизайн-токены и правила.
- `GLOSSARY.md` — глоссарий предметной области.
- `docs/brainstorms/` — исходные брифы.
- `docs/plans/` — планы реализации.
