import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { plugin } from 'bun';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { compile, compileModule } from 'svelte/compiler';

const svelteClientEntry = fileURLToPath(
  new URL('./node_modules/svelte/src/index-client.js', import.meta.url),
);
const svelteClientSpecifier = pathToFileURL(svelteClientEntry).href;

function useSvelteClientEntry(source: string) {
  return source.replaceAll("from 'svelte'", `from '${svelteClientSpecifier}'`);
}

plugin({
  name: 'svelte-test-loader',
  setup(build) {
    build.onResolve({ filter: /^svelte$/ }, () => ({ path: svelteClientEntry }));

    build.onLoad({ filter: /\.svelte$/ }, ({ path }) => {
      const source = readFileSync(path, 'utf8');
      const compiled = compile(source, {
        filename: path,
        generate: 'client',
        dev: true,
      });

      return {
        contents: useSvelteClientEntry(compiled.js.code),
        loader: 'js',
      };
    });

    build.onLoad({ filter: /\.svelte\.[jt]s$/ }, ({ path }) => {
      const source = readFileSync(path, 'utf8');
      const compiled = compileModule(source, {
        filename: path,
        dev: true,
      });

      return {
        contents: useSvelteClientEntry(compiled.js.code),
        loader: path.endsWith('.ts') ? 'ts' : 'js',
      };
    });

    build.onLoad(
      {
        filter:
          /node_modules\/\@testing-library\/svelte(?:-core)?\/src\/(mount|pure|svelte-version)\.js$/,
      },
      ({ path }) => ({
        contents: useSvelteClientEntry(readFileSync(path, 'utf8')),
        loader: 'js',
      }),
    );

    build.onLoad({ filter: /node_modules\/\@lucide\/svelte\/dist\/.*\.js$/ }, ({ path }) => ({
      contents: useSvelteClientEntry(readFileSync(path, 'utf8')),
      loader: 'js',
    }));
  },
});

if (!GlobalRegistrator.isRegistered) {
  GlobalRegistrator.register();
}
