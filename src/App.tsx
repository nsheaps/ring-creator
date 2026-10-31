import { lazy, Suspense, useEffect, useState } from 'react';
import { navigate, useRoute } from './router';

const Home = lazy(() => import('./pages/Home'));
const Builder = lazy(() => import('./pages/Builder'));
const Gallery = lazy(() => import('./pages/Gallery'));
const Saved = lazy(() => import('./pages/Saved'));
const Compare = lazy(() => import('./pages/Compare'));
const Components = lazy(() => import('./pages/Components'));
const Docs = lazy(() => import('./pages/Docs'));
const Shot = lazy(() => import('./pages/Shot'));

const NAV: [string, string][] = [
  ['build', 'Build'],
  ['gallery', 'Gallery'],
  ['saved', 'Saved'],
  ['components', 'Components'],
  ['docs', 'Guides'],
];

function useTheme() {
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    try {
      const t = localStorage.getItem('ring-creator:theme');
      if (t === 'light' || t === 'dark') return t;
    } catch {
      /* ignore */
    }
    return 'dark';
  });
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem('ring-creator:theme', theme);
    } catch {
      /* ignore */
    }
  }, [theme]);
  return [theme, () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))] as const;
}

export function App() {
  const route = useRoute();
  const [theme, toggle] = useTheme();
  const section = route.path[0] ?? '';

  if (section === 'shot') {
    return (
      <Suspense fallback={null}>
        <Shot />
      </Suspense>
    );
  }

  let page = <Home />;
  if (section === 'build') page = <Builder />;
  else if (section === 'gallery') page = <Gallery />;
  else if (section === 'saved') page = <Saved />;
  else if (section === 'compare') page = <Compare />;
  else if (section === 'components') page = <Components />;
  else if (section === 'docs') page = <Docs />;

  return (
    <>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <header className="topbar">
        <a className="brand" href="#/" onClick={() => navigate('/')}>
          <span className="brand-mark" aria-hidden="true">
            ◆
          </span>
          <span>Ring Creator</span>
        </a>
        <nav aria-label="Main">
          {NAV.map(([to, label]) => (
            <a key={to} href={`#/${to}`} aria-current={section === to ? 'page' : undefined}>
              {label}
            </a>
          ))}
        </nav>
        <button
          className="btn ghost"
          onClick={toggle}
          aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
        >
          {theme === 'dark' ? '☀' : '☾'}
        </button>
      </header>
      <div id="main" tabIndex={-1}>
        <Suspense fallback={<p className="page muted">Loading…</p>}>{page}</Suspense>
      </div>
      <footer className="footer">
        <span>Ring Creator · open source demo</span>
        <a href="https://github.com/nsheaps/ring-creator">GitHub</a>
      </footer>
    </>
  );
}
