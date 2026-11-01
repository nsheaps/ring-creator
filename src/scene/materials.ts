import * as THREE from 'three';
import type { ClarityModel, FinishModel, GemModel, MetalModel } from '@/models/types';

const cache = new Map<string, THREE.Material>();

/** Polished metal: pure specular PBR lit by the studio environment; finishes only add roughness. */
export function metalMaterial(metal: MetalModel, finish?: FinishModel): THREE.MeshPhysicalMaterial {
  const key = `m:${metal.id}:${finish?.id ?? 'p'}`;
  const hit = cache.get(key);
  if (hit) return hit as THREE.MeshPhysicalMaterial;
  const rough = Math.min(1, metal.roughness * 0.9 + (finish?.roughnessAdd ?? 0));
  const mat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(metal.color),
    metalness: metal.metalness,
    roughness: Math.max(0.1, rough),
    envMapIntensity: 1.5,
  });
  cache.set(key, mat);
  return mat;
}

/**
 * Pavilion pass shader (injected into a MeshStandardMaterial so it keeps three's environment plumbing).
 * Each back face of the convex stone stands for a pavilion facet seen through the crown: the view ray is reflected
 * off it (total internal reflection), scattered by a fixed per-facet offset (standing in for the extra bounces and
 * exit refraction of a real stone) and looked up in the studio environment once per colour channel, with the
 * channels split by the gem's dispersion (fire). The result is the bright/dark facet mosaic of a real cut stone,
 * coloured by the body colour raised to a path-length power (saturated, never milky).
 */
const GEM_PARS = /* glsl */ `
uniform vec3 gemBody;
uniform float gemScatter;
uniform float gemDispersion;
uniform float gemBrightness;
uniform float gemHaze;
uniform float gemContrast;
uniform float gemPath;
uniform float gemCrownLo;
uniform float gemGlow;
uniform float gemMosaic;
vec3 gemHash3(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx);
}
// 1 on a flat facet (normals constant across the triangle), 0 on a smoothly curved surface (cabochon dome)
float gemFlatness( vec3 n ) {
  return 1.0 - smoothstep( 0.0005, 0.004, length( fwidth( n ) ) );
}
`;

const PAVILION_MAIN = /* glsl */ `
#if defined( USE_ENVMAP ) && defined( ENVMAP_TYPE_CUBE_UV )
{
  // BackSide (FLIP_SIDED): vNormal points into the stone; nOut is the facet's outward normal, view space.
  vec3 nOut = -normalize( vNormal );
  vec3 I = normalize( -vViewPosition );
  vec3 nW = inverseTransformDirection( nOut, viewMatrix );
  vec3 IW = inverseTransformDirection( I, viewMatrix );
  vec3 r1 = reflect( IW, nW );
  // second internal bounce off the opposite pavilion facet (this facet mirrored about the stone's vertical axis, taken
  // as world up: settings hold the centre stone table-up): in a well cut stone light that hits one pavilion side
  // crosses to the other and leaves back up through the crown, so pavilion facets mirror the overhead lights.
  // Without it, big flat step-cut facets mirror the grey horizon as one dull slab.
  vec3 r2 = reflect( r1, vec3( -nW.x, nW.y, -nW.z ) );
  float facetFlat = gemFlatness( vNormal );
  // per-facet scatter: stable while the camera moves (the facet keeps its identity), so turning the ring scintillates
  vec3 h = gemHash3( floor( nW * 97.0 + 0.5 ) + vec3( 17.0, 3.0, 41.0 ) ) - 0.5;
  // most facets return light by the double bounce, a few by the single one (dark accents and contrast)
  float twoBounce = step( 0.22, gemHash3( floor( nW * 61.0 + 0.5 ) + vec3( 7.0, 13.0, 2.0 ) ).z );
  twoBounce *= step( 0.0, dot( r1, -vec3( -nW.x, nW.y, -nW.z ) ) ); // only when r1 actually heads for that facet
  vec3 rW = normalize( mix( r1, r2, twoBounce * facetFlat ) );
  float sc = gemScatter * facetFlat;
  vec3 d = normalize( rW + sc * h + vec3( 0.0, 0.3 * sc, 0.0 ) );
  // light that leaves a well cut stone mostly came from above: fold most downward rays back up
  d.y = mix( d.y, abs( d.y ), 0.7 * facetFlat );
  d = normalize( d );
  vec3 side = normalize( cross( d, nW ) + vec3( 1e-4 ) );
  vec3 dR = normalize( d + gemDispersion * side );
  vec3 dB = normalize( d - gemDispersion * side );
  float rough = 0.015 + gemHaze * 0.5 + ( 1.0 - facetFlat ) * 0.18;
  vec3 env;
  env.r = textureCubeUV( envMap, envMapRotation * dR, rough ).r;
  env.g = textureCubeUV( envMap, envMapRotation * d, rough ).g;
  env.b = textureCubeUV( envMap, envMapRotation * dB, rough ).b;
  // fire shows as coloured fringes, not whole coloured slabs on big step facets
  env = mix( vec3( dot( env, vec3( 0.3333 ) ) ), env, 0.8 );
  // contrast: facets that see only the grey sweep go dark, facets that catch a light stay blazing
  float lum = dot( env, vec3( 0.2126, 0.7152, 0.0722 ) );
  env *= mix( 1.0, smoothstep( 0.32, 1.6, lum ), gemContrast ) * gemBrightness;
  // hall of mirrors: a big flat facet mirrors one patch of the studio, which is mostly the even grey sweep. Push each
  // facet towards a bright flash or a dark reflection (biased by what it actually sees), so step cuts show crisp
  // alternating bands instead of a uniform grey slab.
  // the cells of the reflected direction cut each facet into the mirrored images of the other steps (they move as the
  // ring turns); the axis-aligned cells give straight bands parallel to the girdle on a table-up stone
  float tone = gemHash3( floor( nW * 53.0 + 0.5 ) + floor( d * 9.0 ) * 3.0 + vec3( 23.0, 5.0, 9.0 ) ).y;
  float flash = smoothstep( 0.45, 0.55, tone * 0.8 + min( lum, 1.0 ) * 0.2 );
  vec3 darkTone = min( env * 0.1, vec3( 0.04 ) );
  vec3 flashTone = max( env * 1.6, vec3( 0.8 * gemBrightness ) );
  env = mix( env, mix( darkTone, flashTone, flash ), gemMosaic * facetFlat );
  vec3 body = pow( max( gemBody, vec3( 1e-3 ) ), vec3( gemPath ) );
  vec3 col = env * body;
  // a little body colour glow even in dark facets so coloured stones never go grey
  col += body * 0.12;
  col = mix( col, vec3( dot( col, vec3( 0.333 ) ) ) * 0.75 + 0.1, gemHaze * 0.6 );
  // translucent stones (opal): a milky glowing body with soft spectral patches (play of colour)
  if ( gemGlow > 0.0 ) {
    vec3 wp = ( vec4( -vViewPosition, 0.0 ) * viewMatrix ).xyz + cameraPosition;
    vec3 q = gemHash3( floor( wp * 0.9 + nW * 0.8 ) );
    vec3 poc = 0.5 + 0.5 * cos( 6.2832 * ( q.x + vec3( 0.0, 0.33, 0.67 ) ) );
    col = mix( col, body * 0.8 + poc * 0.6 * smoothstep( 0.3, 1.0, q.y ), gemGlow );
  }
  outgoingLight = col;
}
#endif
#include <opaque_fragment>
`;

/**
 * Crown pass: the surface reflection is ADDED (rgb) while alpha darkens what the pavilion pass drew behind each crown
 * facet by a fixed per-facet factor. Every crown facet therefore shows its own version of the pavilion behind it,
 * which multiplies the visible facet pattern the way refraction through a real crown does.
 */
const CROWN_MAIN = /* glsl */ `
{
  vec3 nW = inverseTransformDirection( normalize( vNormal ), viewMatrix );
  float facetFlat = gemFlatness( vNormal );
  float m = gemHash3( floor( nW * 97.0 + 0.5 ) + vec3( 5.0, 29.0, 11.0 ) ).x;
  // dark-leaning distribution: most facets pass the light, some go dim (the black accents of a well cut stone)
  float mask = mix( 1.0, mix( gemCrownLo, 1.0, smoothstep( 0.0, 0.7, m ) ), facetFlat );
  // a facet seen nearly face-on (the table of a face-up stone) refracts straight through: it never goes dim
  float faceOn = abs( dot( normalize( vNormal ), normalize( vViewPosition ) ) );
  mask = mix( mask, 1.0, smoothstep( 0.8, 0.96, faceOn ) );
  // the table (level, settings hold the centre stone table-up) is one big window: never dimmed as a whole
  mask = mix( mask, 1.0, smoothstep( 0.985, 0.998, nW.y ) );
  // flat facets: suppress reflections of the grey sweep so the crown shows crisp light flashes, not a milky film;
  // curved (cabochon) surfaces: softer window reflections
  float lum = dot( outgoingLight, vec3( 0.2126, 0.7152, 0.0722 ) );
  vec3 refl = outgoingLight * mix( 0.55, smoothstep( 0.2, 0.8, lum ), facetFlat );
  gl_FragColor = vec4( refl, mask );
}
`;

interface GemUniforms {
  gemBody: { value: THREE.Color };
  gemScatter: { value: number };
  gemDispersion: { value: number };
  gemBrightness: { value: number };
  gemHaze: { value: number };
  gemContrast: { value: number };
  gemPath: { value: number };
  gemCrownLo: { value: number };
  gemGlow: { value: number };
  gemMosaic: { value: number };
}

function pavilionMaterial(u: GemUniforms): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({
    color: u.gemBody.value,
    metalness: 1,
    roughness: 0.05,
    side: THREE.BackSide,
  });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${GEM_PARS}`)
      .replace('#include <opaque_fragment>', PAVILION_MAIN);
  };
  mat.customProgramCacheKey = () => 'gem-pavilion-v3';
  return mat;
}

function crownMaterial(gem: GemModel, haze: number, u: GemUniforms): THREE.MeshPhysicalMaterial {
  const mat = new THREE.MeshPhysicalMaterial({
    color: '#000000',
    metalness: 0,
    roughness: 0.02 + haze * 0.1,
    ior: Math.min(2.33, gem.ior),
    specularIntensity: 1,
    specularColor: new THREE.Color('#ffffff'),
    envMapIntensity: 0.6,
    transparent: true,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.SrcAlphaFactor,
    // keep the canvas alpha untouched (the viewer composites over the page)
    blendSrcAlpha: THREE.ZeroFactor,
    blendDstAlpha: THREE.OneFactor,
    depthWrite: false,
    side: THREE.FrontSide,
  });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${GEM_PARS}`)
      .replace('#include <opaque_fragment>', CROWN_MAIN);
  };
  mat.customProgramCacheKey = () => 'gem-crown-v3';
  return mat;
}

/**
 * Two shells drawn with the same geometry. Returns [outer, inner]:
 *  - inner (BackSide, drawn first): the pavilion light return (see PAVILION_MAIN), opaque.
 *  - outer (FrontSide, additive): the crown's surface reflection and specular glints, Fresnel-weighted by the gem's IOR,
 *    added on top so it never greys the stone out.
 * Opaque gems (pearl, onyx) get a solid glossy body instead.
 */
export function gemMaterials(
  gem: GemModel,
  colorHex: string,
  clarity?: ClarityModel,
  tintHex?: string,
  tintStrength = 0,
): [THREE.MeshPhysicalMaterial, THREE.MeshStandardMaterial] {
  const key = `g:${gem.id}:${colorHex}:${clarity?.id ?? ''}:${tintHex ?? ''}:${tintStrength}`;
  const hit = cache.get(key) as THREE.MeshPhysicalMaterial | undefined;
  const hit2 = cache.get(key + ':in') as THREE.MeshStandardMaterial | undefined;
  if (hit && hit2) return [hit, hit2];
  const base = new THREE.Color(colorHex);
  if (tintHex && tintStrength > 0) base.lerp(new THREE.Color(tintHex), tintStrength);
  const haze = clarity?.haze ?? 0;
  let outer: THREE.MeshPhysicalMaterial;
  let inner: THREE.MeshStandardMaterial;

  if (gem.transparency === 'opaque') {
    outer = new THREE.MeshPhysicalMaterial({
      color: base,
      metalness: 0,
      roughness: 0.32,
      clearcoat: 1,
      clearcoatRoughness: 0.03,
      sheen: gem.id === 'pearl' ? 1 : 0,
      sheenColor: new THREE.Color('#ffe9f2'),
      sheenRoughness: 0.4,
      iridescence: gem.id === 'pearl' ? 0.35 : 0,
      envMapIntensity: 1.2,
    });
    inner = new THREE.MeshStandardMaterial({ color: base, roughness: 0.4, side: THREE.BackSide });
  } else {
    const hsl = { h: 0, s: 0, l: 0 };
    base.getHSL(hsl);
    const colourless = hsl.s < 0.12 || hsl.l > 0.9;
    const translucent = gem.transparency === 'translucent';
    // high-index stones (diamond, moissanite, zircon) return more light and break it into finer, harder flashes
    const ri = THREE.MathUtils.clamp((gem.ior - 1.5) / 0.95, 0, 1);
    const body = base.clone();
    const pastel = hsl.l > 0.72;
    if (pastel) body.lerp(new THREE.Color('#ffffff'), 0.2);
    else if (!colourless) {
      // deepen coloured gems: light travels through the body twice (capped so blues stay inky, not electric)
      body.getHSL(hsl);
      body.setHSL(hsl.h, Math.min(0.78, hsl.s * 1.1 + 0.02), hsl.l);
    }
    const uniforms: GemUniforms = {
      gemBody: { value: body },
      gemScatter: { value: 0.75 + 0.55 * ri + (translucent ? 0.5 : 0) },
      // coloured stones: their body colour masks fire, and split channels would tint facets off-hue
      gemDispersion: { value: Math.min(0.07, gem.dispersion * 0.6) * (colourless ? 1 : 0.3) },
      gemBrightness: { value: colourless ? 1.5 + 0.4 * ri : 1.8 },
      gemHaze: { value: Math.min(1, haze + (translucent ? 0.55 : 0)) },
      gemContrast: { value: colourless ? 0.9 : 0.55 },
      // light travels the body twice: deeper colour for saturated gems, a gentle deepening for pastels and tints
      gemPath: { value: colourless ? 1.4 : pastel ? 1.1 : 1.6 },
      gemCrownLo: { value: colourless ? 0.3 : 0.5 },
      gemGlow: { value: translucent ? 0.75 : 0 },
      gemMosaic: { value: translucent ? 0 : colourless ? 0.9 : 0.6 },
    };
    inner = pavilionMaterial(uniforms);
    outer = crownMaterial(gem, haze, uniforms);
  }
  cache.set(key, outer);
  cache.set(key + ':in', inner);
  return [outer, inner];
}

export function disposeMaterialCache(): void {
  cache.forEach((m) => m.dispose());
  cache.clear();
}
