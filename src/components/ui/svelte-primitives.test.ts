import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import ButtonProbe from '../svelte-fixtures/ButtonProbe.svelte';
import CardProbe from '../svelte-fixtures/CardProbe.svelte';
import DialogProbe from '../svelte-fixtures/DialogProbe.svelte';
import SkeletonProbe from '../svelte-fixtures/SkeletonProbe.svelte';
import TabsProbe from '../svelte-fixtures/TabsProbe.svelte';
import { RefreshCw } from '../icons';

beforeEach(() => {
  cleanup();
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.open = true;
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function close() {
    this.open = false;
    this.removeAttribute('open');
  };
});
afterEach(cleanup);

describe('Svelte Skeleton', () => {
  test('loading=false: children are readable and the node has no masking classes', () => {
    // #given readable content
    // #when the skeleton is not loading
    render(SkeletonProbe, { loading: false, text: 'Результат' });
    const node = screen.getByText('Результат');
    // #then the node stays visible and unmasked
    expect({
      slot: node.getAttribute('data-slot'),
      loading: node.getAttribute('data-loading'),
      hidden: node.getAttribute('aria-hidden'),
      pulse: node.className.includes('animate-pulse'),
      transparent: node.className.includes('text-transparent'),
    }).toEqual({
      slot: 'skeleton',
      loading: null,
      hidden: null,
      pulse: false,
      transparent: false,
    });
  });

  test('loading=true: children stay in DOM, masked and hidden from a11y', () => {
    // #given placeholder content
    // #when the skeleton is loading
    render(SkeletonProbe, { loading: true, text: 'Плейсхолдер' });
    const node = screen.getByText('Плейсхолдер');
    // #then the same content sets box size while the wrapper is masked
    expect({
      loading: node.getAttribute('data-loading'),
      hidden: node.getAttribute('aria-hidden'),
      pulse: node.className.includes('animate-pulse'),
      transparent: node.className.includes('text-transparent'),
    }).toEqual({ loading: 'true', hidden: 'true', pulse: true, transparent: true });
  });

  test('loading=true: interactivity is disabled by classes', () => {
    // #given a loading skeleton
    // #when it renders
    render(SkeletonProbe, { loading: true });
    const node = screen.getByText('x');
    // #then pointer and selection interaction are suppressed
    expect({
      pointer: node.className.includes('pointer-events-none'),
      select: node.className.includes('select-none'),
    }).toEqual({ pointer: true, select: true });
  });

  test('node type is stable across loading states', () => {
    // #given the same skeleton content
    const loaded = render(SkeletonProbe, { loading: false });
    const loadedTag = loaded.getByText('x').tagName;
    cleanup();
    // #when the loading state changes
    const loading = render(SkeletonProbe, { loading: true });
    const loadingTag = loading.getByText('x').tagName;
    // #then layout is anchored by the same element type
    expect({ loadedTag, loadingTag }).toEqual({ loadedTag: 'SPAN', loadingTag: 'SPAN' });
  });

  test('caller classes are merged while base loading classes remain', () => {
    // #given a caller class
    // #when the loading skeleton renders
    render(SkeletonProbe, { loading: true, class: 'block' });
    const node = screen.getByText('x');
    // #then both caller and base classes are present
    expect({ block: node.className.includes('block'), pulse: node.className.includes('animate-pulse') }).toEqual({
      block: true,
      pulse: true,
    });
  });
});

test('Svelte Button keeps the button slot and caller classes', () => {
  // #given caller content and a class
  // #when the button renders
  render(ButtonProbe);
  const button = screen.getByRole('button', { name: 'Roll' });
  // #then it exposes the same slot contract and merged classes
  expect({ slot: button.getAttribute('data-slot'), callerClass: button.className.includes('min-h-11') }).toEqual({
    slot: 'button',
    callerClass: true,
  });
});

test('Svelte Card parts expose the same data slots', () => {
  // #given card content split into header and body
  // #when card parts render
  render(CardProbe);
  // #then each public card slot is present
  expect([
    screen.getByTestId('card').getAttribute('data-slot'),
    screen.getByTestId('card-header').getAttribute('data-slot'),
    screen.getByTestId('card-content').getAttribute('data-slot'),
  ]).toEqual(['card', 'card-header', 'card-content']);
});

test('Svelte tabs click and arrow keys move the selected tab', async () => {
  // #given three tabs
  render(TabsProbe);
  const tabs = screen.getAllByRole('tab');
  // #when the second tab is clicked and ArrowRight is pressed
  await fireEvent.click(tabs[1]!);
  expect(tabs.map((tab) => tab.getAttribute('aria-selected'))).toEqual(['false', 'true', 'false']);
  tabs[1]!.focus();
  await fireEvent.keyDown(screen.getByRole('tablist'), { key: 'ArrowRight' });
  // #then focus and selection move to the next tab
  expect({
    selected: tabs.map((tab) => tab.getAttribute('aria-selected')),
    focused: document.activeElement?.textContent,
    panel: screen.getByRole('tabpanel').textContent,
  }).toEqual({ selected: ['false', 'false', 'true'], focused: 'Winter', panel: 'Winter panel' });
});

test('Svelte Dialog traps Tab, closes on Escape and restores focus', async () => {
  // #given a dialog opener
  render(DialogProbe);
  const opener = screen.getByTestId('dialog-opener');
  // #when the dialog opens and keyboard navigation reaches its edges
  opener.focus();
  await fireEvent.click(opener);
  const first = await screen.findByTestId('first-action');
  const last = screen.getByTestId('last-action');
  const dialog = document.querySelector('dialog');
  expect(dialog?.getAttribute('aria-labelledby')).toStartWith('dialog-title-');
  first.focus();
  await fireEvent.keyDown(dialog!, {
    key: 'Tab',
    shiftKey: true,
  });
  expect(document.activeElement).toBe(last);
  await fireEvent.keyDown(dialog!, { key: 'Escape' });
  // #then Escape closes it and focus returns to the opener
  await waitFor(() =>
    expect({ present: document.querySelector('dialog'), focused: document.activeElement }).toEqual({
      present: null,
      focused: opener,
    }),
  );
  expect(first.isConnected).toBe(false);
});

test('Svelte icon export renders an SVG icon', () => {
  // #given the migration icon facade
  // #when the refresh icon renders
  render(RefreshCw, { 'aria-label': 'Refresh' });
  // #then the accessible SVG is available to Svelte components
  expect(screen.getByLabelText('Refresh').tagName).toBe('svg');
});
