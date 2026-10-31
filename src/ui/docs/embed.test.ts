import { describe, expect, it } from 'vitest';
import { expandEmbeds, parseAttrs, parseEmbedLine } from './embed';
import { renderMarkdown } from './markdown';
import { acquireSlot, liveCount, MAX_LIVE } from './slots';

describe('parseEmbedLine', () => {
  it('parses ring, component and design directives', () => {
    expect(parseEmbedLine('::ring[r1-001]')).toEqual({ kind: 'ring', target: 'r1-001', attrs: {} });
    expect(parseEmbedLine('::component[head:halo-round]{view=ring}')).toEqual({
      kind: 'component',
      target: 'head:halo-round',
      attrs: { view: 'ring' },
    });
    expect(parseEmbedLine('::design{head=halo-round caption="A big halo"}')?.attrs).toEqual({
      head: 'halo-round',
      caption: 'A big halo',
    });
  });
  it('rejects malformed directives', () => {
    expect(parseEmbedLine('::ring[]')).toBeNull();
    expect(parseEmbedLine('::component[halo]')).toBeNull();
    expect(parseEmbedLine('::design[x]')).toBeNull();
    expect(parseEmbedLine('text ::ring[a]')).toBeNull();
    expect(parseEmbedLine('::ring[<b>]')).toBeNull();
  });
});

describe('parseAttrs', () => {
  it('handles quotes and bare values', () => {
    expect(parseAttrs(`a=1 b="two words" c='x'`)).toEqual({ a: '1', b: 'two words', c: 'x' });
  });
});

describe('expandEmbeds / renderMarkdown', () => {
  it('turns a directive into a placeholder', () => {
    const { html } = renderMarkdown('Hi\n\n::ring[r1-001]\n\nBye');
    expect(html).toContain('class="live-embed"');
    expect(html).toContain('data-embed="ring"');
    expect(html).toContain('data-target="r1-001"');
  });
  it('leaves directives in code fences alone', () => {
    const out = expandEmbeds('```\n::ring[a]\n```');
    expect(out).not.toContain('live-embed');
  });
  it('escapes attribute values', () => {
    const { html } = renderMarkdown('::design{caption="a<b>c"}');
    expect(html).not.toContain('<b>');
  });
});

describe('acquireSlot', () => {
  it('evicts the oldest viewer beyond the cap', () => {
    const evicted: number[] = [];
    const rel = Array.from({ length: MAX_LIVE + 1 }, (_, i) =>
      acquireSlot(Symbol(String(i)), () => evicted.push(i)),
    );
    expect(evicted).toEqual([0]);
    expect(liveCount()).toBe(MAX_LIVE);
    rel.forEach((r) => r());
    expect(liveCount()).toBe(0);
  });
});
