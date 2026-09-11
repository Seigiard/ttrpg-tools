import { describe, expect, test } from 'bun:test';

import { createControlledScheduler } from './scheduler';

describe('controlled scheduler', () => {
  test('runs pending schedules only after their delays elapse', () => {
    const controlled = createControlledScheduler();
    const calls: string[] = [];

    controlled.scheduler.schedule(() => calls.push('later'), 30_000);
    controlled.scheduler.schedule(() => calls.push('sooner'), 10_000);

    controlled.advanceBy(9_999);
    expect(calls).toEqual([]);
    expect(controlled.pendingCount()).toBe(2);

    controlled.advanceBy(1);
    expect(calls).toEqual(['sooner']);
    expect(controlled.pendingCount()).toBe(1);

    controlled.advanceBy(20_000);
    expect(calls).toEqual(['sooner', 'later']);
    expect(controlled.pendingCount()).toBe(0);
  });

  test('does not run a canceled schedule', () => {
    const controlled = createControlledScheduler();
    const calls: string[] = [];
    const schedule = controlled.scheduler.schedule(() => calls.push('canceled'), 1_000);

    controlled.scheduler.cancel(schedule);
    controlled.advanceBy(1_000);

    expect(calls).toEqual([]);
    expect(controlled.pendingCount()).toBe(0);
  });
});
