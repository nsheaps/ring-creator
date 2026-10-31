/** Max WebGL contexts alive at once on a page; the oldest is released when a fifth wakes up. */
export const MAX_LIVE = 4;
const live = new Map<symbol, () => void>();

/** Registers an active viewer; evicts the oldest ones beyond the cap. Returns the release function. */
export function acquireSlot(id: symbol, evict: () => void, max = MAX_LIVE): () => void {
  live.delete(id);
  live.set(id, evict);
  while (live.size > max) {
    const first = live.entries().next().value as [symbol, () => void];
    live.delete(first[0]);
    first[1]();
  }
  return () => {
    live.delete(id);
  };
}
export function liveCount(): number {
  return live.size;
}
