import type { Design } from '@/models/types';

export function download(name: string, href: string): void {
  const a = document.createElement('a');
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function slug(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'ring'
  );
}

export function downloadJson(design: Design): void {
  const url = URL.createObjectURL(new Blob([JSON.stringify(design, null, 2)], { type: 'application/json' }));
  download(`${slug(design.name)}.json`, url);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function parseDesign(text: string): Design | null {
  try {
    const d = JSON.parse(text) as Design;
    return d &&
      d.version === 1 &&
      d.engagement &&
      d.engagement.center &&
      d.engagement.head &&
      d.engagement.shank
      ? d
      : null;
  } catch {
    return null;
  }
}

/** Downscale a PNG data URL so saved thumbnails stay small in localStorage. */
export function shrink(dataUrl: string, width = 320): Promise<string> {
  if (!dataUrl) return Promise.resolve('');
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const h = Math.round((img.height * width) / img.width);
        const c = document.createElement('canvas');
        c.width = width;
        c.height = h;
        c.getContext('2d')?.drawImage(img, 0, 0, width, h);
        resolve(c.toDataURL('image/jpeg', 0.8));
      } catch {
        resolve(dataUrl);
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}
