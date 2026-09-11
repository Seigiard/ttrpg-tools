export type Schedule = symbol;

export interface Scheduler {
  schedule(callback: () => void, delayMilliseconds: number): Schedule;
  cancel(schedule: Schedule): void;
}

export const browserScheduler: Scheduler = (() => {
  const timeoutIds = new Map<Schedule, number>();

  return {
    schedule(callback, delayMilliseconds) {
      const schedule = Symbol();
      const timeoutId = window.setTimeout(() => {
        timeoutIds.delete(schedule);
        callback();
      }, delayMilliseconds);
      timeoutIds.set(schedule, timeoutId);
      return schedule;
    },
    cancel(schedule) {
      const timeoutId = timeoutIds.get(schedule);
      if (timeoutId === undefined) return;

      window.clearTimeout(timeoutId);
      timeoutIds.delete(schedule);
    },
  };
})();

export interface ControlledScheduler {
  readonly scheduler: Scheduler;
  advanceBy(milliseconds: number): void;
  pendingCount(): number;
}

interface PendingSchedule {
  readonly dueAt: number;
  readonly order: number;
  readonly callback: () => void;
}

export function createControlledScheduler(): ControlledScheduler {
  const pending = new Map<Schedule, PendingSchedule>();
  let now = 0;
  let nextOrder = 0;

  const scheduler: Scheduler = {
    schedule(callback, delayMilliseconds) {
      const schedule = Symbol();
      pending.set(schedule, {
        dueAt: now + Math.max(0, delayMilliseconds),
        order: nextOrder++,
        callback,
      });
      return schedule;
    },
    cancel(schedule) {
      pending.delete(schedule);
    },
  };

  return {
    scheduler,
    advanceBy(milliseconds) {
      const target = now + milliseconds;

      while (true) {
        const next = Array.from(pending.entries())
          .filter(([, schedule]) => schedule.dueAt <= target)
          .toSorted(([, left], [, right]) => left.dueAt - right.dueAt || left.order - right.order)[0];
        if (next === undefined) break;

        const [token, schedule] = next;
        pending.delete(token);
        now = schedule.dueAt;
        schedule.callback();
      }

      now = target;
    },
    pendingCount() {
      return pending.size;
    },
  };
}
