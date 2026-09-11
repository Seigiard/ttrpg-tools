import { describe, expect, test } from 'bun:test';
import path from 'node:path';
import ts from 'typescript';

const grimoireRoot = import.meta.dir;
const srcRoot = path.resolve(grimoireRoot, '../..');
const layers = ['core', 'adapters', 'app'] as const;
type Layer = (typeof layers)[number];
const typeScriptModuleGlob = '**/*.{ts,tsx,mts,cts}';

const allowedLayers: Record<Layer, ReadonlySet<Layer>> = {
  core: new Set(['core']),
  adapters: new Set(['core', 'adapters']),
  app: new Set(['core', 'adapters', 'app']),
};

const allowedCorePackages = new Set(['marked']);

function layerFor(filePath: string): Layer | undefined {
  const relativePath = path.relative(grimoireRoot, filePath);
  return layers.find((layer) => relativePath === layer || relativePath.startsWith(`${layer}${path.sep}`));
}

function packageName(specifier: string): string {
  const [first, second] = specifier.split('/');
  return first?.startsWith('@') ? `${first}/${second}` : (first ?? specifier);
}

function importedSpecifiers(filePath: string, source: string): Array<string | undefined> {
  const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true);
  const specifiers: Array<string | undefined> = [];

  function visit(node: ts.Node): void {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      specifiers.push(node.moduleSpecifier.text);
    }

    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const argument = node.arguments[0];
      specifiers.push(argument && ts.isStringLiteralLike(argument) ? argument.text : undefined);
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return specifiers;
}

function boundaryViolations(filePath: string, source: string): string[] {
  const sourceLayer = layerFor(filePath);
  if (!sourceLayer) return [];

  return importedSpecifiers(filePath, source).flatMap((specifier) => {
    if (specifier === undefined) {
      return [
        `${path.relative(grimoireRoot, filePath)}: dynamic import specifier must be a string literal`,
      ];
    }

    const importedPath = specifier.startsWith('@/')
      ? path.resolve(srcRoot, specifier.slice(2))
      : specifier.startsWith('.')
        ? path.resolve(path.dirname(filePath), specifier)
        : undefined;

    if (importedPath !== undefined) {
      const importedLayer = layerFor(importedPath);
      if (!importedLayer || !allowedLayers[sourceLayer].has(importedLayer)) {
        return [
          `${path.relative(grimoireRoot, filePath)}: ${sourceLayer} cannot import ${specifier}`,
        ];
      }
      return [];
    }

    if (specifier.startsWith('node:')) return [];

    if (sourceLayer === 'core' && !allowedCorePackages.has(packageName(specifier))) {
      return [
        `${path.relative(grimoireRoot, filePath)}: core cannot import external package ${specifier}`,
      ];
    }
    return [];
  });
}

async function currentBoundaryCheck(): Promise<{
  filePaths: string[];
  violations: string[];
}> {
  const filesByLayer = await Promise.all(
    layers.map((layer) =>
      Array.fromAsync(new Bun.Glob(`${layer}/${typeScriptModuleGlob}`).scan({ cwd: grimoireRoot })),
    ),
  );
  const filePaths = filesByLayer
    .flat()
    .filter((relativePath) => !relativePath.match(/\.test\.[cm]?tsx?$/))
    .map((relativePath) => path.join(grimoireRoot, relativePath));

  const violations = await Promise.all(
    filePaths.map(async (filePath) =>
      boundaryViolations(filePath, await Bun.file(filePath).text()),
    ),
  );
  return { filePaths, violations: violations.flat() };
}

describe('Grimoire module boundaries', () => {
  test('keeps the current implementation inside its dependency layers', async () => {
    const { filePaths, violations } = await currentBoundaryCheck();

    for (const layer of layers) {
      expect(filePaths.some((filePath) => layerFor(filePath) === layer)).toBe(true);
    }
    expect(violations).toEqual([]);
  });

  test('rejects dependencies on higher layers', () => {
    expect(
      boundaryViolations(path.join(grimoireRoot, 'core/probe.ts'),
        'import "../adapters/pagination";'),
    ).toHaveLength(1);
    expect(
      boundaryViolations(path.join(grimoireRoot, 'adapters/probe.ts'),
        'import "../app/start-app";'),
    ).toHaveLength(1);
    expect(
      boundaryViolations(
        path.join(grimoireRoot, 'adapters/probe.tsx'),
        'import "@/features/grimoire/app/start-app";',
      ),
    ).toHaveLength(1);
    expect(
      boundaryViolations(
        path.join(grimoireRoot, 'core/probe.ts'),
        'import "@/features/grimoire/core/book";',
      ),
    ).toEqual([]);
  });

  test('checks static and rejects non-static dynamic imports', () => {
    const filePath = path.join(grimoireRoot, 'core/probe.ts');

    expect(boundaryViolations(filePath, 'import(`../adapters/pagination`);')).toEqual([
      'core/probe.ts: core cannot import ../adapters/pagination',
    ]);
    expect(boundaryViolations(filePath, 'import(`../app/${name}`);')).toEqual([
      'core/probe.ts: dynamic import specifier must be a string literal',
    ]);
  });

  test('allows only reviewed external packages in core', () => {
    const filePath = path.join(grimoireRoot, 'core/probe.ts');

    expect(boundaryViolations(filePath, 'import { marked } from "marked";')).toEqual([]);
    expect(
      boundaryViolations(filePath, 'import { CoreViewer } from "@vivliostyle/core";'),
    ).toHaveLength(1);
    expect(boundaryViolations(filePath, 'import path from "node:path";')).toEqual([]);
  });
});
