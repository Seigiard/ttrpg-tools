import { describe, expect, test } from 'bun:test';

import { EngineTimeoutError } from '../engine-timeout';
import { createPagination, type PaginationSessionObserver, type PreviewTransaction } from './create-pagination';
import { createControlledScheduler } from './scheduler';

function settled<T>(promise: Promise<T>): Promise<PromiseSettledResult<T>> {
  return promise.then(
    (value) => ({ status: 'fulfilled', value }) as const,
    (reason) => ({ status: 'rejected', reason }) as const,
  );
}

function createManualTransaction(container: HTMLElement): PreviewTransaction & {
  commits: number;
  rollbacks: number;
} {
  const viewportElement = container.ownerDocument.createElement('div');
  return {
    viewportElement,
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
}

describe('createPagination', () => {
  test('commits once on the first loaded event and ignores later callbacks', async () => {
    const controlled = createControlledScheduler();
    const container = document.createElement('div');
    const transaction = createManualTransaction(container);
    let observer: PaginationSessionObserver | undefined;
    let cleanups = 0;
    const paginate = createPagination(
      controlled.scheduler,
      { create: () => transaction },
      {
        start(_html, _target, next) {
          observer = next;
          return () => (cleanups += 1);
        },
      },
    );

    const result = paginate(container, '<html></html>');
    observer!.loaded({ pageCount: 2, pageSizes: [{ width: 10, height: 20 }] });

    expect(await result).toEqual({
      pageCount: 2,
      pageSizes: [{ width: 10, height: 20 }],
      overflowingPages: [],
    });
    observer!.failed(new Error('late failure'));
    observer!.loaded({ pageCount: 3, pageSizes: [] });

    expect(transaction.commits).toBe(1);
    expect(transaction.rollbacks).toBe(0);
    expect(cleanups).toBe(1);
    expect(controlled.pendingCount()).toBe(0);
  });

  test('progress rearms the inactivity deadline', async () => {
    const controlled = createControlledScheduler();
    const container = document.createElement('div');
    const transaction = createManualTransaction(container);
    let observer: PaginationSessionObserver | undefined;
    const paginate = createPagination(
      controlled.scheduler,
      { create: () => transaction },
      {
        start(_html, _target, next) {
          observer = next;
          return () => undefined;
        },
      },
    );

    const result = paginate(container, '<html></html>');
    controlled.advanceBy(29_000);
    observer!.progress(4);
    controlled.advanceBy(29_000);
    expect(await Promise.race([settled(result), Promise.resolve('pending')])).toBe('pending');

    controlled.advanceBy(1_000);
    const rejection = await settled(result);
    expect(rejection.status).toBe('rejected');
    expect(rejection.status === 'rejected' && rejection.reason).toBeInstanceOf(EngineTimeoutError);
    expect(transaction.rollbacks).toBe(1);
  });

  test('terminal error rolls back and owns cleanup before a later success', async () => {
    const controlled = createControlledScheduler();
    const container = document.createElement('div');
    const transaction = createManualTransaction(container);
    let observer: PaginationSessionObserver | undefined;
    let cleanups = 0;
    const paginate = createPagination(
      controlled.scheduler,
      { create: () => transaction },
      {
        start(_html, _target, next) {
          observer = next;
          return () => (cleanups += 1);
        },
      },
    );

    const result = paginate(container, '<html></html>');
    observer!.failed(new Error('broken'));
    observer!.loaded({ pageCount: 1, pageSizes: [] });

    const rejection = await settled(result);
    expect(rejection.status).toBe('rejected');
    expect(rejection.status === 'rejected' && rejection.reason.message).toBe('broken');
    expect(transaction.commits).toBe(0);
    expect(transaction.rollbacks).toBe(1);
    expect(cleanups).toBe(1);
  });

  test('a synchronous terminal session callback still cleans up the session once', async () => {
    const controlled = createControlledScheduler();
    const container = document.createElement('div');
    const transaction = createManualTransaction(container);
    let cleanups = 0;
    const paginate = createPagination(
      controlled.scheduler,
      { create: () => transaction },
      {
        start(_html, _target, observer) {
          observer.loaded({ pageCount: 1, pageSizes: [] });
          return () => (cleanups += 1);
        },
      },
    );

    expect(await paginate(container, '<html></html>')).toEqual({
      pageCount: 1,
      pageSizes: [],
      overflowingPages: [],
    });

    expect(cleanups).toBe(1);
    expect(controlled.pendingCount()).toBe(0);
  });

  test('start failure and commit failure both preserve the previous preview', async () => {
    const controlled = createControlledScheduler();
    const container = document.createElement('div');
    const transaction = createManualTransaction(container);
    const startFailure = createPagination(
      controlled.scheduler,
      { create: () => transaction },
      { start: () => { throw new Error('sync start'); } },
    );

    const startRejection = await settled(startFailure(container, '<html></html>'));
    expect(startRejection.status).toBe('rejected');
    expect(startRejection.status === 'rejected' && startRejection.reason.message).toBe('sync start');
    expect(transaction.rollbacks).toBe(1);

    let observer: PaginationSessionObserver | undefined;
    const commitFailureTransaction = createManualTransaction(container);
    commitFailureTransaction.commit = () => {
      commitFailureTransaction.commits += 1;
      throw new Error('commit failed');
    };
    const commitFailure = createPagination(
      controlled.scheduler,
      { create: () => commitFailureTransaction },
      {
        start(_html, _target, next) {
          observer = next;
          return () => undefined;
        },
      },
    );

    const result = commitFailure(container, '<html></html>');
    observer!.loaded({ pageCount: 1, pageSizes: [] });

    const commitRejection = await settled(result);
    expect(commitRejection.status).toBe('rejected');
    expect(commitRejection.status === 'rejected' && commitRejection.reason.message).toBe(
      'commit failed',
    );
    expect(commitFailureTransaction.commits).toBe(1);
    expect(commitFailureTransaction.rollbacks).toBe(1);
  });
});
