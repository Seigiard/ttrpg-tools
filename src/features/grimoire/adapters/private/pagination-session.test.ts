import { beforeEach, describe, expect, mock, test } from 'bun:test';

type ListenerName = 'nav' | 'loaded' | 'error';
type Listener = (payload: { epageCount: number; content?: unknown }) => void;

const loadDocumentError = new Error('load failed synchronously');
const createdViewers: MockCoreViewer[] = [];

class MockCoreViewer {
  readonly addedListeners: ListenerName[] = [];
  readonly removedListeners: ListenerName[] = [];

  addListener(name: ListenerName, _listener: Listener): void {
    this.addedListeners.push(name);
  }

  removeListener(name: ListenerName, _listener: Listener): void {
    this.removedListeners.push(name);
  }

  loadDocument(_url: string): void {
    throw loadDocumentError;
  }

  getPageSizes(): [] {
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
});
