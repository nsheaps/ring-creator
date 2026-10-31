import { useEffect, useRef, useState } from 'react';
import type { Design } from '@/models/types';
import type { ExportScope } from '@/export/collect';
import { EXPORT_FORMATS, type ExportFormat } from '@/export/formats';
import './exportMenu.css';

const SCOPES: { id: ExportScope; label: string }[] = [
  { id: 'engagement', label: 'Engagement ring' },
  { id: 'band', label: 'Band' },
  { id: 'set', label: 'Set' },
];

function save(name: string, mime: string, data: Uint8Array | string): void {
  const blob = new Blob([data], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/**
 * "Export" drop-down: pick engagement / band / set, then a format. The export module (jsPDF, fflate,
 * GLTFExporter) is imported on demand.
 */
export function ExportMenu({
  design,
  getRender,
  onDone,
  testId = 'btn-export-menu',
}: {
  design: Design;
  /** Returns a PNG/JPEG data URL of the current view for the PDF and pack (optional). */
  getRender?: () => string;
  onDone?: (message: string) => void;
  testId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<ExportScope>(design.band ? 'set' : 'engagement');
  const [busy, setBusy] = useState<ExportFormat | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const effective: ExportScope = design.band ? scope : 'engagement';

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const run = async (format: ExportFormat) => {
    setBusy(format);
    try {
      const { exportFile } = await import('@/export');
      const render = getRender?.() ?? '';
      const file = await exportFile(design, format, effective, { renderDataUrl: render || undefined });
      save(file.name, file.mime, file.data);
      onDone?.(`Exported ${file.name}.`);
      setOpen(false);
    } catch (e) {
      onDone?.(`Export failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="xm" ref={root}>
      <button
        type="button"
        className="btn"
        aria-haspopup="true"
        aria-expanded={open}
        data-testid={testId}
        onClick={() => setOpen((o) => !o)}
      >
        Export ▾
      </button>
      {open && (
        <div className="xm-panel" role="group" aria-label="Export">
          <fieldset className="xm-scope">
            <legend>What to export</legend>
            {SCOPES.map((s) => (
              <label key={s.id}>
                <input
                  type="radio"
                  name="xm-scope"
                  value={s.id}
                  checked={effective === s.id}
                  disabled={!design.band && s.id !== 'engagement'}
                  onChange={() => setScope(s.id)}
                />
                {s.label}
              </label>
            ))}
          </fieldset>
          <ul className="xm-list">
            {EXPORT_FORMATS.map((f) => (
              <li key={f.id}>
                <button
                  type="button"
                  className="xm-item"
                  data-testid={`export-${f.id}`}
                  disabled={busy !== null}
                  onClick={() => void run(f.id)}
                >
                  <span className="xm-label">{busy === f.id ? 'Preparing…' : f.label}</span>
                  <span className="xm-help">{f.help}</span>
                </button>
              </li>
            ))}
          </ul>
          <p className="xm-note">Weights and carats are estimates from the 3D model.</p>
        </div>
      )}
    </div>
  );
}
