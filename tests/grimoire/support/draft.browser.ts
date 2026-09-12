import type { DraftStorage } from '../../../src/features/grimoire/adapters/persistence';

/**
 * Draft persistence for application scenarios that are not about the Draft: nothing
 * is read, so a draft left over from an earlier test cannot become the book the
 * scenario opens on, and nothing is written, so a scenario cannot seed the next one.
 *
 * Named once here rather than spelled out as anonymous no-op functions wherever a
 * scenario needs it, so that "this scenario deliberately has no persistence" stays
 * readable at every use.
 */
export const disabledDraftPersistence: DraftStorage = {
  read: () => undefined,
  write: () => {},
};
