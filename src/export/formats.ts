/** Export formats and scopes. Dependency-free so the UI can import it without loading the exporters. */
export type ExportFormat = 'glb' | 'stl' | 'obj' | 'json' | 'csv' | 'svg' | 'pdf' | 'zip';

export const EXPORT_FORMATS: { id: ExportFormat; label: string; help: string }[] = [
  { id: 'zip', label: 'Jeweler pack (ZIP)', help: 'Everything below in one archive' },
  { id: 'pdf', label: 'Spec sheet (PDF)', help: 'Summary, BOM, drawing, jeweler notes' },
  { id: 'svg', label: 'Technical drawing (SVG)', help: 'Front, side, top with dimensions' },
  { id: 'csv', label: 'Bill of materials (CSV)', help: 'Metal weights and stone list' },
  { id: 'stl', label: 'Casting model (STL)', help: 'Metal only, millimetres' },
  { id: 'glb', label: '3D model (GLB)', help: 'Materials named by metal and gem' },
  { id: 'obj', label: '3D model (OBJ + MTL)', help: 'Zipped with its material file' },
  { id: 'json', label: 'Design file (JSON)', help: 'Re-open in Ring Creator' },
];
