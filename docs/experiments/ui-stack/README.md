# UI stack experiment measurements

The parity suite and measurement scripts run against a production build served by `astro preview`.

## Parity e2e

Install dependencies, then run:

```sh
bun run e2e
```

Use another port when two candidate branches run at the same time:

```sh
PORT=4401 bun run e2e
```

## Measurements

Run the full baseline command:

```sh
bun run measure -- --out docs/experiments/ui-stack/results/react
```

For a candidate branch, change the output directory:

```sh
bun run measure -- --out docs/experiments/ui-stack/results/preact
bun run measure -- --out docs/experiments/ui-stack/results/svelte
```

The command builds the app, starts `astro preview`, writes payload, network and timing JSON, writes Markdown summaries, records dependency versions, and saves screenshots for every route at 1280 px and 390 px.

Set `PORT` if another preview server already uses `4400`.
