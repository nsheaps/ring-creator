import { useRef, useState } from 'react';
import type { Design } from '@/models/types';
import { navigate } from '@/router';
import { store, useStore, type SavedDesign } from '@/state/store';
import { ExportMenu } from '@/ui/builder/ExportMenu';
import { compareHref } from '@/ui/home/compareLinks';
import { summarize } from '@/ui/home/describe';
import { useThumbnail } from '@/ui/home/useThumbnail';
import { thumbnailFor } from '@/ui/thumbnails';
import './browse.css';

function isDesign(x: unknown): x is Design {
  const d = x as Partial<Design> | null;
  return (
    !!d &&
    typeof d === 'object' &&
    d.version === 1 &&
    typeof d.engagement === 'object' &&
    d.engagement !== null &&
    typeof d.name === 'string'
  );
}

function parseImport(text: string): Design[] {
  const v = JSON.parse(text) as unknown;
  const list = Array.isArray(v)
    ? v
    : v && typeof v === 'object' && 'designs' in v
      ? (v as { designs: unknown }).designs
      : [v];
  if (!Array.isArray(list)) return [];
  return list
    .map((x) => (x && typeof x === 'object' && 'design' in x ? (x as { design: unknown }).design : x))
    .filter(isDesign);
}

/**
 * The store has no rename/duplicate/import API, so these helpers drive load/update/save and then
 * restore the working design, leaving the builder's current ring unchanged.
 */
function withPreservedCurrent(fn: () => void): void {
  const prev = store.get().current;
  fn();
  store.load(prev, true);
}

function Item({ item, onNote }: { item: SavedDesign; onNote: (m: string) => void }) {
  const d = item.design;
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(d.name);
  const generated = useThumbnail(d, !item.thumb);
  const img = item.thumb || generated;
  const s = summarize(d);

  const rename = () => {
    const n = name.trim();
    setEditing(false);
    if (!n || n === d.name) return;
    withPreservedCurrent(() => {
      store.load(d, true);
      store.update((x) => {
        x.name = n;
      });
      store.save(item.thumb);
    });
  };
  const duplicate = () =>
    withPreservedCurrent(() => {
      store.load(d, false);
      store.update((x) => {
        x.name = `${d.name} copy`;
      });
      store.save(item.thumb);
      onNote(`Duplicated “${d.name}”.`);
    });
  const remove = () => {
    if (window.confirm(`Delete “${d.name}”? This cannot be undone.`)) {
      store.remove(d.id);
      onNote(`Deleted “${d.name}”.`);
    }
  };
  const open = () => {
    store.load(d, true);
    navigate('/build');
  };
  const exportOne = () => download(`${slug(d.name)}.json`, JSON.stringify(d, null, 2));

  return (
    <li className="card sv-item" data-testid="saved-item">
      <div className="sv-thumb">
        {img ? (
          <img src={img} alt={`Preview of ${d.name}`} width={300} height={225} />
        ) : (
          <span className="muted">◆</span>
        )}
      </div>
      <div className="sv-info">
        {editing ? (
          <form
            className="sv-rename"
            onSubmit={(e) => {
              e.preventDefault();
              rename();
            }}
          >
            <label>
              <span className="sr-only">Design name</span>
              <input
                type="text"
                value={name}
                autoFocus
                onChange={(e) => setName(e.target.value)}
                data-testid="saved-name-input"
              />
            </label>
            <button className="btn primary" type="submit">
              Save
            </button>
            <button
              className="btn ghost"
              type="button"
              onClick={() => {
                setName(d.name);
                setEditing(false);
              }}
            >
              Cancel
            </button>
          </form>
        ) : (
          <h2 className="sv-name">{d.name}</h2>
        )}
        <p className="muted">
          {s.stone}, {s.carat} · {s.head} · {s.metals}
          {d.band ? ' · with band' : ''}
        </p>
        <p className="muted sv-date">Updated {new Date(d.updatedAt).toLocaleString()}</p>
        <div className="sv-actions">
          <button className="btn primary" onClick={open} data-testid="saved-open">
            Open in builder
          </button>
          <button className="btn" onClick={() => setEditing(true)} data-testid="saved-rename">
            Rename
          </button>
          <button className="btn" onClick={duplicate} data-testid="saved-duplicate">
            Duplicate
          </button>
          <a className="btn" href={`#${compareHref([d.id])}`}>
            Compare
          </a>
          <button className="btn" onClick={exportOne}>
            Export JSON
          </button>
          <ExportMenu design={d} getRender={() => img} onDone={onNote} testId="saved-export" />
          <button className="btn ghost" onClick={remove} data-testid="saved-delete">
            Delete
          </button>
        </div>
      </div>
    </li>
  );
}

function slug(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'ring'
  );
}

function download(filename: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function Saved() {
  const { saved } = useStore();
  const [note, setNote] = useState('');
  const file = useRef<HTMLInputElement>(null);

  const importFile = async (f: File) => {
    try {
      const designs = parseImport(await f.text());
      if (designs.length === 0) {
        setNote('No ring designs found in that file.');
        return;
      }
      for (const d of designs) {
        const thumb = await thumbnailFor(d);
        withPreservedCurrent(() => {
          store.load(d, false);
          store.save(thumb);
        });
      }
      setNote(`Imported ${designs.length} design${designs.length === 1 ? '' : 's'}.`);
    } catch {
      setNote('That file is not valid JSON.');
    }
  };

  return (
    <main className="page" data-testid="saved">
      <div className="hm-row-head">
        <h1>Saved designs</h1>
        <div className="sv-toolbar">
          <button className="btn" onClick={() => file.current?.click()} data-testid="saved-import">
            Import JSON
          </button>
          <button
            className="btn"
            disabled={saved.length === 0}
            onClick={() =>
              download(
                'ring-creator-designs.json',
                JSON.stringify({ version: 1, designs: saved.map((s) => s.design) }, null, 2),
              )
            }
            data-testid="saved-export"
          >
            Export all
          </button>
          <input
            ref={file}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            tabIndex={-1}
            aria-label="Import designs from a JSON file"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void importFile(f);
            }}
          />
        </div>
      </div>
      <p className="muted" role="status" aria-live="polite">
        {note}
      </p>
      {saved.length === 0 ? (
        <div className="card" data-testid="saved-empty">
          <h2>No saved designs yet</h2>
          <p className="muted">
            Save a ring in the builder and it will show up here, stored only in this browser.
          </p>
          <p>
            <a className="btn primary" href="#/build">
              Start building
            </a>{' '}
            <a className="btn" href="#/gallery">
              Browse gallery
            </a>
          </p>
        </div>
      ) : (
        <ul className="sv-list" data-testid="saved-list">
          {saved.map((s) => (
            <Item key={s.design.id} item={s} onNote={setNote} />
          ))}
        </ul>
      )}
    </main>
  );
}
