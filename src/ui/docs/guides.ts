import { parseFrontMatter, renderMarkdown, type Heading } from './markdown';

export interface Guide {
  slug: string;
  title: string;
  order: number;
  summary: string;
  body: string;
}

const files = import.meta.glob('../../../docs/guides/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

function firstHeading(body: string): string | undefined {
  return /^#\s+(.+)$/m.exec(body)?.[1]?.trim();
}
function firstParagraph(body: string): string {
  for (const block of body.split(/\n\s*\n/)) {
    const t = block.trim();
    if (t && !t.startsWith('#') && !t.startsWith('![') && !t.startsWith('|') && !t.startsWith('```'))
      return t.replace(/\s+/g, ' ').replace(/[*_`]/g, '').slice(0, 200);
  }
  return '';
}

export function loadGuides(raw: Record<string, string> = files): Guide[] {
  const out: Guide[] = Object.entries(raw).map(([path, src]) => {
    const slug = path.replace(/^.*\//, '').replace(/\.md$/, '');
    const { data, body } = parseFrontMatter(src);
    return {
      slug,
      title: String(data.title ?? firstHeading(body) ?? slug),
      order: typeof data.order === 'number' ? data.order : 1000,
      summary: String(data.summary ?? firstParagraph(body)),
      body,
    };
  });
  return out.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
}

export const guides = loadGuides();

export function renderGuide(g: Guide): { html: string; headings: Heading[] } {
  return renderMarkdown(g.body, { base: import.meta.env.BASE_URL });
}
