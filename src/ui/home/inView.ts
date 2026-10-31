import { useEffect, useId, useState, type RefObject } from 'react';

/** True while the element is (nearly) on screen. */
export function useInView(ref: RefObject<Element | null>, rootMargin = '200px'): boolean {
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      setSeen(true);
      return;
    }
    const io = new IntersectionObserver((es) => es.forEach((e) => setSeen(e.isIntersecting)), { rootMargin });
    io.observe(el);
    return () => io.disconnect();
  }, [ref, rootMargin]);
  return seen;
}

/** At most this many live WebGL viewers exist across all cards at once. */
export const MAX_LIVE = 6;
const holders = new Set<string>();
const waiting = new Set<() => boolean>();

function notify(): void {
  for (const w of [...waiting]) if (w()) waiting.delete(w);
}

/** Returns true when this card holds one of the limited live-viewer slots. */
export function useLiveSlot(wanted: boolean): boolean {
  const id = useId();
  const [has, setHas] = useState(false);
  useEffect(() => {
    if (!wanted) return;
    const tryAcquire = (): boolean => {
      if (holders.has(id)) return true;
      if (holders.size >= MAX_LIVE) return false;
      holders.add(id);
      setHas(true);
      return true;
    };
    if (!tryAcquire()) waiting.add(tryAcquire);
    return () => {
      waiting.delete(tryAcquire);
      if (holders.delete(id)) {
        setHas(false);
        notify();
      }
    };
  }, [wanted, id]);
  return has;
}
