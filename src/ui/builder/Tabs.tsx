import { useRef, type ReactNode } from 'react';

export interface TabDef {
  id: string;
  label: string;
}

export function StepTabs({
  tabs,
  active,
  onChange,
  children,
}: {
  tabs: TabDef[];
  active: string;
  onChange: (id: string) => void;
  children: ReactNode;
}) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const move = (i: number) => {
    const t = tabs[(i + tabs.length) % tabs.length];
    onChange(t.id);
    refs.current[t.id]?.focus();
  };
  return (
    <div className="bd-panel">
      <div className="bd-tabs" role="tablist" aria-label="Design steps">
        {tabs.map((t, i) => (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[t.id] = el;
            }}
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={active === t.id}
            aria-controls="step-panel"
            tabIndex={active === t.id ? 0 : -1}
            data-testid={`step-${t.id}`}
            onClick={() => onChange(t.id)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight') {
                e.preventDefault();
                move(i + 1);
              } else if (e.key === 'ArrowLeft') {
                e.preventDefault();
                move(i - 1);
              } else if (e.key === 'Home') {
                e.preventDefault();
                move(0);
              } else if (e.key === 'End') {
                e.preventDefault();
                move(tabs.length - 1);
              }
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div id="step-panel" role="tabpanel" aria-labelledby={`tab-${active}`} className="bd-step">
        {children}
      </div>
    </div>
  );
}
