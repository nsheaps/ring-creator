import { marked } from 'marked';

export interface Heading {
  level: number;
  text: string;
  id: string;
}
export interface Rendered {
  html: string;
  headings: Heading[];
}
export interface FrontMatter {
  title?: string;
  order?: number;
  summary?: string;
  [key: string]: string | number | undefined;
}

/** Remove scripts, embedded content, inline event handlers and javascript: URLs from HTML. */
export function sanitizeHtml(html: string): string {
  let out = html;
  out = out.replace(/<(script|style|iframe|object|embed|link|meta)\b[\s\S]*?<\/\1\s*>/gi, '');
  out = out.replace(/<(script|style|iframe|object|embed|link|meta)\b[^>]*\/?>/gi, '');
  out = out.replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  out = out.replace(
    /\s(href|src|xlink:href|action|formaction)\s*=\s*("|')\s*(javascript|data:text\/html|vbscript):[^"']*\2/gi,
    ' $1="#"',
  );
  out = out.replace(/\s(href|src)\s*=\s*(javascript|vbscript):[^\s>]*/gi, ' $1="#"');
  return out;
}

export function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/&[a-z]+;/g, '')
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-') || 'section'
  );
}

const stripTags = (s: string) =>
  s
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

/** Markdown -> sanitised HTML. Headings h1-h4 get stable ids and are returned for a table of contents. */
export function renderMarkdown(src: string, opts: { base?: string } = {}): Rendered {
  const text = opts.base === undefined ? src : src.replace(/\{\{base\}\}/g, opts.base);
  const raw = marked.parse(text, { async: false, gfm: true }) as string;
  const safe = sanitizeHtml(raw);
  const headings: Heading[] = [];
  const used = new Map<string, number>();
  const html = safe.replace(
    /<h([1-4])(\s[^>]*)?>([\s\S]*?)<\/h\1>/g,
    (_m, lv: string, _attrs: string | undefined, inner: string) => {
      const plain = stripTags(inner).trim();
      const base = slugify(plain);
      const n = used.get(base) ?? 0;
      used.set(base, n + 1);
      const id = n === 0 ? base : `${base}-${n}`;
      headings.push({ level: Number(lv), text: plain, id });
      return `<h${lv} id="${id}">${inner}</h${lv}>`;
    },
  );
  return { html, headings };
}

/** Parses a leading `---` block of `key: value` lines. Numbers are converted for `order`. */
export function parseFrontMatter(src: string): { data: FrontMatter; body: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(src);
  if (!m) return { data: {}, body: src };
  const data: FrontMatter = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line);
    if (!kv) continue;
    let v = kv[2].trim().replace(/^(["'])(.*)\1$/, '$2');
    if (kv[1] === 'order' && v !== '' && !Number.isNaN(Number(v))) {
      data.order = Number(v);
      continue;
    }
    data[kv[1]] = v;
    v = '';
  }
  return { data, body: src.slice(m[0].length) };
}
