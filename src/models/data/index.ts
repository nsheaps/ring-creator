import { registerModels } from '../registry';
import { metals } from './metals';
import { finishes } from './finishes';
import { gems } from './gems';
import { clarities } from './clarities';
import { colorGrades } from './colorGrades';
import { cuts } from './cuts';
import { heads } from './heads';
import { shanks } from './shanks';
import { bands } from './bands';
import '@/geometry';

let done = false;
/** Idempotent: registers every model once. */
export function loadModels(): void {
  if (done) return;
  done = true;
  registerModels([
    ...metals,
    ...finishes,
    ...gems,
    ...clarities,
    ...colorGrades,
    ...cuts,
    ...heads,
    ...shanks,
    ...bands,
  ]);
}
loadModels();
