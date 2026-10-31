import { useSyncExternalStore } from 'react';
import type { Design } from '@/models/types';
import { defaultDesign, newId } from './defaults';

const KEY_CURRENT = 'ring-creator:current:v1';
const KEY_SAVED = 'ring-creator:saved:v1';

export interface SavedDesign {
  design: Design;
  /** Small PNG data URL, may be empty. */
  thumb: string;
}

interface State {
  current: Design;
  saved: SavedDesign[];
}

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or unavailable: the app still works in memory */
  }
}

let state: State = { current: read<Design>(KEY_CURRENT) ?? defaultDesign(), saved: read<SavedDesign[]>(KEY_SAVED) ?? [] };
const listeners = new Set<() => void>();
function emit(): void {
  listeners.forEach((l) => l());
}
function set(next: Partial<State>): void {
  state = { ...state, ...next };
  if (next.current) write(KEY_CURRENT, state.current);
  if (next.saved) write(KEY_SAVED, state.saved);
  emit();
}

export const store = {
  get: () => state,
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  /** Replace the working design (e.g. when opening an example). Gives it a fresh id unless keepId. */
  load(design: Design, keepId = false): void {
    const now = new Date().toISOString();
    set({ current: structuredClone({ ...design, id: keepId ? design.id : newId(), updatedAt: now }) });
  },
  update(fn: (d: Design) => void): void {
    const d = structuredClone(state.current);
    fn(d);
    d.updatedAt = new Date().toISOString();
    set({ current: d });
  },
  save(thumb: string): void {
    const d = structuredClone(state.current);
    const rest = state.saved.filter((s) => s.design.id !== d.id);
    set({ saved: [{ design: d, thumb }, ...rest] });
  },
  remove(id: string): void {
    set({ saved: state.saved.filter((s) => s.design.id !== id) });
  },
  reset(): void {
    set({ current: defaultDesign() });
  },
};

export function useStore(): State {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}

// ---- share / export ----

export function encodeDesign(d: Design): string {
  const json = JSON.stringify(d);
  const b64 = btoa(String.fromCharCode(...new TextEncoder().encode(json)));
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeDesign(s: string): Design | null {
  try {
    const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
    const d = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)))) as Design;
    return d && d.version === 1 && d.engagement ? d : null;
  } catch {
    return null;
  }
}
