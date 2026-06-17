# TTRPG Tools

Платформа личных инструментов мастера для настольных ролёвок (Mausritter, далее — другие OSR-системы).

Первый инструмент: **Локации Mausritter** (`/mausritter/locations`) — интерактивный генератор по таблицам из [losing.games/2019-07-24-mausritter-locations](https://losing.games/2019-07-24-mausritter-locations/).

## Стек

- [Astro 6](https://astro.build/) — статика по умолчанию, React islands там где нужен интерактив.
- React 19 + TypeScript (strict).
- [Tailwind CSS v4](https://tailwindcss.com/) — токены через `@theme` в `src/styles/global.css`.
- [shadcn/ui](https://ui.shadcn.com/) с Base UI как primitive layer.
- [oxlint](https://oxc.rs/docs/guide/usage/linter.html) — линт TS/TSX (Rust, быстро).
- [oxfmt](https://oxc.rs/docs/guide/usage/formatter.html) — форматтер TS/TSX/CSS (Prettier-совместимый).
- [Prettier + prettier-plugin-astro](https://github.com/withastro/prettier-plugin-astro) — форматирование `.astro` файлов.
- `bun` — менеджер пакетов и test runner.
- [happy-dom](https://github.com/capricorn86/happy-dom) для DOM в тестах.

## Разработка

```sh
bun install
bun run dev        # http://localhost:4321
bun run build      # сборка в dist/
bun run preview    # просмотр сборки
bun test           # тесты
bun run lint       # oxlint
bun run lint:fix   # oxlint --fix
bun run format     # oxfmt
bun run format:check
bun run format:astro
bun run typecheck  # astro check
```

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

CI на GitHub Actions проверяет lint + format + test + typecheck + build на PR (`.github/workflows/ci.yml`) — Cloudflare сам деплоит, GA только страхует от слома `main`.

## Документация

- `docs/DESIGN.md` — дизайн-токены и правила.
- `docs/brainstorms/` — исходные брифы.
- `docs/plans/` — планы реализации.
