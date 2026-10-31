import '@/models/data';
import { useRoute } from '@/router';
import { findModel } from '@/models/registry';
import type { ModelKind } from '@/models/types';
import { ComponentDetail } from '@/ui/components/ComponentDetail';
import { ComponentsIndex } from '@/ui/components/ComponentsIndex';
import { KINDS } from '@/ui/components/specs';
import './reference.css';

export default function Components() {
  const { path } = useRoute();
  const kind = path[1] as ModelKind | undefined;
  const id = path[2];
  if (kind && !KINDS.includes(kind)) {
    return (
      <main className="page rf">
        <h1>Not found</h1>
        <p>
          Unknown component kind “{kind}”. <a href="#/components">See all components</a>.
        </p>
      </main>
    );
  }
  if (kind && id) {
    // findModel is only used to key the detail so it resets when switching items
    return <ComponentDetail key={`${kind}/${id}/${findModel(kind, id) ? 1 : 0}`} kind={kind} id={id} />;
  }
  return <ComponentsIndex key={kind ?? 'all'} only={kind} />;
}
