import * as THREE from 'three';
import type { ClarityModel, FinishModel, GemModel, MetalModel } from '@/models/types';
import { gemColorFlashes } from '@/models/data/gems';

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
uniform float gemStep;
uniform float gemLift;
uniform vec3 gemBody2;
uniform float gemFlashMix;
uniform float gemDarkFloor;
uniform float gemSpeckleAmt;
uniform float gemSelf;
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

/**
 * Light return of one pavilion facet (outward world normal `nW`) for the view ray `IW` (camera to fragment), see
 * the pavilion pass. Declared just before main(), after three's environment-map helpers. `wp` is the world position
 * (inclusion speckles, opal patches).
 */
const GEM_FUNCS = /* glsl */ `
// deterministic inclusion speckle (salt-and-pepper diamonds): in each cell of a 3D lattice, a dark disc of hashed
// size; only some cells hold one. Returns 0 (clear) .. 1 (inside an inclusion).
float gemSpeck( vec3 p ) {
  vec3 c = floor( p );
  vec3 h = gemHash3( c + vec3( 3.0, 71.0, 19.0 ) );
  vec3 at = c + 0.3 + 0.4 * h;
  float r = mix( 0.08, 0.3, gemHash3( c + vec3( 41.0, 7.0, 53.0 ) ).x );
  float on = step( 0.45, h.z );
  return on * ( 1.0 - smoothstep( r * 0.55, r, length( p - at ) ) );
}
float gemSpeckle( vec3 wp ) {
  // two scales: a few larger dark clouds and finer pepper
  return clamp( gemSpeck( wp * 0.7 ) * 0.7 + gemSpeck( wp * 2.6 + 17.0 ) * 0.8 + gemSpeck( wp * 6.0 + 5.0 ) * 0.5, 0.0, 1.0 );
}
#if defined( USE_ENVMAP ) && defined( ENVMAP_TYPE_CUBE_UV )
vec3 gemPavilionReturn( vec3 nW, vec3 IW, float facetFlat, vec3 wp ) {
  vec3 r1 = reflect( IW, nW );
  // second internal bounce off the opposite pavilion facet (this facet mirrored about the stone's vertical axis, taken
  // as world up: settings hold the centre stone table-up): in a well cut stone light that hits one pavilion side
  // crosses to the other and leaves back up through the crown, so pavilion facets mirror the overhead lights.
  // Without it, big flat step-cut facets mirror the grey horizon as one dull slab.
  vec3 r2 = reflect( r1, vec3( -nW.x, nW.y, -nW.z ) );
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
  // smooth (not cell-hashed) variation: hard cells of the reflected direction read as a blocky black maze
  float tone = gemHash3( floor( nW * 53.0 + 0.5 ) + vec3( 23.0, 5.0, 9.0 ) ).y;
  tone = 0.7 * tone + 0.3 * ( 0.5 + 0.5 * sin( 7.0 * dot( d, vec3( 1.0, 1.7, 1.3 ) ) + 6.0 * tone ) );
  float flash = smoothstep( 0.3, 0.7, tone * 0.8 + min( lum, 1.0 ) * 0.2 );
  // step cuts: facets of one row share a slope (|nW.y|), so alternate whole rows bright / dark: crisp parallel bands
  float rowKey = floor( abs( nW.y ) * 14.0 + 0.5 );
  float rowBand = mod( rowKey, 2.0 );
  flash = mix( flash, rowBand, gemStep * facetFlat );
  vec3 darkTone = env * mix( 0.2, 0.16, gemStep ) * gemDarkFloor;
  vec3 flashTone = max( env * 1.6, vec3( mix( 0.8, 1.0, gemStep ) * gemBrightness ) );
  env = mix( env, mix( darkTone, flashTone, flash ), gemMosaic * facetFlat );
  // parti / bi-colour stones: some facets return the secondary colour (teal flashes in a green sapphire)
  float alt = gemFlashMix * smoothstep( 0.72, 0.9, gemHash3( floor( nW * 43.0 + 0.5 ) + vec3( 11.0, 37.0, 5.0 ) ).x );
  vec3 bodyHex = mix( gemBody, gemBody2, alt );
  vec3 body = pow( max( bodyHex, vec3( 1e-3 ) ), vec3( gemPath ) );
  vec3 col = env * body;
  // a little body colour glow even in dark facets so coloured stones never go grey (and dark stones never go black)
  col += body * gemLift;
  col = mix( col, vec3( dot( col, vec3( 0.333 ) ) ) * 0.75 + 0.1, gemHaze * 0.6 );
  // salt-and-pepper: dark mineral inclusions scattered through a translucent grey body
  col *= 1.0 - 0.75 * gemSpeckleAmt * gemSpeckle( wp );
  // translucent stones (opal): a milky glowing body with soft spectral patches (play of colour)
  if ( gemGlow > 0.0 ) {
    vec3 q = gemHash3( floor( wp * 0.9 + nW * 0.8 ) );
    vec3 poc = 0.5 + 0.5 * cos( 6.2832 * ( q.x + vec3( 0.0, 0.33, 0.67 ) ) );
    col = mix( col, body * 0.8 + poc * 0.6 * smoothstep( 0.3, 1.0, q.y ), gemGlow );
  }
  return col;
}
#endif
`;

const PAVILION_MAIN = /* glsl */ `
#if defined( USE_ENVMAP ) && defined( ENVMAP_TYPE_CUBE_UV )
{
  // BackSide (FLIP_SIDED): vNormal points into the stone; nOut is the facet's outward normal, view space.
  vec3 nOut = -normalize( vNormal );
  vec3 nW = inverseTransformDirection( nOut, viewMatrix );
  vec3 IW = inverseTransformDirection( normalize( -vViewPosition ), viewMatrix );
  vec3 wp = ( vec4( -vViewPosition, 0.0 ) * viewMatrix ).xyz + cameraPosition;
  outgoingLight = gemPavilionReturn( nW, IW, gemFlatness( vNormal ), wp );
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
  // step cuts: crown rows alternate clear / dim instead of random per facet
  float crownBand = mod( floor( abs( nW.y ) * 14.0 + 0.5 ), 2.0 );
  mask = mix( mask, mix( gemCrownLo, 1.0, crownBand ), gemStep * facetFlat );
  // a facet seen nearly face-on (the table of a face-up stone) refracts straight through: it never goes dim
  float faceOn = abs( dot( normalize( vNormal ), normalize( vViewPosition ) ) );
  mask = mix( mask, 1.0, smoothstep( 0.8, 0.96, faceOn ) );
  // the table (level, settings hold the centre stone table-up) is one big window: never dimmed as a whole
  mask = mix( mask, 1.0, smoothstep( 0.985, 0.998, nW.y ) );
  // flat facets: suppress reflections of the grey sweep so the crown shows crisp light flashes, not a milky film;
  // curved (cabochon) surfaces: softer window reflections
  float lum = dot( outgoingLight, vec3( 0.2126, 0.7152, 0.0722 ) );
  vec3 refl = outgoingLight * mix( 0.55, smoothstep( 0.2, 0.8, lum ), facetFlat );
  vec3 wp = ( vec4( -vViewPosition, 0.0 ) * viewMatrix ).xyz + cameraPosition;
  // salt-and-pepper: a second layer of inclusions just under the crown (depth against the speckles at the back)
  mask *= 1.0 - 0.7 * gemSpeckleAmt * gemSpeckle( wp );
  vec3 self = vec3( 0.0 );
#if defined( USE_ENVMAP ) && defined( ENVMAP_TYPE_CUBE_UV )
  if ( gemSelf > 0.0 ) {
    // self-lit crown (accent and pave stones): their pavilions sit inside the seat metal, so the pavilion pass loses
    // the depth test there and this pass would tint the metal behind. Instead the crown traces its own virtual
    // pavilion facet: the crown facet mirrored through the girdle and tilted to a hashed azimuth (per facet, so each
    // crown facet flashes on its own), then the same light return.
    vec3 hc = gemHash3( floor( nW * 97.0 + 0.5 ) + vec3( 31.0, 2.0, 17.0 ) );
    float az = 6.2832 * hc.x;
    vec3 nP = normalize( vec3( nW.x, -abs( nW.y ) - 0.4, nW.z ) + ( 0.7 + 0.4 * hc.y ) * vec3( cos( az ), 0.0, sin( az ) ) );
    vec3 IW = inverseTransformDirection( normalize( -vViewPosition ), viewMatrix );
    self = gemSelf * mask * gemPavilionReturn( nP, IW, facetFlat, wp );
  }
#endif
  gl_FragColor = vec4( refl + self, mask * ( 1.0 - gemSelf ) );
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
  gemStep: { value: number };
  gemLift: { value: number };
  gemBody2: { value: THREE.Color };
  gemFlashMix: { value: number };
  gemDarkFloor: { value: number };
  gemSpeckleAmt: { value: number };
  gemSelf: { value: number };
}

/** Plain shading parameters of a faceted (non-opaque) gem; `gemMaterials` turns them into shader uniforms. */
export interface GemShade {
  /** body colour fed to the shader (before the path-length power) */
  body: THREE.Color;
  /** 0 for normal stones, up to 1 for very dark ones (black diamond, black spinel, smoky, inky sapphire) */
  darkness: number;
  scatter: number;
  dispersion: number;
  brightness: number;
  haze: number;
  contrast: number;
  path: number;
  crownLo: number;
  glow: number;
  mosaic: number;
  step: number;
  lift: number;
  /** environment strength of the crown's surface reflection (specular glints) */
  crownEnv: number;
  /** secondary body colour some facets show (parti / bi-colour stones); equals `body` for one-colour stones */
  body2: THREE.Color;
  /** 0..1: how strongly the facets that draw the secondary colour show it */
  flashMix: number;
  /** multiplier on the dark tone of the facet mosaic (1 normal; translucent grey stones keep their dark facets lighter) */
  darkFloor: number;
  /** 0..1: dark mineral inclusions (salt-and-pepper diamond) */
  speckle: number;
  /** 0..1: the crown traces its own pavilion instead of showing what was drawn behind it (accent and pave stones) */
  self: number;
}

/** Gem colour ids that render with inclusion speckles. */
export const SPECKLED_COLORS = new Set(['salt-and-pepper']);

/** sRGB lightness the body colour of a fully dark stone is raised to: dark stones read as smoky grey glass, never a void. */
export const DARK_GEM_MIN_LIGHTNESS = 0.42;
/** sRGB lightness of a speckled (salt-and-pepper) body: translucent mid-grey, the dark comes from the inclusions. */
export const SPECKLED_MIN_LIGHTNESS = 0.6;

/**
 * Shading parameters for a transparent or translucent gem. Pure (no WebGL), so it is unit tested.
 * Dark body colours would otherwise go to black: the shader multiplies the environment by body^path, and
 * 0.1^1.4 is ~0.04. Real dark stones still show their facets (bright specular flashes on the crown, grey-black
 * step bands, a smoky body where light passes), so a dark body is lifted to a minimum lightness (hue and
 * saturation kept), travels a shorter path, gets a stronger body glow and brighter crown reflections.
 */
export function gemShade(
  gem: GemModel,
  colorHex: string,
  clarity?: ClarityModel,
  tintHex?: string,
  tintStrength = 0,
  stepCut = false,
  selfLit = false,
): GemShade {
  const colourId = gem.colors.find((x) => x.hex.toLowerCase() === colorHex.toLowerCase())?.id;
  const speckled = colourId !== undefined && SPECKLED_COLORS.has(colourId);
  const flashHex = colourId ? gemColorFlashes[`${gem.id}/${colourId}`] : undefined;
  const base = new THREE.Color(colorHex);
  if (tintHex && tintStrength > 0) base.lerp(new THREE.Color(tintHex), tintStrength);
  const haze = clarity?.haze ?? 0;
  const hsl = { h: 0, s: 0, l: 0 };
  // darkness is judged on the colour as seen (sRGB lightness): 1 at <= 0.12 (black), fading out by 0.3 (deep but
  // clearly coloured stones such as deep green emerald keep their colour)
  base.getHSL(hsl, THREE.SRGBColorSpace);
  const darkness = THREE.MathUtils.clamp((0.3 - hsl.l) / 0.18, 0, 1);
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
  if (darkness > 0) {
    body.getHSL(hsl, THREE.SRGBColorSpace);
    const lift = hsl.l + (Math.max(hsl.l, DARK_GEM_MIN_LIGHTNESS) - hsl.l) * darkness;
    // near-black bodies are mostly grey: lifting them must not turn a faint cast into a pastel tint
    body.setHSL(hsl.h, hsl.s * (1 - 0.5 * darkness), lift, THREE.SRGBColorSpace);
  }
  if (speckled) {
    // salt-and-pepper: a translucent mid-grey body (the darkness is in the inclusions, not the body)
    body.getHSL(hsl, THREE.SRGBColorSpace);
    body.setHSL(hsl.h, hsl.s, Math.max(hsl.l, SPECKLED_MIN_LIGHTNESS), THREE.SRGBColorSpace);
  }
  const body2 = body.clone();
  if (flashHex) {
    // the secondary colour gets the same deepening as the main body
    body2.set(flashHex);
    body2.getHSL(hsl);
    body2.setHSL(hsl.h, Math.min(0.78, hsl.s * 1.1 + 0.02), hsl.l);
  }
  const basePath = speckled ? 1.0 : colourless ? 1.4 : pastel ? 1.1 : 1.6;
  const baseCrownLo = speckled ? 0.75 : colourless ? 0.45 : 0.6;
  return {
    body,
    darkness,
    scatter: 0.75 + 0.55 * ri + (translucent ? 0.5 : 0),
    // coloured stones: their body colour masks fire, and split channels would tint facets off-hue; dark bodies too
    dispersion:
      Math.min(0.07, gem.dispersion * 0.6) *
      (colourless ? 1 : 0.3) *
      (stepCut ? 0 : 1) *
      (1 - 0.7 * darkness),
    brightness: speckled ? 1.1 : colourless ? 1.5 + 0.4 * ri : 1.8,
    haze: Math.min(1, haze + (translucent ? 0.55 : 0) + (speckled ? 0.12 : 0)),
    contrast: speckled ? 0.5 : colourless ? 0.9 : 0.55,
    // light travels the body twice: deeper colour for saturated gems, a gentle deepening for pastels and tints
    path: basePath + (1.0 - basePath) * darkness,
    crownLo: baseCrownLo + (0.7 - baseCrownLo) * darkness,
    glow: translucent ? 0.75 : 0,
    mosaic: translucent ? 0 : stepCut ? 1 : colourless ? 0.9 : 0.6,
    step: stepCut ? 1 : 0,
    lift: speckled ? 0.3 : 0.12 + 0.18 * darkness,
    crownEnv: 0.6 + 0.3 * darkness,
    body2,
    flashMix: flashHex ? 1 : 0,
    darkFloor: speckled ? 2.2 : 1,
    speckle: speckled ? 1 : 0,
    self: selfLit ? 1 : 0,
  };
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
      .replace('void main() {', `${GEM_FUNCS}\nvoid main() {`)
      .replace('#include <opaque_fragment>', PAVILION_MAIN);
  };
  mat.customProgramCacheKey = () => 'gem-pavilion-v7';
  return mat;
}

function crownMaterial(
  gem: GemModel,
  haze: number,
  envIntensity: number,
  u: GemUniforms,
): THREE.MeshPhysicalMaterial {
  const mat = new THREE.MeshPhysicalMaterial({
    color: '#000000',
    metalness: 0,
    roughness: 0.02 + haze * 0.1,
    ior: Math.min(2.33, gem.ior),
    specularIntensity: 1,
    specularColor: new THREE.Color('#ffffff'),
    envMapIntensity: envIntensity,
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
      .replace('void main() {', `${GEM_FUNCS}\nvoid main() {`)
      .replace('#include <opaque_fragment>', CROWN_MAIN);
  };
  mat.customProgramCacheKey = () => 'gem-crown-v7';
  return mat;
}

/**
 * Two shells drawn with the same geometry. Returns [outer, inner]:
 *  - inner (BackSide, drawn first): the pavilion light return (see PAVILION_MAIN), opaque.
 *  - outer (FrontSide, additive): the crown's surface reflection and specular glints, Fresnel-weighted by the gem's IOR,
 *    added on top so it never greys the stone out.
 * Opaque gems (pearl, onyx) get a solid glossy body instead.
 *
 * `selfLit` (default: no clarity given, which is how accent, side and pave stones are built; only the centre stone is
 * graded): the crown traces its own pavilion. Small stones sit with their pavilions inside the seat metal, so the
 * pavilion pass fails the depth test there and the crown would show the metal through itself (gold-tinted melee).
 */
export function gemMaterials(
  gem: GemModel,
  colorHex: string,
  clarity?: ClarityModel,
  tintHex?: string,
  tintStrength = 0,
  stepCut = false,
  selfLit = clarity === undefined,
): [THREE.MeshPhysicalMaterial, THREE.MeshStandardMaterial] {
  const key = `g:${gem.id}:${colorHex}:${clarity?.id ?? ''}:${tintHex ?? ''}:${tintStrength}:${stepCut ? 's' : ''}:${selfLit ? 'o' : ''}`;
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
    const g = gemShade(gem, colorHex, clarity, tintHex, tintStrength, stepCut, selfLit);
    const uniforms: GemUniforms = {
      gemBody: { value: g.body },
      gemScatter: { value: g.scatter },
      gemDispersion: { value: g.dispersion },
      gemBrightness: { value: g.brightness },
      gemHaze: { value: g.haze },
      gemContrast: { value: g.contrast },
      gemPath: { value: g.path },
      gemCrownLo: { value: g.crownLo },
      gemGlow: { value: g.glow },
      gemMosaic: { value: g.mosaic },
      gemStep: { value: g.step },
      gemLift: { value: g.lift },
      gemBody2: { value: g.body2 },
      gemFlashMix: { value: g.flashMix },
      gemDarkFloor: { value: g.darkFloor },
      gemSpeckleAmt: { value: g.speckle },
      gemSelf: { value: g.self },
    };
    inner = pavilionMaterial(uniforms);
    outer = crownMaterial(gem, haze, g.crownEnv, uniforms);
  }
  cache.set(key, outer);
  cache.set(key + ':in', inner);
  return [outer, inner];
}

export function disposeMaterialCache(): void {
  cache.forEach((m) => m.dispose());
  cache.clear();
}
