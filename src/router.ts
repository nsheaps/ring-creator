import { useSyncExternalStore } from 'react';

/** Minimal hash router: "#/components/head/halo-round?x=1" -> { path: ['components','head','halo-round'], query } */
export interface Route {
  path: string[];
  query: URLSearchParams;
  raw: string;
}

function parse(): Route {
  const h = window.location.hash.replace(/^#/, '') || '/';
  const [p, q = ''] = h.split('?');
  return { path: p.split('/').filter(Boolean).map(decodeURIComponent), query: new URLSearchParams(q), raw: h };
}

let cache = parse();
const subs = new Set<() => void>();
window.addEventListener('hashchange', () => {
  cache = parse();
  subs.forEach((s) => s());
});

export function useRoute(): Route {
  return useSyncExternalStore(
    (l) => {
      subs.add(l);
      return () => subs.delete(l);
    },
    () => cache,
  );
}

export function navigate(to: string): void {
  window.location.hash = to.startsWith('#') ? to : `#${to}`;
}

/** Asset URL under the deploy base (screenshots, docs images). */
export function asset(p: string): string {
  return `${import.meta.env.BASE_URL}${p.replace(/^\//, '')}`;
}
