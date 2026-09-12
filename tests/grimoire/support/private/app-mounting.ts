import { CoreViewer } from '@vivliostyle/core';

import { createEditor } from '../../../../src/features/grimoire/adapters/editor';
import { downloadBook, loadBookFile } from '../../../../src/features/grimoire/adapters/file';
import { paginate } from '../../../../src/features/grimoire/adapters/pagination';
import { draftStorage, type DraftStorage } from '../../../../src/features/grimoire/adapters/persistence';
import { printBook } from '../../../../src/features/grimoire/adapters/printing';
import { createPagination } from '../../../../src/features/grimoire/adapters/private/create-pagination';
import { createPrinting } from '../../../../src/features/grimoire/adapters/private/create-printing';
import { createControlledScheduler } from '../../../../src/features/grimoire/adapters/private/scheduler';
import {
  startApp,
  type AppAdapters,
  type AppElements,
} from '../../../../src/features/grimoire/app/start-app';
import type { AppScenarioName, AppTestSurface } from './app-session';

/**
 * What one scenario changes about the application: the seams it is about, and
 * nothing else. Everything a recipe leaves out is mounted with the production
 * adapter, so a scenario reads as the single substitution it makes.
 */
type AppScenarioRecipe = Partial<AppAdapters> & {
  readonly isolatedPreview?: boolean;
  configureElements?(elements: AppElements): void;
};

interface AppHostControls {
  finishSlowPagination(): void;
  makePreviewEngineFail(): void;
  advanceEngineClock(ms: number): void;
  pendingEngineDeadlines(): number;
  stallEngine(): void;
  unstallEngine(): void;
  stalledEngineRuns(): number;
  oldestStalledEngineDocument(): Promise<string | undefined>;
  resumeOldestStalledEngineRun(): boolean;
  resumeOldestStalledEngineRunUntilLoaded(): Promise<boolean>;
  failOldestStalledEngineRun(): boolean;
  printAttemptsStarted(): number;
  printDialoguesOpened(): number;
}

const paginateIsolated: typeof paginate = (container, html) =>
  paginate(container, html, { mode: 'isolated' });

const deterministicPaginate: typeof paginate = (container, html) => {
  container.replaceChildren();
  const div = document.createElement('div');
  div.textContent = html;
  container.appendChild(div);
  return Promise.resolve({ pageCount: 1, pageSizes: [], overflowingPages: [] });
};

const failingPrint: typeof printBook = () =>
  Promise.reject(new Error('Vivliostyle failed to prepare the book for printing: boom'));

const disabledDraftPersistence: DraftStorage = {
  read: () => undefined,
  write: () => {},
};

const loadBookFileWithControlledTiming: typeof loadBookFile = (file) => {
  const delay = file.name.includes('slow') ? 300 : 0;
  return new Promise((resolve, reject) => {
    void loadBookFile(file).then(
      (source) => setTimeout(() => resolve(source), delay),
      (error: unknown) => setTimeout(() => reject(error), delay),
    );
  });
};

function installPrintObservers(controls: AppHostControls): void {
  let printDialoguesOpened = 0;
  new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (!(node instanceof HTMLIFrameElement)) continue;
        node.addEventListener('load', () => {
          if (node.contentWindow) node.contentWindow.print = () => (printDialoguesOpened += 1);
        });
      }
    }
  }).observe(document.body, { childList: true });

  controls.printAttemptsStarted = () => document.querySelectorAll('iframe').length;
  controls.printDialoguesOpened = () => printDialoguesOpened;
}

function createCoalescingPreviewRecipe(controls: AppHostControls): AppScenarioRecipe {
  controls.finishSlowPagination = () => {};

  const fakePaginate: typeof paginate = (container, html) => {
    const finish = () => {
      container.replaceChildren();
      const div = document.createElement('div');
      div.textContent = html;
      container.appendChild(div);
      return { pageCount: 1, pageSizes: [], overflowingPages: [] };
    };

    if (!html.includes('SLOW MARKER')) return Promise.resolve(finish());
    return new Promise((resolve) => {
      controls.finishSlowPagination = () => resolve(finish());
    });
  };

  return { draft: disabledDraftPersistence, isolatedPreview: false, preview: { paginate: fakePaginate } };
}

function installUnloadablePreviewDocuments(): void {
  URL.createObjectURL = () => `blob:${location.origin}/a-blob-url-that-resolves-to-nothing`;
}

function createPreviewEngineFailureRecipe(controls: AppHostControls): AppScenarioRecipe {
  controls.makePreviewEngineFail = installUnloadablePreviewDocuments;
  return { draft: disabledDraftPersistence, isolatedPreview: false };
}

function installFirstPreviewEngineFailure(): AppScenarioRecipe {
  installUnloadablePreviewDocuments();
  return { draft: disabledDraftPersistence, isolatedPreview: false };
}

function createControlledEngineRecipe(isolatedPreview: boolean) {
  return (controls: AppHostControls): AppScenarioRecipe => {
    const controlledScheduler = createControlledScheduler();
    const paginateWithControlledScheduler = createPagination(controlledScheduler.scheduler);
    const printWithControlledScheduler = createPrinting(controlledScheduler.scheduler);
    const nativeLoadDocument = CoreViewer.prototype.loadDocument;
    const nativeRevokeObjectURL = URL.revokeObjectURL.bind(URL);
    let stalling = false;
    const stalled: Array<{
      readonly viewer: CoreViewer;
      readonly args: Parameters<CoreViewer['loadDocument']>;
      readonly document: Promise<string | undefined>;
    }> = [];

    installPrintObservers(controls);

    if (isolatedPreview) {
      URL.revokeObjectURL = (url) => {
        if (!stalling) nativeRevokeObjectURL(url);
      };
    }

    CoreViewer.prototype.loadDocument = function (...args) {
      if (stalling) {
        const document =
          typeof args[0] === 'string'
            ? fetch(args[0]).then((response) => response.text())
            : Promise.resolve(undefined);
        stalled.push({ viewer: this, args, document });
        return undefined;
      }
      return nativeLoadDocument.apply(this, args);
    };

    controls.advanceEngineClock = (ms) => controlledScheduler.advanceBy(ms);
    controls.pendingEngineDeadlines = () => controlledScheduler.pendingCount();
    controls.stallEngine = () => {
      stalling = true;
    };
    controls.unstallEngine = () => {
      stalling = false;
    };
    controls.stalledEngineRuns = () => stalled.length;
    controls.oldestStalledEngineDocument = () =>
      stalled[0]?.document ?? Promise.resolve(undefined);
    controls.resumeOldestStalledEngineRun = () => {
      const run = stalled.shift();
      if (run) nativeLoadDocument.apply(run.viewer, run.args);
      return run !== undefined;
    };
    controls.resumeOldestStalledEngineRunUntilLoaded = () => {
      const run = stalled.shift();
      if (!run) return Promise.resolve(false);

      return new Promise((resolve, reject) => {
        const cleanup = () => {
          run.viewer.removeListener('loaded', onLoaded);
          run.viewer.removeListener('error', onError);
        };
        const onLoaded = () => {
          cleanup();
          resolve(true);
        };
        const onError = (payload: unknown) => {
          cleanup();
          reject(new Error(`Late isolated load failed: ${JSON.stringify(payload)}`));
        };

        run.viewer.addListener('loaded', onLoaded);
        run.viewer.addListener('error', onError);
        try {
          nativeLoadDocument.apply(run.viewer, run.args);
        } catch (error) {
          cleanup();
          reject(error);
        }
      });
    };
    controls.failOldestStalledEngineRun = () => {
      const run = stalled.shift();
      if (run) {
        (nativeLoadDocument as unknown as (this: CoreViewer, input: undefined) => void).call(
          run.viewer,
          undefined,
        );
      }
      return run !== undefined;
    };

    return {
      draft: disabledDraftPersistence,
      isolatedPreview,
      configureElements(elements) {
        if (!isolatedPreview) return;
        elements.previewContainer.style.flex = 'none';
        elements.previewContainer.style.width = '600px';
        elements.previewContainer.style.height = '500px';
      },
      preview: {
        paginate: (container, html) =>
          paginateWithControlledScheduler(container, html, {
            mode: isolatedPreview ? 'isolated' : 'direct',
          }),
      },
      printing: { printBook: printWithControlledScheduler },
    };
  };
}

const savedFileBaseRecipe = { draft: disabledDraftPersistence } satisfies AppScenarioRecipe;

const APP_SCENARIOS = {
  production: () => ({}),
  'persistence-disabled': () => ({ draft: disabledDraftPersistence }),
  'saved-file': () => savedFileBaseRecipe,
  'saved-file-load-race': () => ({
    ...savedFileBaseRecipe,
    savedFile: { downloadBook, loadBookFile: loadBookFileWithControlledTiming },
  }),
  'authored-page': () => ({ draft: disabledDraftPersistence, isolatedPreview: false }),
  'authored-page-isolated': () => ({ draft: disabledDraftPersistence }),
  preview: () => ({ draft: disabledDraftPersistence, isolatedPreview: false }),
  'preview-coalescing': createCoalescingPreviewRecipe,
  'preview-controlled-engine': createControlledEngineRecipe(false),
  'preview-controlled-engine-isolated': createControlledEngineRecipe(true),
  'preview-engine-failure': createPreviewEngineFailureRecipe,
  'preview-first-engine-failure': installFirstPreviewEngineFailure,
  'print-error': () => ({
    draft: disabledDraftPersistence,
    isolatedPreview: false,
    preview: { paginate: deterministicPaginate },
    printing: { printBook: failingPrint },
  }),
  'overflow-print-error': () => ({
    draft: disabledDraftPersistence,
    isolatedPreview: false,
    preview: { paginate },
    printing: { printBook: failingPrint },
  }),
} satisfies Record<AppScenarioName, (controls: AppHostControls) => AppScenarioRecipe>;

/**
 * Mounts the application into the full-app host's static elements. The host's DOM is
 * the same for every scenario; only the adapters differ.
 */
export function mountAppHost(scenario: string | null): AppTestSurface {
  const unsupportedControl = () => {
    throw new Error(`Scenario "${scenario ?? ''}" does not provide this Preview control`);
  };
  const controls: AppHostControls = {
    finishSlowPagination: unsupportedControl,
    makePreviewEngineFail: unsupportedControl,
    advanceEngineClock: unsupportedControl,
    pendingEngineDeadlines: unsupportedControl,
    stallEngine: unsupportedControl,
    unstallEngine: unsupportedControl,
    stalledEngineRuns: unsupportedControl,
    oldestStalledEngineDocument: unsupportedControl,
    resumeOldestStalledEngineRun: unsupportedControl,
    resumeOldestStalledEngineRunUntilLoaded: unsupportedControl,
    failOldestStalledEngineRun: unsupportedControl,
    printAttemptsStarted: unsupportedControl,
    printDialoguesOpened: unsupportedControl,
  };
  const recipe = scenarioRecipe(scenario, controls);

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

  if (recipe.isolatedPreview === false) elements.previewContainer.removeAttribute('data-isolated');
  if (recipe.isolatedPreview === true) elements.previewContainer.setAttribute('data-isolated', '');
  recipe.configureElements?.(elements);

  const app = startApp(elements, {
    editor: recipe.editor ?? { create: createEditor },
    preview: recipe.preview ?? { paginate: paginateIsolated },
    printing: recipe.printing ?? { printBook },
    draft: recipe.draft ?? draftStorage,
    savedFile: recipe.savedFile ?? { downloadBook, loadBookFile },
  });

  return {
    source: () => app.editor.getSource(),
    replaceSource: ({ source }) => app.editor.setSource(source),
    finishSlowPagination: () => controls.finishSlowPagination(),
    makePreviewEngineFail: () => controls.makePreviewEngineFail(),
    advanceEngineClock: ({ ms }) => controls.advanceEngineClock(ms),
    pendingEngineDeadlines: () => controls.pendingEngineDeadlines(),
    stallEngine: () => controls.stallEngine(),
    unstallEngine: () => controls.unstallEngine(),
    stalledEngineRuns: () => controls.stalledEngineRuns(),
    oldestStalledEngineDocument: () => controls.oldestStalledEngineDocument(),
    resumeOldestStalledEngineRun: () => controls.resumeOldestStalledEngineRun(),
    resumeOldestStalledEngineRunUntilLoaded: () =>
      controls.resumeOldestStalledEngineRunUntilLoaded(),
    failOldestStalledEngineRun: () => controls.failOldestStalledEngineRun(),
    printAttemptsStarted: () => controls.printAttemptsStarted(),
    printDialoguesOpened: () => controls.printDialoguesOpened(),
  };
}

function scenarioRecipe(scenario: string | null, controls: AppHostControls): AppScenarioRecipe {
  const known = Object.keys(APP_SCENARIOS).join(', ');
  if (scenario === null) throw new Error(`Full-app host needs a scenario, one of: ${known}`);
  if (!isScenarioName(scenario)) {
    throw new Error(`Unknown full-app scenario "${scenario}". Known scenarios: ${known}`);
  }
  return APP_SCENARIOS[scenario](controls);
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
