import { createEditor } from '../../../../src/features/grimoire/adapters/editor';
import { downloadBook, loadBookFile } from '../../../../src/features/grimoire/adapters/file';
import { paginate } from '../../../../src/features/grimoire/adapters/pagination';
import { draftStorage } from '../../../../src/features/grimoire/adapters/persistence';
import { printBook } from '../../../../src/features/grimoire/adapters/printing';
import {
  startApp,
  type AppAdapters,
  type AppElements,
} from '../../../../src/features/grimoire/app/start-app';
import { disabledDraftPersistence } from '../draft.browser';
import type { AppScenarioName, AppTestSurface } from './app-session';

/**
 * What one scenario changes about the application: the seams it is about, and
 * nothing else. Everything a recipe leaves out is mounted with the production
 * adapter, so a scenario reads as the single substitution it makes.
 */
type AppScenarioRecipe = Partial<AppAdapters>;

const paginateIsolated: typeof paginate = (container, html) =>
  paginate(container, html, { mode: 'isolated' });

const APP_SCENARIOS = {
  production: {},
  'persistence-disabled': { draft: disabledDraftPersistence },
} satisfies Record<AppScenarioName, AppScenarioRecipe>;

/**
 * Mounts the application into the full-app host's static elements. The host's DOM is
 * the same for every scenario; only the adapters differ.
 */
export function mountAppHost(scenario: string | null): AppTestSurface {
  const recipe = scenarioRecipe(scenario);

  const elements: AppElements = {
    editorContainer: requireElement('editor', HTMLElement),
    previewContainer: requireElement('preview', HTMLElement),
    printControl: requireElement('print', HTMLElement),
    refreshControl: requireElement('refresh', HTMLElement),
    autoRefreshControl: requireElement('auto-refresh', HTMLInputElement),
    statusContainer: requireElement('status', HTMLElement),
    downloadControl: requireElement('download', HTMLElement),
    loadControl: requireElement('load', HTMLInputElement),
  };

  const app = startApp(elements, {
    editor: recipe.editor ?? { create: createEditor },
    preview: recipe.preview ?? { paginate: paginateIsolated },
    printing: recipe.printing ?? { printBook },
    draft: recipe.draft ?? draftStorage,
    savedFile: recipe.savedFile ?? { downloadBook, loadBookFile },
  });

  return { source: () => app.editor.getSource() };
}

function scenarioRecipe(scenario: string | null): AppScenarioRecipe {
  const known = Object.keys(APP_SCENARIOS).join(', ');
  if (scenario === null) throw new Error(`Full-app host needs a scenario, one of: ${known}`);
  if (!isScenarioName(scenario)) {
    throw new Error(`Unknown full-app scenario "${scenario}". Known scenarios: ${known}`);
  }
  return APP_SCENARIOS[scenario];
}

function isScenarioName(scenario: string): scenario is AppScenarioName {
  return Object.hasOwn(APP_SCENARIOS, scenario);
}

function requireElement<Element extends HTMLElement>(
  id: string,
  constructor: new () => Element,
): Element {
  const element = document.getElementById(id);
  if (!(element instanceof constructor)) {
    throw new Error(`Full-app host is missing #${id}`);
  }
  return element;
}
