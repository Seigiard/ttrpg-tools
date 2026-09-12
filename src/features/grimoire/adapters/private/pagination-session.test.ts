import { beforeEach, describe, expect, mock, test } from 'bun:test';

type ListenerName = 'nav' | 'loaded' | 'error';
type Listener = (payload: { epageCount: number; content?: unknown }) => void;

const loadDocumentError = new Error('load failed synchronously');
const createdViewers: MockCoreViewer[] = [];
let loadDocument: (viewer: MockCoreViewer, url: string) => void = () => {
  throw loadDocumentError;
};
let getPageSizesError: Error | undefined;

function settled<T>(promise: Promise<T>): Promise<PromiseSettledResult<T>> {
  return promise.then(
    (value) => ({ status: 'fulfilled', value }) as const,
    (reason) => ({ status: 'rejected', reason }) as const,
  );
}

class MockCoreViewer {
  readonly addedListeners: ListenerName[] = [];
  readonly removedListeners: ListenerName[] = [];
  readonly listeners = new Map<ListenerName, Listener>();

  addListener(name: ListenerName, listener: Listener): void {
    this.addedListeners.push(name);
    this.listeners.set(name, listener);
  }

  removeListener(name: ListenerName, _listener: Listener): void {
    this.removedListeners.push(name);
  }

  loadDocument(url: string): void {
    loadDocument(this, url);
  }

  getPageSizes(): [] {
    if (getPageSizesError !== undefined) throw getPageSizesError;
    return [];
  }
}

mock.module('@vivliostyle/core', () => ({
  CoreViewer: class extends MockCoreViewer {
    constructor(..._args: unknown[]) {
      super();
      createdViewers.push(this);
    }
  },
}));

describe('createVivliostylePaginationSession', () => {
  beforeEach(() => {
    createdViewers.length = 0;
    loadDocument = () => {
      throw loadDocumentError;
    };
    getPageSizesError = undefined;
  });

  test('cleans up Blob URL and listeners when loadDocument throws synchronously', async () => {
    const createdUrls: string[] = [];
    const revokedUrls: string[] = [];
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    URL.createObjectURL = () => {
      const url = `blob:mock-${createdUrls.length}`;
      createdUrls.push(url);
      return url;
    };
    URL.revokeObjectURL = (url) => {
      revokedUrls.push(url);
    };

    try {
      const { createVivliostylePaginationSession } = await import('./pagination-session');
      const session = createVivliostylePaginationSession();
      const target = {
        viewportElement: document.createElement('div'),
        fitToScreen: false,
      };
      const observer = {
        progress() {},
        loaded() {},
        failed() {},
      };

      expect(() => session.start('<html></html>', target, observer)).toThrow(loadDocumentError);
    } finally {
      URL.createObjectURL = originalCreateObjectURL;
      URL.revokeObjectURL = originalRevokeObjectURL;
    }

    expect(createdUrls).toEqual(['blob:mock-0']);
    expect(revokedUrls).toEqual(['blob:mock-0']);
    expect(createdViewers).toHaveLength(1);
    expect(createdViewers[0].addedListeners).toEqual(['nav', 'loaded', 'error']);
    expect(createdViewers[0].removedListeners).toEqual(['nav', 'loaded', 'error']);
  });

  test('reports getPageSizes failure so pagination lifecycle rejects and cleans up once', async () => {
    const pageSizesError = new Error('page sizes unavailable');
    getPageSizesError = pageSizesError;
    loadDocument = (viewer) => {
      viewer.listeners.get('loaded')!({ epageCount: 3 });
    };

    const createdUrls: string[] = [];
    const revokedUrls: string[] = [];
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    URL.createObjectURL = () => {
      const url = `blob:mock-${createdUrls.length}`;
      createdUrls.push(url);
      return url;
    };
    URL.revokeObjectURL = (url) => {
      revokedUrls.push(url);
    };

    const transaction = {
      viewportElement: document.createElement('div'),
      fitToScreen: false,
      commits: 0,
      rollbacks: 0,
      commit() {
        this.commits += 1;
      },
      rollback() {
        this.rollbacks += 1;
      },
    };

    try {
      const { createPagination } = await import('./create-pagination');
      const { createControlledScheduler } = await import('./scheduler');
      const { createVivliostylePaginationSession } = await import('./pagination-session');
      const controlled = createControlledScheduler();
      const paginate = createPagination(
        controlled.scheduler,
        { create: () => transaction },
        createVivliostylePaginationSession(),
      );

      const rejection = await settled(paginate(document.createElement('div'), '<html></html>'));

      expect(rejection.status).toBe('rejected');
      expect(rejection.status === 'rejected' && rejection.reason).toBe(pageSizesError);
      expect(transaction.commits).toBe(0);
      expect(transaction.rollbacks).toBe(1);
      expect(controlled.pendingCount()).toBe(0);
    } finally {
      URL.createObjectURL = originalCreateObjectURL;
      URL.revokeObjectURL = originalRevokeObjectURL;
    }

    expect(createdUrls).toEqual(['blob:mock-0']);
    expect(revokedUrls).toEqual(['blob:mock-0']);
    expect(createdViewers).toHaveLength(1);
    expect(createdViewers[0].removedListeners).toEqual(['nav', 'loaded', 'error']);
  });
});
