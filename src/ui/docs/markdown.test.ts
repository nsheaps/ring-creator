import { describe, expect, it } from 'vitest';
import { parseFrontMatter, renderMarkdown, sanitizeHtml, slugify } from './markdown';

describe('sanitizeHtml', () => {
  it('removes script tags and bodies', () => {
    expect(sanitizeHtml('<p>a</p><script>alert(1)</script><p>b</p>')).toBe('<p>a</p><p>b</p>');
  });
  it('removes inline event handlers', () => {
    const out = sanitizeHtml('<img src="x.png" onerror="alert(1)" alt="x"><a href="#" onclick=\'y()\'>t</a>');
    expect(out).not.toMatch(/on(error|click)/i);
    expect(out).toContain('src="x.png"');
  });
  it('neutralises javascript: urls', () => {
    expect(sanitizeHtml('<a href="javascript:alert(1)">x</a>')).not.toMatch(/javascript:/i);
  });
  it('removes iframes', () => {
    expect(sanitizeHtml('<iframe src="https://e.com"></iframe>ok')).toBe('ok');
  });
});

describe('renderMarkdown', () => {
  it('renders basic markdown and tables', () => {
    const { html } = renderMarkdown('# Hi\n\n**bold**\n\n| a | b |\n|---|---|\n| 1 | 2 |');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<table>');
  });
  it('adds heading ids and collects headings, deduplicating', () => {
    const { html, headings } = renderMarkdown('## Prong set\n\n### Details\n\n## Prong set');
    expect(headings.map((h) => h.id)).toEqual(['prong-set', 'details', 'prong-set-1']);
    expect(headings[1].level).toBe(3);
    expect(html).toContain('<h2 id="prong-set">');
  });
  it('sanitises embedded scripts', () => {
    const { html } = renderMarkdown('hello <script>x()</script> <b onclick="y()">z</b>');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('onclick');
  });
  it('replaces the {{base}} placeholder', () => {
    const { html } = renderMarkdown('![x]({{base}}screenshots/a.png)', { base: '/ring-creator/' });
    expect(html).toContain('src="/ring-creator/screenshots/a.png"');
  });
  it('leaves internal hash links intact', () => {
    expect(renderMarkdown('[halo](#/components/head/halo-round)').html).toContain('href="#/components/head/halo-round"');
  });
});

describe('parseFrontMatter', () => {
  it('reads title and numeric order', () => {
    const { data, body } = parseFrontMatter('---\ntitle: "Start here"\norder: 2\n---\n# Body');
    expect(data.title).toBe('Start here');
    expect(data.order).toBe(2);
    expect(body).toBe('# Body');
  });
  it('returns the source when there is no front matter', () => {
    expect(parseFrontMatter('# Just text')).toEqual({ data: {}, body: '# Just text' });
  });
});

describe('slugify', () => {
  it('makes url-safe slugs', () => {
    expect(slugify('Cut & Clarity: 101!')).toBe('cut-clarity-101');
  });
});
