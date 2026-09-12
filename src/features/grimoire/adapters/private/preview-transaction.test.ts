import { describe, expect, test } from 'bun:test';

import { createBrowserPreviewTransactionFactory } from './preview-transaction';

describe('browser preview transactions', () => {
  test('direct first paint still stages in a disposable candidate', () => {
    const container = document.createElement('div');
    document.body.append(container);

    const transaction = createBrowserPreviewTransactionFactory().create(container, { mode: 'direct' });

    expect(transaction.viewportElement).not.toBe(container);
    expect(transaction.viewportElement.isConnected).toBe(true);
    transaction.rollback();
    expect(transaction.viewportElement.isConnected).toBe(false);
    container.remove();
  });

  test('direct commit atomically replaces the preview with the candidate', () => {
    const container = document.createElement('div');
    container.dataset.vivliostyleViewerStatus = 'complete';
    container.innerHTML = '<p>old</p>';
    const transaction = createBrowserPreviewTransactionFactory().create(container, { mode: 'direct' });

    transaction.viewportElement.innerHTML = '<p>new</p>';
    transaction.viewportElement.setAttribute('data-vivliostyle-viewer-status', 'complete');
    expect(container.textContent).toContain('old');
    expect(container.textContent).toContain('new');

    transaction.commit();

    expect(container.innerHTML).toBe('<p>new</p>');
    expect(container.dataset.vivliostyleViewerStatus).toBe('complete');
  });

  test('direct rollback disposes the candidate and restores the stale preview', () => {
    const container = document.createElement('div');
    container.setAttribute('data-vivliostyle-viewer-status', 'complete');
    container.innerHTML = '<p>old</p>';
    const transaction = createBrowserPreviewTransactionFactory().create(container, { mode: 'direct' });

    transaction.viewportElement.innerHTML = '<p>new</p>';
    container.setAttribute('data-vivliostyle-viewer-status', 'loading');
    transaction.rollback();

    expect(container.innerHTML).toBe('<p>old</p>');
    expect(container.getAttribute('data-vivliostyle-viewer-status')).toBe('complete');
    expect(transaction.viewportElement.isConnected).toBe(false);
  });

  test('isolated commit transfers the candidate iframe into preview ownership', () => {
    const container = document.createElement('div');
    container.innerHTML = '<p>old</p>';
    document.body.append(container);
    const transaction = createBrowserPreviewTransactionFactory().create(container, { mode: 'isolated' });
    transaction.viewportElement.textContent = 'new';
    const frame = container.querySelector('iframe[data-grimoire-preview-document]')!;

    transaction.commit();

    expect(container.children).toHaveLength(1);
    expect(container.firstElementChild).toBe(frame);
    expect(frame.hasAttribute('aria-hidden')).toBe(false);
    expect(transaction.viewportElement.isConnected).toBe(true);
    container.remove();
  });

  test('isolated rollback disposes only the candidate iframe and preserves the published frame', () => {
    const container = document.createElement('div');
    document.body.append(container);
    const published = document.createElement('iframe');
    published.dataset.grimoirePreviewDocument = '';
    container.append(published);

    const transaction = createBrowserPreviewTransactionFactory().create(container, { mode: 'isolated' });
    const frames = container.querySelectorAll('iframe[data-grimoire-preview-document]');
    expect(frames).toHaveLength(2);

    transaction.rollback();

    expect(container.querySelectorAll('iframe[data-grimoire-preview-document]')).toHaveLength(1);
    expect(container.firstElementChild).toBe(published);
    container.remove();
  });

  test('an existing preview marker selects isolated mode without a public option', () => {
    const container = document.createElement('div');
    document.body.append(container);
    const published = document.createElement('iframe');
    published.dataset.grimoirePreviewDocument = '';
    container.append(published);

    createBrowserPreviewTransactionFactory().create(container, {});

    expect(container.querySelectorAll('iframe[data-grimoire-preview-document]')).toHaveLength(2);
    container.remove();
  });
});
