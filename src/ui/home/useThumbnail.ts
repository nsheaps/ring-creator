import { useEffect, useState } from 'react';
import type { Design } from '@/models/types';
import type { RingView } from '@/geometry/assemble';
import { cachedThumbnail, thumbnailFor } from '../thumbnails';

/** Thumbnail data URL for a design ('' until ready or when unavailable). Only renders when `enabled`. */
export function useThumbnail(design: Design, enabled = true, view: RingView = 'set'): string {
  const [src, setSrc] = useState(() => cachedThumbnail(design, view) ?? '');
  useEffect(() => {
    if (!enabled) return;
    const hit = cachedThumbnail(design, view);
    if (hit !== undefined) {
      setSrc(hit);
      return;
    }
    let alive = true;
    void thumbnailFor(design, view).then((s) => alive && setSrc(s));
    return () => {
      alive = false;
    };
  }, [design, enabled, view]);
  return src;
}
