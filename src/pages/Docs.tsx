import { useEffect, useMemo } from 'react';
import { useRoute } from '@/router';
import { guides, renderGuide } from '@/ui/docs/guides';
import './reference.css';

function Index() {
  return (
    <main className="page rf">
      <h1>Guides</h1>
      <p className="muted">How to design a ring, choose stones and metals, and what everything is called.</p>
      {guides.length === 0 ? (
        <p className="muted">No guides yet.</p>
      ) : (
        <div className="grid" data-testid="guide-list">
          {guides.map((g) => (
            <a key={g.slug} className="card rf-card" href={`#/docs/${g.slug}`}>
              <h3>{g.title}</h3>
              <p className="muted">{g.summary}</p>
            </a>
          ))}
        </div>
      )}
    </main>
  );
}

function Article({ slug }: { slug: string }) {
  const idx = guides.findIndex((g) => g.slug === slug);
  const guide = guides[idx];
  const rendered = useMemo(() => (guide ? renderGuide(guide) : null), [guide]);
  const { query } = useRoute();
  const anchor = query.get('s');

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [slug]);
  useEffect(() => {
    if (anchor) document.getElementById(anchor)?.scrollIntoView();
  }, [anchor, slug]);

  if (!guide || !rendered) {
    return (
      <main className="page rf">
        <h1>Guide not found</h1>
        <p>
          <a href="#/docs">Back to all guides</a>
        </p>
      </main>
    );
  }
  const toc = rendered.headings.filter((h) => h.level >= 2 && h.level <= 3);
  const prev = guides[idx - 1];
  const next = guides[idx + 1];

  // Hash links inside the article: "#section" would clash with the hash router, so scroll manually.
  const onClick = (e: React.MouseEvent) => {
    const a = (e.target as HTMLElement).closest('a');
    const href = a?.getAttribute('href');
    if (href && href.startsWith('#') && !href.startsWith('#/')) {
      e.preventDefault();
      document.getElementById(href.slice(1))?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <main className="page rf rf-doc">
      <aside className="rf-toc" aria-label="On this page">
        <a href="#/docs">← All guides</a>
        <ul>
          {guides.map((g) => (
            <li key={g.slug}>
              <a href={`#/docs/${g.slug}`} aria-current={g.slug === slug ? 'page' : undefined}>
                {g.title}
              </a>
            </li>
          ))}
        </ul>
        {toc.length > 0 && (
          <>
            <h2 className="rf-toc-h">On this page</h2>
            <ul data-testid="toc">
              {toc.map((h) => (
                <li key={h.id} className={h.level === 3 ? 'sub' : ''}>
                  <a
                    href={`#${h.id}`}
                    onClick={(e) => {
                      e.preventDefault();
                      document.getElementById(h.id)?.scrollIntoView({ behavior: 'smooth' });
                    }}
                  >
                    {h.text}
                  </a>
                </li>
              ))}
            </ul>
          </>
        )}
      </aside>
      <article className="rf-article">
        <div
          className="prose"
          onClick={onClick}
          dangerouslySetInnerHTML={{ __html: rendered.html }}
          data-testid="article"
        />
        <nav className="rf-pn" aria-label="More guides">
          {prev ? <a href={`#/docs/${prev.slug}`}>← {prev.title}</a> : <span />}
          {next ? <a href={`#/docs/${next.slug}`}>{next.title} →</a> : <span />}
        </nav>
      </article>
    </main>
  );
}

export default function Docs() {
  const { path } = useRoute();
  const slug = path[1];
  return slug ? <Article slug={slug} /> : <Index />;
}
