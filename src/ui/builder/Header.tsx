import { useRef, type ReactNode } from 'react';
import type { Design } from '@/models/types';

export function BuilderHeader({
  design,
  onName,
  onSave,
  onShare,
  onExport,
  onImport,
  onReset,
  onCompare,
  children,
}: {
  design: Design;
  onName: (n: string) => void;
  onSave: () => void;
  onShare: () => void;
  onExport: () => void;
  onImport: (file: File) => void;
  onReset: () => void;
  onCompare: () => void;
  /** Extra actions (e.g. the Export menu), shown after Import. */
  children?: ReactNode;
}) {
  const file = useRef<HTMLInputElement>(null);
  return (
    <header className="bd-header">
      <label className="bd-name">
        <span className="bd-label">Design name</span>
        <input
          type="text"
          data-testid="input-name"
          value={design.name}
          maxLength={80}
          onChange={(e) => onName(e.target.value)}
        />
      </label>
      <div className="bd-actions">
        <button type="button" className="btn primary" data-testid="btn-save" onClick={onSave}>
          Save
        </button>
        <button type="button" className="btn" data-testid="btn-share" onClick={onShare}>
          Share
        </button>
        <button type="button" className="btn" data-testid="btn-export" onClick={onExport}>
          Export JSON
        </button>
        <button type="button" className="btn" data-testid="btn-import" onClick={() => file.current?.click()}>
          Import JSON
        </button>
        <input
          ref={file}
          type="file"
          accept="application/json,.json"
          hidden
          aria-label="Import design JSON file"
          data-testid="input-import"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onImport(f);
            e.target.value = '';
          }}
        />
        {children}
        <button type="button" className="btn ghost" data-testid="btn-compare" onClick={onCompare}>
          Open in Compare
        </button>
        <button type="button" className="btn ghost" data-testid="btn-reset" onClick={onReset}>
          Reset
        </button>
      </div>
    </header>
  );
}
