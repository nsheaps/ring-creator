import * as THREE from 'three';

/**
 * A jewellery-photography studio used as the image-based light for every viewer.
 *
 * A mid-grey sweep (darker floor, lighter ceiling) surrounded by very bright, hard-edged softbox strips and a
 * few black flags. Polished metal picks up long bright highlights with dark edges (so yellow, white and rose
 * alloys read clearly), and flat facets each mirror either a strip (blazing white) or a flag (black): the
 * bright/dark mosaic that makes a cut stone read as a diamond instead of frosted glass.
 * Fully deterministic: no randomness, fixed layout.
 */
export function buildStudioScene(): THREE.Scene {
  const scene = new THREE.Scene();

  // ---- sweep: a sphere with a vertical gradient baked into vertex colours
  const sweepGeo = new THREE.SphereGeometry(60, 48, 24);
  const pos = sweepGeo.getAttribute('position');
  const colors: number[] = [];
  const floor = new THREE.Color(0.5, 0.5, 0.51);
  const horizon = new THREE.Color(0.9, 0.9, 0.91);
  const ceiling = new THREE.Color(1.3, 1.3, 1.31);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / 60; // -1..1
    if (y < 0) c.copy(horizon).lerp(floor, Math.min(1, -y * 1.6));
    else c.copy(horizon).lerp(ceiling, Math.pow(y, 0.8));
    colors.push(c.r, c.g, c.b);
  }
  sweepGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  scene.add(
    new THREE.Mesh(sweepGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })),
  );

  const panel = (
    w: number,
    h: number,
    intensity: number,
    at: [number, number, number],
    tint: [number, number, number] = [1, 1, 1],
  ): void => {
    const mat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    mat.color.setRGB(tint[0] * intensity, tint[1] * intensity, tint[2] * intensity);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.position.set(...at);
    m.lookAt(0, 0, 0);
    scene.add(m);
  };

  // overhead softboxes (two, with a dark gap: tables and top surfaces of metal glow but keep a dark stripe)
  panel(26, 6, 4, [0, 34, 10]);
  panel(26, 6, 4, [0, 34, -6]);
  panel(26, 4, 0, [0, 33, 2]);
  // tall strip lights around the subject (hard edges -> crisp facet flashes)
  panel(4, 34, 14, [-30, 6, 14]);
  panel(4, 34, 12, [30, 4, 10]);
  // a ring of narrow mid-height strips: scattered internal reflections find a light often enough to keep stones lively
  panel(1.6, 18, 9, [-34, 18, -4]);
  panel(1.6, 18, 9, [34, 20, -2]);
  panel(1.6, 16, 8, [-22, 22, 26]);
  panel(1.6, 16, 8, [24, 24, 22]);
  panel(1.6, 14, 7, [-12, 30, -22]);
  panel(1.6, 14, 7, [14, 30, -22]);
  // low rim strip behind (kept near the horizon so tables, which mirror the upper back, are not washed out)
  panel(36, 2, 6, [0, 1, -34], [0.94, 0.97, 1]);
  panel(30, 3, 9, [0, 14, 32]); // low horizontal front strip
  // small front kickers: pin-point sparkle in crown facets without a big bar reflected in the table
  panel(2, 3, 14, [8, 18, 30]);
  panel(2, 3, 14, [-10, 22, 28]);
  panel(2, 3, 12, [22, 26, 18]);
  panel(2, 3, 12, [-24, 28, 10]);
  // black flags between the lights (deep shadows in facets and metal)
  panel(5, 40, 0.15, [-28, 2, -10]);
  panel(5, 40, 0.15, [28, 2, -14]);
  panel(8, 30, 0.15, [0, 4, -32]);
  panel(5, 26, 0.15, [-22, 6, 24]);
  panel(5, 26, 0.15, [24, 6, 22]);
  return scene;
}

export function disposeStudioScene(scene: THREE.Scene): void {
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.geometry.dispose();
      const mat = m.material;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else mat.dispose();
    }
  });
}
