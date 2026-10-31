/**
 * Markdown embed directives, one per line:
 *   ::ring[example-id]                    a gallery example ring
 *   ::component[kind:id]                  one component model
 *   ::design{head=halo-round metal=platinum view=set}   an ad-hoc design
 * Any directive may carry `{key=value ...}` attributes (values may be "quoted"); `caption` and `view` apply to all.
 * Directives are replaced with an inert placeholder `<div class="live-embed" data-embed=...>`; the Docs page
 * mounts a lazy live viewer into each placeholder.
 */
export type EmbedKind = 'ring' | 'component' | 'design';

export interface EmbedSpec {
  kind: EmbedKind;
  /** Example id (ring) or `kind:id` (component); empty for design. */
  target: string;
  attrs: Record<string, string>;
}

const LINE = /^[ \t]*::(ring|component|design)(?:\[([^\]\n]*)\])?(?:\{([^}\n]*)\})?[ \t]*$/;

export function parseAttrs(src: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([A-Za-z][\w-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"']+))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) out[m[1]] = m[2] ?? m[3] ?? m[4] ?? '';
  return out;
}

/** Parses one directive line, or returns null if the line is not a valid directive. */
export function parseEmbedLine(line: string): EmbedSpec | null {
  const m = LINE.exec(line);
  if (!m) return null;
  const kind = m[1] as EmbedKind;
  const target = (m[2] ?? '').trim();
  const attrs = parseAttrs(m[3] ?? '');
  if (kind === 'ring' && !/^[\w-]+$/.test(target)) return null;
  if (kind === 'component' && !/^[\w-]+:[\w-]+$/.test(target)) return null;
  if (kind === 'design' && target !== '') return null;
  return { kind, target, attrs };
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function embedPlaceholder(spec: EmbedSpec): string {
  return `<div class="live-embed" data-embed="${spec.kind}" data-target="${esc(spec.target)}" data-attrs="${esc(
    JSON.stringify(spec.attrs),
  )}"></div>`;
}

/** Replaces directive lines (outside fenced code) with placeholders. Invalid directives are left as text. */
export function expandEmbeds(src: string): string {
  let fence = false;
  return src
    .split('\n')
    .map((line) => {
      if (/^\s*(```|~~~)/.test(line)) fence = !fence;
      if (fence) return line;
      const spec = parseEmbedLine(line);
      return spec ? `\n${embedPlaceholder(spec)}\n` : line;
    })
    .join('\n');
}

/** Reads a spec back from a placeholder element's dataset. */
export function specFromElement(el: HTMLElement): EmbedSpec | null {
  const kind = el.dataset.embed as EmbedKind | undefined;
  if (kind !== 'ring' && kind !== 'component' && kind !== 'design') return null;
  let attrs: Record<string, string> = {};
  try {
    const parsed: unknown = JSON.parse(el.dataset.attrs ?? '{}');
    if (parsed && typeof parsed === 'object') attrs = parsed as Record<string, string>;
  } catch {
    /* ignore */
  }
  return { kind, target: el.dataset.target ?? '', attrs };
}
