import { navigate } from '@/router';

const KEY = 'ring-creator:compare:v1';
export const SLOTS = ['a', 'b', 'c'] as const;

export function readPicks(): string[] {
  try {
    const v = JSON.parse(sessionStorage.getItem(KEY) ?? '[]') as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, 3) : [];
  } catch {
    return [];
  }
}

export function writePicks(ids: string[]): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(ids.slice(0, 3)));
  } catch {
    /* ignore */
  }
}

export function compareHref(ids: string[]): string {
  const q = new URLSearchParams();
  ids.slice(0, 3).forEach((id, i) => q.set(SLOTS[i], id));
  const s = q.toString();
  return `/compare${s ? `?${s}` : ''}`;
}

/** Adds an id to the remembered picks (max 3, oldest dropped) and opens Compare. */
export function addToCompare(id: string): void {
  const picks = readPicks().filter((x) => x !== id);
  if (picks.length >= 3) picks.shift();
  picks.push(id);
  writePicks(picks);
  navigate(compareHref(picks));
}
