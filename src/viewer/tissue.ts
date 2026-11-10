/**
 * The real-tissue look shared by the anatomy labs.
 *
 * - A physically based material with a clear coat (the moist surface sheen of fresh tissue) and a
 *   sheen (soft, velvety tissue), lit by an image-based environment.
 * - Baked per-vertex data (_TISSUE, from tools/bake-shading.mjs): ambient occlusion darkens folds
 *   and grooves, a noise value breaks up flat colour, and an optional fat mask tints tissue
 *   (epicardial fat along the heart's vessels).
 * - A soft warm rim where the surface turns away from the viewer, approximating light that scatters
 *   under the surface of living tissue (cheap stand-in for subsurface scattering).
 * - Muscle (this lab): a baked tendon mask (_TISSUE.a) blends the surface to glossy off-white tendon and
 *   aponeurosis, and per-vertex fibre coordinates (`fibre`: across, across, along the fibres, in metres;
 *   see fibres.ts) draw fascicle striations along the fibres, as colour and as fine relief. The striations
 *   come in octaves (fascicle bundles, fascicles, fine grain) and each octave fades out once it is
 *   smaller than about two pixels, so they read at full-body and close-up zoom without shimmer.
 * Shared with the other labs, which leave the muscle parts off.
 */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export interface TissueLook {
  /** Base colour of the tissue. */
  color: string;
  roughness?: number;
  /** Wet surface coat, 0–1. */
  clearcoat?: number;
  clearcoatRoughness?: number;
  /** Velvety sheen, 0–1, and its tint. */
  sheen?: number;
  sheenColor?: string;
  /** Subsurface rim glow strength and tint. */
  rim?: number;
  rimColor?: string;
  /** How strongly baked occlusion darkens folds, 0–1. */
  ao?: number;
  /** How strongly the mottling noise varies the colour, 0–1, and the colour it shifts towards. */
  mottle?: number;
  mottleTint?: string;
  /** Fat tint along vessels (only where the bake wrote a fat mask). */
  fat?: number;
  fatColor?: string;
  /** How strongly the baked tendon mask turns the surface into tendon, 0–1, and the tendon's colour and roughness. */
  tendon?: number;
  tendonColor?: string;
  tendonRoughness?: number;
  /** Fibre striation strength, 0–1 (needs fibre coordinates on the mesh), and the size of a fascicle bundle (m). */
  fibre?: number;
  fibreScale?: number;
  /** How much diffuse light falls off where the surface turns away from the viewer, 0–1, so the border of each muscle reads as a groove. */
  edge?: number;
}

const DEFAULTS: Required<Omit<TissueLook, 'color'>> = {
  roughness: 0.5,
  clearcoat: 0.35,
  clearcoatRoughness: 0.35,
  sheen: 0.35,
  sheenColor: '#ffd9cf',
  rim: 0.22,
  rimColor: '#ff8a70',
  ao: 0.85,
  mottle: 0.25,
  mottleTint: '#b07a6e',
  fat: 0,
  fatColor: '#e8c46a',
  tendon: 0,
  tendonColor: '#e9e2d0',
  tendonRoughness: 0.32,
  fibre: 0,
  fibreScale: 0.006,
  edge: 0,
};

export interface TissueUniforms {
  uAO: { value: number };
  uMottle: { value: number };
  uMottleTint: { value: THREE.Color };
  uFat: { value: number };
  uFatColor: { value: THREE.Color };
  uRim: { value: number };
  uRimColor: { value: THREE.Color };
  uTendon: { value: number };
  uTendonColor: { value: THREE.Color };
  uTendonRough: { value: number };
  uFibre: { value: number };
  uFibreScale: { value: number };
  uEdge: { value: number };
}

/**
 * GLSL for the fibre striations. `tissueFibre(q, s, scale, h)` returns a signed colour change (about
 * −1…1) and writes the relief height (metres) to `h`. q: position across the fibres, s: along them
 * (metres). Each octave cuts the cross-section into irregular polygonal fascicles (cellular noise),
 * extruded along the fibres: on the surface they show as parallel strands of slightly different shade,
 * bulging a little, with thin dark furrows (perimysium) between them and a slow variation along each one.
 */
const FIBRE_GLSL = `
float tissueHash(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
vec2 tissueHash2(vec2 p) { vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); q += dot(q, q.yzx + 33.33); return fract((q.xx + q.yz) * q.zy); }
float tissueFibre(vec2 q, float s, float scale, out float h) {
  float px = max(length(fwidth(q)), 1e-7);
  float colour = 0.0;
  h = 0.0;
  float cell = scale;
  float weight = 1.0;
#ifdef FIBRE_DETAIL
  for (int k = 0; k < 3; k++) {
#else
  for (int k = 0; k < 1; k++) {
#endif
    float vis = 1.0 - smoothstep(0.35, 0.8, px / cell);
    vec2 g = q / cell + float(k) * 37.1;
    vec2 i = floor(g), f = fract(g);
    float d1 = 8.0, d2 = 8.0;
    vec2 id = i;
    for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
      vec2 o = vec2(float(x), float(y));
      vec2 r = o + 0.15 + 0.7 * tissueHash2(i + o) - f;
      float d = dot(r, r);
      if (d < d1) { d2 = d1; d1 = d; id = i + o; } else if (d < d2) { d2 = d; }
    }
    float edge = sqrt(d2) - sqrt(d1);             // 0 on the furrow between two fascicles
    float aa = max(0.12, 1.5 * fwidth(edge));     // furrows never thinner than about a pixel
    float furrow = 1.0 - smoothstep(0.0, aa, edge);
    float tone = tissueHash(id) - 0.5;            // each fascicle a slightly different shade
    float along = sin(s / (cell * 7.0) + tone * 40.0) * 0.5; // and slowly varying along its length
    colour += vis * weight * (0.55 * tone + 0.25 * along - 0.75 * furrow);
    h += vis * cell * 0.06 * (smoothstep(0.0, 0.45, edge) + 0.4 * tone);
    cell *= 0.38;
    weight *= 0.75;
  }
  return colour;
}
// Bump from a height in metres: the perturbation of the normal by the height's screen-space slope
// (three's perturbNormalArb, with the position derivatives left unnormalised so the slope is metric).
vec3 tissuePerturb(vec3 pos, vec3 n, float h, float faceDir) {
  vec3 dpdx = dFdx(pos), dpdy = dFdy(pos);
  float dhdx = dFdx(h), dhdy = dFdy(h);
  vec3 r1 = cross(dpdy, n), r2 = cross(n, dpdx);
  float det = dot(dpdx, r1) * faceDir;
  vec3 grad = sign(det) * (dhdx * r1 + dhdy * r2);
  return normalize(abs(det) * n - grad);
}
`;

export type TissueMaterial = THREE.MeshPhysicalMaterial & { userData: { tissue: TissueUniforms; look: Required<TissueLook> } };

/**
 * Rendering quality. "high" draws the wet coat and velvety sheen; "low" leaves them out (three.js
 * then compiles a much cheaper shader), keeping colour, baked folds and lighting. Low is chosen for
 * software renderers and when frames stay slow; `?quality=high` or `?quality=low` overrides it.
 */
export type Quality = 'high' | 'low';
const qualityListeners = new Set<(q: Quality) => void>();
export const quality = {
  level: 'high' as Quality,
  forced: false,
  set(level: Quality) {
    if (level === this.level) return;
    this.level = level;
    qualityListeners.forEach((fn) => fn(level));
  },
  subscribe(fn: (q: Quality) => void): () => void {
    qualityListeners.add(fn);
    return () => { qualityListeners.delete(fn); };
  },
};

/** The starting quality: the URL override, else low on a software (CPU) renderer, else high. */
export function initialQuality(gl: THREE.WebGLRenderer): Quality {
  const param = new URLSearchParams(window.location.search).get('quality');
  if (param === 'high' || param === 'low') {
    quality.forced = true;
    return param;
  }
  const ctx = gl.getContext();
  const info = ctx.getExtension('WEBGL_debug_renderer_info');
  const renderer = String(info ? ctx.getParameter(info.UNMASKED_RENDERER_WEBGL) : ctx.getParameter(ctx.RENDERER));
  return /swiftshader|llvmpipe|software|basic render/i.test(renderer) ? 'low' : 'high';
}

/**
 * Turns the costly coat, sheen and fine fibre detail on or off for one material (low quality keeps one
 * octave of fibre colour and no fibre relief).
 */
export function applyQuality(material: TissueMaterial, level: Quality) {
  const l = material.userData.look;
  material.clearcoat = level === 'high' ? l.clearcoat : 0;
  material.sheen = level === 'high' ? l.sheen : 0;
  const defines = { ...material.defines };
  if (level === 'high') defines.FIBRE_DETAIL = '';
  else delete defines.FIBRE_DETAIL;
  material.defines = defines;
}

/**
 * A tissue material for one mesh. `baked` says whether the mesh carries the _TISSUE attribute
 * (the shader reads it only then, so unbaked meshes render correctly too); `fibres` whether it carries
 * the `fibre` coordinates.
 */
export function makeTissueMaterial(look: TissueLook, baked: boolean, fibres = false): TissueMaterial {
  const l = { ...DEFAULTS, ...look };
  const material = new THREE.MeshPhysicalMaterial({
    color: l.color,
    roughness: l.roughness,
    metalness: 0,
    clearcoat: l.clearcoat,
    clearcoatRoughness: l.clearcoatRoughness,
    sheen: l.sheen,
    sheenColor: new THREE.Color(l.sheenColor),
    sheenRoughness: 0.6,
    side: THREE.DoubleSide,
  }) as TissueMaterial;
  const uniforms: TissueUniforms = {
    uAO: { value: l.ao },
    uMottle: { value: l.mottle },
    uMottleTint: { value: new THREE.Color(l.mottleTint) },
    uFat: { value: l.fat },
    uFatColor: { value: new THREE.Color(l.fatColor) },
    uRim: { value: l.rim },
    uRimColor: { value: new THREE.Color(l.rimColor) },
    uTendon: { value: l.tendon },
    uTendonColor: { value: new THREE.Color(l.tendonColor) },
    uTendonRough: { value: l.tendonRoughness },
    uFibre: { value: l.fibre },
    uFibreScale: { value: l.fibreScale },
    uEdge: { value: l.edge },
  };
  material.userData.tissue = uniforms;
  material.userData.look = l;
  if (baked) material.defines = { ...material.defines, USE_TISSUE: '' };
  if (fibres && l.fibre > 0) material.defines = { ...material.defines, USE_FIBRE: '' };
  applyQuality(material, quality.level);
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n#ifdef USE_TISSUE\nattribute vec4 _tissue;\nvarying vec4 vTissue;\n#endif\n#ifdef USE_FIBRE\nattribute vec4 fibre;\nvarying vec4 vFibre;\n#endif')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n#ifdef USE_TISSUE\nvTissue = _tissue;\n#endif\n#ifdef USE_FIBRE\nvFibre = fibre;\n#endif');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        [
          '#include <common>',
          'uniform float uAO; uniform float uMottle; uniform vec3 uMottleTint;',
          'uniform float uFat; uniform vec3 uFatColor; uniform float uRim; uniform vec3 uRimColor;',
          'uniform float uTendon; uniform vec3 uTendonColor; uniform float uTendonRough;',
          'uniform float uFibre; uniform float uFibreScale; uniform float uEdge;',
          '#ifdef USE_TISSUE',
          'varying vec4 vTissue;',
          '#endif',
          '#ifdef USE_FIBRE',
          'varying vec4 vFibre;',
          FIBRE_GLSL,
          '#endif',
        ].join('\n'),
      )
      .replace(
        '#include <color_fragment>',
        [
          '#include <color_fragment>',
          'float tissueAO = 1.0;',
          'float tissueTendon = 0.0;',
          'float tissueHeight = 0.0;',
          '#ifdef USE_TISSUE',
          '  tissueTendon = clamp(vTissue.a * uTendon, 0.0, 1.0);',
          '  diffuseColor.rgb = mix(diffuseColor.rgb, uTendonColor, tissueTendon);',
          '  float tissueFat = clamp(vTissue.b * uFat, 0.0, 1.0);',
          // Fat is bright and glossy even deep in a groove, so it takes less of the occlusion.
          '  tissueAO = mix(1.0, vTissue.r, uAO * (1.0 - 0.75 * tissueFat));',
          '  diffuseColor.rgb = mix(diffuseColor.rgb, uFatColor, tissueFat);',
          '  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * uMottleTint, (1.0 - vTissue.g) * uMottle * (1.0 - 0.7 * tissueTendon));',
          '  diffuseColor.rgb *= tissueAO;',
          '#endif',
          '#ifdef USE_FIBRE',
          // Tendon has a finer, fainter grain than the fleshy belly.
          '  float tissueGrain = tissueFibre(vFibre.xy, vFibre.z, uFibreScale * mix(1.0, 0.45, tissueTendon), tissueHeight);',
          // Where the surface cuts across the fibres, the grain fades rather than show their cross-sections.
          '  float tissueAlong = uFibre * (1.0 - smoothstep(0.45, 0.8, vFibre.w));',
          '  diffuseColor.rgb *= max(0.0, 1.0 + tissueAlong * mix(1.0, 0.12, tissueTendon) * tissueGrain);',
          '  tissueHeight *= tissueAlong * mix(1.0, 0.12, tissueTendon);',
          '#endif',
        ].join('\n'),
      )
      .replace(
        '#include <roughnessmap_fragment>',
        '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, uTendonRough, tissueTendon);',
      )
      .replace(
        '#include <normal_fragment_maps>',
        '#include <normal_fragment_maps>\n#if defined(USE_FIBRE) && defined(FIBRE_DETAIL)\nnormal = tissuePerturb(-vViewPosition, normal, tissueHeight, faceDirection);\n#endif',
      )
      .replace(
        '#include <lights_physical_fragment>',
        [
          '#include <lights_physical_fragment>',
          // Tendon is glossier: a thicker wet coat, sharper highlights.
          '#ifdef USE_CLEARCOAT',
          '  material.clearcoat = mix(material.clearcoat, 1.0, 0.7 * tissueTendon);',
          '  material.clearcoatRoughness = mix(material.clearcoatRoughness, 0.12, tissueTendon);',
          '#endif',
        ].join('\n'),
      )
      .replace(
        '#include <aomap_fragment>',
        [
          '#include <aomap_fragment>',
          // Folds also hide ambient light and reflections, not only the base colour.
          'reflectedLight.indirectDiffuse *= tissueAO;',
          // Borders: diffuse light falls off where the surface turns away, so neighbouring muscles part with a groove.
          'float tissueEdge = 1.0 - uEdge * pow(1.0 - abs(dot(normal, normalize(vViewPosition))), 3.0);',
          'reflectedLight.directDiffuse *= tissueEdge;',
          'reflectedLight.indirectDiffuse *= tissueEdge;',
          'reflectedLight.indirectSpecular *= tissueAO * tissueAO;',
          'reflectedLight.directSpecular *= mix(1.0, tissueAO, 0.85);',
          '#ifdef USE_CLEARCOAT',
          '  clearcoatSpecularIndirect *= tissueAO * tissueAO;',
          '  clearcoatSpecularDirect *= tissueAO;',
          '#endif',
        ].join('\n'),
      )
      .replace(
        '#include <emissivemap_fragment>',
        [
          '#include <emissivemap_fragment>',
          'float tissueFacing = abs(dot(normal, normalize(vViewPosition)));',
          'totalEmissiveRadiance += uRimColor * uRim * pow(1.0 - tissueFacing, 2.5) * tissueAO * diffuseColor.rgb;',
        ].join('\n'),
      );
  };
  // All tissue materials share one program per variant (the defines are part of three's program key).
  material.customProgramCacheKey = () => (baked ? 'tissue-baked' : 'tissue');
  return material;
}

/** Points the tendon parts of a material at a colour (they follow highlight and colour modes). */
export function setTendonColour(material: TissueMaterial, colour: THREE.Color) {
  material.userData.tissue.uTendonColor.value.copy(colour);
}

/** True when a loaded mesh carries the baked _TISSUE attribute. */
export function hasTissueData(mesh: THREE.Mesh): boolean {
  return !!mesh.geometry.getAttribute('_tissue');
}

/** Image-based lighting from three's built-in studio room (no download), for realistic reflections. */
export function makeEnvironment(gl: THREE.WebGLRenderer): { texture: THREE.Texture; dispose(): void } {
  const pmrem = new THREE.PMREMGenerator(gl);
  const room = new RoomEnvironment();
  const texture = pmrem.fromScene(room, 0.04).texture;
  room.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.geometry.dispose();
      (o.material as THREE.Material).dispose();
    }
  });
  pmrem.dispose();
  return { texture, dispose: () => texture.dispose() };
}
