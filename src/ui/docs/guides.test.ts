import { describe, expect, it } from 'vitest';
import { loadGuides } from './guides';

describe('loadGuides', () => {
  it('orders by order then title and reads front matter', () => {
    const g = loadGuides({
      '/x/b.md': '---\ntitle: Beta\norder: 2\n---\n# Beta\n\nText b',
      '/x/a.md': '---\ntitle: Alpha\norder: 1\n---\nText a',
      '/x/z.md': '# Zed\n\nLast one here.',
    });
    expect(g.map((x) => x.slug)).toEqual(['a', 'b', 'z']);
    expect(g[2].title).toBe('Zed');
    expect(g[2].summary).toBe('Last one here.');
  });
});
