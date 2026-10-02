import { brotliCompressSync, gzipSync } from 'node:zlib';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { readdir, readFile, writeFile } from 'node:fs/promises';

export interface SizeSet {
  raw: number;
  gzip: number;
  brotli: number;
}

export interface ResourceReport {
  path: string;
  kind: 'html' | 'css' | 'external-js' | 'inline-js' | 'lazy-js';
  sizes: SizeSet;
  libraries: string[];
}

export interface RoutePayload {
  route: string;
  html: SizeSet;
  css: SizeSet;
  externalJs: SizeSet;
  inlineJs: SizeSet;
  initialJs: SizeSet;
  lazyJs: SizeSet;
  requestCount: number;
  resources: ResourceReport[];
  topChunks: ResourceReport[];
}

export interface PayloadReport {
  generatedAt: string;
  method: string;
  routes: RoutePayload[];
}

const method =
  'HTML is read from dist. Linked scripts, modulepreload links, stylesheets, Astro island component-url and renderer-url attributes are resolved. Static JS imports are counted as initial-load JS. Dynamic imports and their transitive JS dependencies are counted as lazy JS. Library labels come from chunk filenames and content heuristics for Preact, React, Astro, Base UI, Nanostores, Lucide and pdf-lib.';

function sizes(bytes: Uint8Array | string): SizeSet {
  const data = typeof bytes === 'string' ? Buffer.from(bytes) : Buffer.from(bytes);
  return {
    raw: data.length,
    gzip: gzipSync(data).length,
    brotli: brotliCompressSync(data).length,
  };
}

function add(a: SizeSet, b: SizeSet): SizeSet {
  return { raw: a.raw + b.raw, gzip: a.gzip + b.gzip, brotli: a.brotli + b.brotli };
}

function empty(): SizeSet {
  return { raw: 0, gzip: 0, brotli: 0 };
}

async function listFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((entry) => {
      const path = join(root, entry.name);
      return entry.isDirectory() ? listFiles(path) : Promise.resolve([path]);
    }),
  );
  return files.flat();
}

function routeFromHtml(dist: string, file: string) {
  const rel = relative(dist, file);
  if (rel === 'index.html') return '/';
  return `/${dirname(rel)}`.replace(/\\/g, '/');
}

function localAsset(dist: string, htmlFile: string, url: string) {
  const clean =
    url
      .replace(/^['"]|['"]$/g, '')
      .split('#')[0]
      ?.split('?')[0] ?? '';
  if (
    !clean ||
    clean.startsWith('http:') ||
    clean.startsWith('https:') ||
    clean.startsWith('data:')
  ) {
    return null;
  }
  const path = clean.startsWith('/') ? join(dist, clean) : resolve(dirname(htmlFile), clean);
  return existsSync(path) ? path : null;
}

function extractAssets(html: string) {
  const urls = new Set<string>();
  const inlineScripts: string[] = [];
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const src = match[1]?.match(/\bsrc=("[^"]+"|'[^']+')/i)?.[1];
    if (src) urls.add(src);
    else inlineScripts.push(match[2] ?? '');
  }
  for (const match of html.matchAll(/<link\b([^>]+)>/gi)) {
    const attrs = match[1] ?? '';
    if (!/rel=("(?:modulepreload|stylesheet)"|'(?:modulepreload|stylesheet)')/i.test(attrs))
      continue;
    const href = attrs.match(/\bhref=("[^"]+"|'[^']+')/i)?.[1];
    if (href) urls.add(href);
  }
  for (const match of html.matchAll(/\b(?:component-url|renderer-url)=("[^"]+"|'[^']+')/gi)) {
    urls.add(match[1] ?? '');
  }
  return { urls, inlineScripts };
}

function importsFromJs(code: string) {
  const staticImports = [
    ...code.matchAll(
      // Minified chunks drop the whitespace: `import{a as b}from"./x.js"` and `import"./y.js"`.
      /(?:\bimport\s*(?:[^'"()=;]+?\s*from\s*)?|\bexport\s*[^'"()=;]+?\s*from\s*)(['"])(.*?)\1/g,
    ),
  ].map((match) => match[2] ?? '');
  const dynamicImports = [...code.matchAll(/import\(\s*((['"])(.*?)\2|`([^${}`]*)`)\s*\)/g)].map(
    (match) => match[3] ?? match[4] ?? '',
  );
  return { staticImports, dynamicImports };
}

function libraries(path: string, code: string) {
  const name = basename(path).toLowerCase();
  const libs = new Set<string>();
  if (/preact/.test(name) || /from\s*['"]preact|preact\/compat|__PREACT/.test(code))
    libs.add('preact');
  if (
    /(^|[._-])(?:react|jsx|scheduler)(?:[._-]|$)/.test(name) ||
    /react-dom|__REACT_DEVTOOLS_GLOBAL_HOOK__/.test(code)
  )
    libs.add('react');
  if (/astro/.test(name) || /astro-island|astro:scripts/.test(code)) libs.add('astro');
  if (/base-ui|floating-ui/.test(name) || /Base UI|useRender/.test(code)) libs.add('base-ui');
  if (/nanostores/.test(name) || /atom\(|listenKeys|STORE_UNMOUNT_DELAY/.test(code))
    libs.add('nanostores');
  if (/lucide/.test(name) || /RefreshCw/.test(code)) libs.add('lucide-svelte');
  if (/pdf|fontkit/.test(name) || /PDFDocument|%PDF-/.test(code)) libs.add('pdf-lib');
  return [...libs];
}

async function collectJs(
  dist: string,
  entry: string,
  initial: Set<string>,
  lazy: Set<string>,
  seenInitial = new Set<string>(),
  seenLazy = new Set<string>(),
) {
  if (seenInitial.has(entry)) return;
  seenInitial.add(entry);
  initial.add(entry);
  const code = await readFile(entry, 'utf8');
  const { staticImports, dynamicImports } = importsFromJs(code);
  for (const url of staticImports) {
    const next = localAsset(dist, entry, url);
    if (next && extname(next) === '.js')
      await collectJs(dist, next, initial, lazy, seenInitial, seenLazy);
  }
  for (const url of dynamicImports) {
    const next = localAsset(dist, entry, url);
    if (next && extname(next) === '.js') await collectLazyJs(dist, next, initial, lazy, seenLazy);
  }
}

async function collectLazyJs(
  dist: string,
  entry: string,
  initial: Set<string>,
  lazy: Set<string>,
  seen: Set<string>,
) {
  if (initial.has(entry) || seen.has(entry)) return;
  seen.add(entry);
  lazy.add(entry);
  const code = await readFile(entry, 'utf8');
  const { staticImports, dynamicImports } = importsFromJs(code);
  for (const url of [...staticImports, ...dynamicImports]) {
    const next = localAsset(dist, entry, url);
    if (next && extname(next) === '.js') await collectLazyJs(dist, next, initial, lazy, seen);
  }
}

export async function buildPayloadReport(dist = 'dist'): Promise<PayloadReport> {
  const root = resolve(dist);
  const htmlFiles = (await listFiles(root)).filter((file) => basename(file) === 'index.html');
  const routes: RoutePayload[] = [];
  for (const htmlFile of htmlFiles) {
    const html = await readFile(htmlFile, 'utf8');
    const { urls, inlineScripts } = extractAssets(html);
    const assets = [...urls]
      .map((url) => localAsset(root, htmlFile, url))
      .filter((file): file is string => !!file);
    const cssFiles = new Set(assets.filter((file) => extname(file) === '.css'));
    const jsEntries = assets.filter((file) => extname(file) === '.js');
    const initialJs = new Set<string>();
    const lazyJs = new Set<string>();
    for (const js of jsEntries) await collectJs(root, js, initialJs, lazyJs);

    const resources: ResourceReport[] = [
      { path: relative(root, htmlFile), kind: 'html', sizes: sizes(html), libraries: [] },
      ...inlineScripts.map((script, index) => ({
        path: `${relative(root, htmlFile)}#inline-${index + 1}`,
        kind: 'inline-js' as const,
        sizes: sizes(script),
        libraries: libraries('inline.js', script),
      })),
    ];

    for (const file of cssFiles) {
      resources.push({
        path: relative(root, file),
        kind: 'css',
        sizes: sizes(await readFile(file)),
        libraries: [],
      });
    }
    for (const file of initialJs) {
      const code = await readFile(file, 'utf8');
      resources.push({
        path: relative(root, file),
        kind: 'external-js',
        sizes: sizes(code),
        libraries: libraries(file, code),
      });
    }
    for (const file of lazyJs) {
      const code = await readFile(file, 'utf8');
      resources.push({
        path: relative(root, file),
        kind: 'lazy-js',
        sizes: sizes(code),
        libraries: libraries(file, code),
      });
    }

    const byKind = (kind: ResourceReport['kind']) =>
      resources
        .filter((resource) => resource.kind === kind)
        .reduce((total, resource) => add(total, resource.sizes), empty());
    routes.push({
      route: routeFromHtml(root, htmlFile),
      html: byKind('html'),
      css: byKind('css'),
      externalJs: byKind('external-js'),
      inlineJs: byKind('inline-js'),
      initialJs: byKind('external-js'),
      lazyJs: byKind('lazy-js'),
      requestCount: 1 + cssFiles.size + initialJs.size,
      resources,
      topChunks: resources
        .filter((resource) => resource.kind === 'external-js' || resource.kind === 'lazy-js')
        .sort((a, b) => b.sizes.gzip - a.sizes.gzip)
        .slice(0, 5),
    });
  }
  routes.sort((a, b) => a.route.localeCompare(b.route));
  return { generatedAt: new Date().toISOString(), method, routes };
}

export function payloadMarkdown(report: PayloadReport) {
  const rows = report.routes.map(
    (route) =>
      `| ${route.route} | ${route.externalJs.gzip} | ${route.lazyJs.gzip} | ${route.inlineJs.gzip} | ${route.css.gzip} | ${route.html.gzip} | ${route.requestCount} |`,
  );
  return `# Payload\n\n${report.method}\n\n| Route | External JS gzip | Lazy JS gzip | Inline JS gzip | CSS gzip | HTML gzip | Requests |\n| --- | ---: | ---: | ---: | ---: | ---: | ---: |\n${rows.join('\n')}\n`;
}

if (import.meta.main) {
  const outIndex = Bun.argv.indexOf('--out');
  const out = outIndex === -1 ? undefined : Bun.argv[outIndex + 1];
  const report = await buildPayloadReport();
  if (out) {
    await writeFile(join(out, 'payload.json'), `${JSON.stringify(report, null, 2)}\n`);
    await writeFile(join(out, 'payload.md'), payloadMarkdown(report));
  } else {
    console.log(JSON.stringify(report, null, 2));
  }
}
