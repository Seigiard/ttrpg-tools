import { type PackOptions, resolveMinis } from '@/lib/paper-minis/geometry';
import { packMinis, packRows } from '@/lib/paper-minis/packing';
import type { PackingEntry } from '@/lib/paper-minis/types';

// The row candidate on its own, with the resolve step's counts and skip and
// limit reports beside it, so row-layout tests read one result.
export function packRowCandidate(entries: PackingEntry[], opts: PackOptions) {
  return { ...packMinis(entries, opts), ...packRows(resolveMinis(entries, opts), opts) };
}
