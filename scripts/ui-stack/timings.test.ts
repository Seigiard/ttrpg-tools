import { describe, expect, test } from 'bun:test';
import { measureTimings } from './timings';

type Event = { type: string; target?: string };

const expectedScenarios = [
  'weather click-to-result',
  'prices tab switch',
  'paper-minis upload-to-row',
  'paper-minis preview ready',
  'paper-minis PDF generation',
];

class FakeLocator {
  constructor(
    private readonly events: Event[],
    private readonly target: string,
    private readonly afterClick: () => void = () => {},
  ) {}

  filter() {
    return this;
  }

  first() {
    return this;
  }

  last() {
    return this;
  }

  async click() {
    this.events.push({ type: 'click', target: this.target });
    this.afterClick();
  }

  async setInputFiles() {
    this.events.push({ type: 'setInputFiles', target: this.target });
  }

  async waitFor() {
    this.events.push({ type: 'waitFor', target: this.target });
  }

  async textContent() {
    return 'initial weather';
  }
}

class FakePage {
  events: Event[] = [];
  private finishDownload: (() => void) | null = null;

  async goto(url: string) {
    this.events.push({ type: 'goto', target: new URL(url).pathname });
  }

  async waitForFunction() {
    this.events.push({ type: 'waitForFunction' });
  }

  async addInitScript() {
    this.events.push({ type: 'addInitScript' });
  }

  getByRole(role: string, options: { name?: string | RegExp } = {}) {
    const name = options.name instanceof RegExp ? options.name.source : options.name;
    const target = name ? `${role}:${name}` : role;

    return new FakeLocator(this.events, target, () => {
      this.finishDownload?.();
      this.finishDownload = null;
    });
  }

  getByTestId(testId: string) {
    return new FakeLocator(this.events, testId);
  }

  getByTitle(title: string) {
    return new FakeLocator(this.events, title);
  }

  locator(selector: string) {
    return new FakeLocator(this.events, selector);
  }

  waitForEvent() {
    return new Promise<void>((resolve) => {
      this.finishDownload = () => {
        this.events.push({ type: 'download' });
        resolve();
      };
    });
  }

  async evaluate() {
    this.events.push({ type: 'evaluate' });
  }

  async close() {}
}

class FakeContext {
  pages: FakePage[] = [];

  async newPage() {
    const page = new FakePage();
    this.pages.push(page);

    return page;
  }

  async close() {}
}

describe('measureTimings', () => {
  test('hydrates each island before browser interactions and waits for action effects', async () => {
    // #given
    const context = new FakeContext();

    const browser = {
      newContext: async () => context,
    };

    // #when
    // SAFETY: The fake browser and pages implement the members exercised by measureTimings.
    const summaries = await measureTimings(browser as never, 'http://127.0.0.1:4410');

    // #then
    expect(summaries.map((summary) => summary.name)).toEqual(expectedScenarios);

    for (const summary of summaries) {
      expect(summary.repeats).toBe(10);
      expect(summary.samplesMs).toHaveLength(10);
    }

    expect(context.pages).toHaveLength(expectedScenarios.length * 10);

    for (const page of context.pages) {
      const firstInteraction = page.events.findIndex(
        (event) => event.type === 'click' || event.type === 'setInputFiles',
      );

      expect(firstInteraction).toBeGreaterThan(0);

      const hydratedBeforeInteraction = page.events
        .slice(0, firstInteraction)
        .some((event) => event.type === 'waitForFunction');

      expect(hydratedBeforeInteraction).toBe(true);

      for (const [index, event] of page.events.entries()) {
        if (event.type !== 'click' && event.type !== 'setInputFiles') continue;

        const nextInteraction = page.events.findIndex(
          (nextEvent, nextIndex) =>
            nextIndex > index && (nextEvent.type === 'click' || nextEvent.type === 'setInputFiles'),
        );

        const effectWindow = page.events.slice(
          index + 1,
          nextInteraction === -1 ? undefined : nextInteraction,
        );

        const observedEffect = effectWindow.some(
          (nextEvent) =>
            nextEvent.type === 'waitForFunction' ||
            nextEvent.type === 'waitFor' ||
            nextEvent.type === 'download',
        );

        expect(observedEffect).toBe(true);
      }

      const pdfClick = page.events.findIndex(
        (event) =>
          event.type === 'click' &&
          (event.target === 'button:Предпросмотр PDF' || event.target === 'button:Скачать PDF'),
      );

      if (pdfClick === -1) continue;

      const pdfButtonReady = page.events
        .slice(0, pdfClick)
        .some(
          (event) =>
            event.type === 'waitFor' &&
            (event.target === 'button:Предпросмотр PDF' || event.target === 'button:Скачать PDF'),
        );

      expect(pdfButtonReady).toBe(true);
    }
  });
});
