import { useCallback, useEffect, useRef, useState } from 'react';
import { navigate, useRoute } from '@/router';
import { decodeDesign, encodeDesign, store, useStore } from '@/state/store';
import type { DesignViewerHandle } from '@/ui/DesignViewer';
import { BuilderHeader } from '@/ui/builder/Header';
import { ExportMenu } from '@/ui/builder/ExportMenu';
import { StepTabs } from '@/ui/builder/Tabs';
import { Viewport } from '@/ui/builder/Viewport';
import { StoneStep } from '@/ui/builder/StoneStep';
import { HeadStep } from '@/ui/builder/HeadStep';
import { ShankStep } from '@/ui/builder/ShankStep';
import { MetalsStep } from '@/ui/builder/MetalsStep';
import { AccentsStep } from '@/ui/builder/AccentsStep';
import { BandStep } from '@/ui/builder/BandStep';
import { FitStep } from '@/ui/builder/FitStep';
import { download, downloadJson, parseDesign, shrink, slug } from '@/ui/builder/io';
import type { Update } from '@/ui/builder/common';
import './builder.css';

const TABS = [
  { id: 'stone', label: 'Stone' },
  { id: 'head', label: 'Head' },
  { id: 'shank', label: 'Shank' },
  { id: 'metals', label: 'Metals' },
  { id: 'accents', label: 'Accents' },
  { id: 'band', label: 'Band' },
  { id: 'fit', label: 'Fit' },
];

export default function Builder() {
  const { current: design } = useStore();
  const route = useRoute();
  const viewer = useRef<DesignViewerHandle>(null);
  const [step, setStep] = useState('stone');
  const [toast, setToast] = useState('');
  const timer = useRef<number | undefined>(undefined);
  const loaded = useRef('');

  const say = useCallback((msg: string) => {
    setToast(msg);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setToast(''), 6000);
  }, []);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  // Route handling: '#/build?d=<payload>' loads once; '#/build/:id' opens a saved design.
  const shared = route.query.get('d');
  const routeId = route.path[1];
  useEffect(() => {
    const key = shared ? `d:${shared}` : routeId ? `id:${routeId}` : '';
    if (!key || loaded.current === key) return;
    loaded.current = key;
    if (shared) {
      const d = decodeDesign(shared);
      if (d) {
        store.load(d);
        say('Loaded the shared design.');
      } else say('That share link could not be read, so your current design is unchanged.');
    } else if (routeId) {
      const s = store.get().saved.find((x) => x.design.id === routeId);
      if (s) store.load(s.design, true);
      else if (store.get().current.id !== routeId)
        say('Saved design not found; showing your current design.');
    }
  }, [shared, routeId, say]);

  const update: Update = useCallback((fn) => store.update(fn), []);

  const onSave = async () => {
    const thumb = await shrink(viewer.current?.snapshot() ?? '');
    store.save(thumb);
    say(`Saved “${store.get().current.name}”.`);
  };
  const onShare = async () => {
    const url = `${window.location.origin}${window.location.pathname}#/build?d=${encodeDesign(store.get().current)}`;
    try {
      await navigator.clipboard.writeText(url);
      say('Share link copied to the clipboard.');
    } catch {
      say(`Copy this link to share: ${url}`);
    }
  };
  const onImport = async (file: File) => {
    const d = parseDesign(await file.text());
    if (!d) return say('That file is not a Ring Creator design.');
    store.load(d);
    say(`Imported “${d.name}”.`);
  };

  return (
    <main className="page bd-page" data-testid="builder">
      <h1 className="sr-only">Ring builder</h1>
      <BuilderHeader
        design={design}
        onName={(n) => update((d) => void (d.name = n))}
        onSave={onSave}
        onShare={onShare}
        onExport={() => downloadJson(design)}
        onImport={onImport}
        onReset={() => {
          store.reset();
          say('Reset to the default ring.');
        }}
        onCompare={() => navigate(`/compare?d=${encodeDesign(design)}`)}
      >
        <ExportMenu design={design} getRender={() => viewer.current?.snapshot() ?? ''} onDone={say} />
      </BuilderHeader>
      <div className="bd-layout">
        <Viewport
          design={design}
          viewerRef={viewer}
          onSnapshotDownload={(url) => download(`${slug(design.name)}.png`, url)}
        />
        <StepTabs tabs={TABS} active={step} onChange={setStep}>
          {step === 'stone' && <StoneStep design={design} update={update} />}
          {step === 'head' && <HeadStep design={design} update={update} />}
          {step === 'shank' && <ShankStep design={design} update={update} />}
          {step === 'metals' && <MetalsStep design={design} update={update} />}
          {step === 'accents' && <AccentsStep design={design} update={update} />}
          {step === 'band' && <BandStep design={design} update={update} />}
          {step === 'fit' && <FitStep design={design} update={update} />}
        </StepTabs>
      </div>
      <div className="bd-toast" role="status" aria-live="polite" data-testid="toast">
        {toast}
      </div>
    </main>
  );
}
