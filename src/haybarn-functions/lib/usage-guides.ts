import { defaultSnapshot, canonicalSnapshot, type Snapshot } from './catalog';
import { usageGuides } from '../data/usage-guides';

// These examples target the current WASM runtime, not older native catalogs.
export function usageFor(snapshot: Snapshot, name: string) {
  return canonicalSnapshot(snapshot) === defaultSnapshot ? usageGuides[name] : undefined;
}
