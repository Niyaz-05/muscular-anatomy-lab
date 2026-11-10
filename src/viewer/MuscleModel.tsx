import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { useGLTF } from '@react-three/drei';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { useLab } from '../app/LabContext';
import { effectiveCloseUp, effectiveColourBy, effectiveMode, effectiveSlice, effectiveTint, focusIds, highlightedIds, isVisible, type BonesView } from '../app/state';
import type { AnatomicalStructure } from '../contract/schema';
import { geometryOf, modeBounds, sliceWorld, SKIN_BONES } from '../lab/anchors';
import { isRest, poseMatrices } from '../lab/rig';
import { flatten, skin } from '../lab/skinning';
import type { Pose } from '../lab/joints';
import type { Role } from '../lab/muscle-data';
import { baseColour, BONE, cutColour, GLOW, HIGHLIGHT, HOVER, INJURED, isTendon, realLook, realOpacity, ROLE_COLOUR, tendonColour } from './palette';
import { closeHoles } from './closeHoles';
import { fibreCoords } from './fibres';
import { applyQuality, hasTissueData, makeTissueMaterial, quality, setTendonColour, type TissueMaterial } from './tissue';

export const modelUrl = () => `${import.meta.env.BASE_URL}models/muscles.glb`;
export const bonesUrl = () => `${import.meta.env.BASE_URL}models/skeleton.glb`;

const GREY = new THREE.Color('#a59a96');
const WHITE = new THREE.Color('#ffffff');
const HIGHLIGHT_COLOUR = new THREE.Color(HIGHLIGHT);
const GLOW_COLOUR = new THREE.Color(GLOW);
const INJURED_COLOUR = new THREE.Color(INJURED);

/** Pointer travel (px) above which a press is treated as a drag (rotate), not a pick. */
const CLICK_SLOP = 5;

/** The cut shared with the label layer and the overlays, so hits on the removed side can be ignored. */
export const clip = { plane: new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0), active: false };
/** Bumped whenever parts move (pose), so the labels re-anchor. */
export const motion = { version: 0 };

/** The skinned muscles as they are now, for measuring how far a pose has stretched or shortened each one. */
export const skinData = {
  /** Bone matrices of the current pose (16 numbers per bone, in SKIN_BONES order). */
  bones: new Float32Array(SKIN_BONES.length * 16),
  parts: new Map<string, { rest: Float32Array; skin: Float32Array; ends: [number, number] }>(),
  version: 0,
};

/** What the model shows beyond the learner's selection: computed by the viewer from the simulation state. */
export interface ModelView {
  pose: Pose;
  /** Movement view: what each muscle does in the pose. */
  roles: ReadonlyMap<string, Role> | null;
  /** Muscles working hard in an activity, 0–1 (Exercise view). */
  working: ReadonlyMap<string, number> | null;
  /** Muscles injured or diseased (Injuries view). */
  injured: ReadonlySet<string>;
  bones: BonesView;
}

interface Cap { back: THREE.Mesh; front: THREE.Mesh; face: THREE.Mesh; material: THREE.MeshStandardMaterial; closed: THREE.BufferGeometry }
/** A muscle. Its cut cap is built the first time a cut crosses it (closing a mesh is costly). */
interface Part { id: string; mesh: THREE.Mesh; material: TissueMaterial; structure: AnatomicalStructure; box: THREE.Box3; cap: Cap | null; order: number; capSize: number; capTint: THREE.Color; tendonTint: THREE.Color; rest: Float32Array; restNormal: Float32Array; skin: Float32Array }

/** Cut-face grain: one tile of the noise texture spans this many metres. */
const GRAIN_TILE = 0.01;
let grain: THREE.DataTexture | null = null;
/** A soft, tileable value-noise texture (deterministic) that gives cut faces a bony grain. */
function grainTexture(): THREE.DataTexture {
  if (grain) return grain;
  const n = 128;
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const smooth = (t: number) => t * t * (3 - 2 * t);
  const octave = (cells: number) => {
    const lattice = Array.from({ length: cells * cells }, rand);
    const at = (x: number, y: number) => lattice[(y % cells) * cells + (x % cells)]!;
    const step = n / cells;
    return (x: number, y: number) => {
      const gx = Math.floor(x / step), gy = Math.floor(y / step);
      const fx = smooth((x % step) / step), fy = smooth((y % step) / step);
      const top = at(gx, gy) * (1 - fx) + at(gx + 1, gy) * fx;
      const bottom = at(gx, gy + 1) * (1 - fx) + at(gx + 1, gy + 1) * fx;
      return top * (1 - fy) + bottom * fy;
    };
  };
  const coarse = octave(8), medium = octave(16), fine = octave(32);
  const data = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const v = 0.84 + 0.08 * coarse(x, y) + 0.05 * medium(x, y) + 0.03 * fine(x, y);
    data.set([v * 255, v * 255, v * 255, 255], (y * n + x) * 4);
  }
  grain = new THREE.DataTexture(data, n, n);
  grain.wrapS = grain.wrapT = THREE.RepeatWrapping;
  grain.magFilter = THREE.LinearFilter;
  grain.minFilter = THREE.LinearMipmapLinearFilter;
  grain.generateMipmaps = true;
  grain.colorSpace = THREE.SRGBColorSpace;
  grain.needsUpdate = true;
  return grain;
}

/**
 * Stencil capping (as in three.js' clipping-stencil example): back faces behind the cut add 1 and
 * front faces subtract 1, so the stencil is non-zero exactly where the cut passes through the
 * inside of a closed mesh. The face drawn there is the filled cut surface, in the tissue's colour.
 * `planes` clip the stencil passes (the cut plane, plus any other planes the part is clipped by);
 * the face lies on planes[0] and is clipped by the rest.
 */
function makeCap(closed: THREE.BufferGeometry, planes: THREE.Plane[], order: number, colour: string, size: number): Cap {
  const stencilMat = (side: THREE.Side, op: THREE.StencilOp) => new THREE.MeshBasicMaterial({
    side, colorWrite: false, depthWrite: false, depthTest: false,
    stencilWrite: true, stencilFunc: THREE.AlwaysStencilFunc,
    stencilFail: op, stencilZFail: op, stencilZPass: op,
    clippingPlanes: planes,
  });
  const back = new THREE.Mesh(closed, stencilMat(THREE.BackSide, THREE.IncrementWrapStencilOp));
  const front = new THREE.Mesh(closed, stencilMat(THREE.FrontSide, THREE.DecrementWrapStencilOp));
  back.renderOrder = front.renderOrder = order;
  const map = grainTexture().clone();
  map.repeat.setScalar(Math.max(1, size / GRAIN_TILE));
  const material = new THREE.MeshStandardMaterial({
    color: colour, map, roughness: 0.6, metalness: 0, side: THREE.DoubleSide,
    stencilWrite: true, stencilRef: 0, stencilFunc: THREE.NotEqualStencilFunc,
    stencilFail: THREE.ReplaceStencilOp, stencilZFail: THREE.ReplaceStencilOp, stencilZPass: THREE.ReplaceStencilOp,
    clippingPlanes: planes.slice(1),
  });
  const face = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
  face.renderOrder = order + 0.1;
  for (const m of [back, front, face]) {
    m.visible = false;
    m.raycast = () => {}; // never pickable
    m.matrixAutoUpdate = false;
  }
  return { back, front, face, material, closed };
}

export function MuscleModel({ onReady, view }: { onReady?: () => void; view: ModelView }) {
  const { def, state, dispatch } = useLab();
  const gltf = useGLTF(modelUrl());
  const invalidate = useThree((s) => s.invalidate);
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  // Shaders compiled for every part (see below), so changing view never stalls on compiling.
  const [warm, setWarm] = useState(false);
  const mode = effectiveMode(def, state);
  const close = effectiveCloseUp(def, state);
  const bounds = useMemo(() => modeBounds(def, mode), [def, mode]);
  const geometry = useMemo(() => geometryOf(def), [def]);

  const parts = useMemo(() => {
    const out = new Map<string, Part>();
    gltf.scene.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      const id = o.name || o.parent?.name || '';
      const s = def.structures.find((x) => x.id === id);
      if (!s) return;
      const material = makeTissueMaterial(realLook(s), hasTissueData(o), true);
      material.clippingPlanes = [clip.plane];
      o.geometry.computeBoundingBox();
      const box = o.geometry.boundingBox!.clone();
      const capSize = box.getSize(new THREE.Vector3()).length() * 1.05;
      o.matrixAutoUpdate = false;
      // The file stores vertex attributes interleaved, so `attribute.array` is the whole interleaved buffer: copy
      // positions, normals and skin weights into plain arrays, and give the geometry its own writable positions and normals.
      const copy = (name: string) => {
        const a = o.geometry.getAttribute(name);
        const out = new Float32Array(a.count * 3);
        for (let i = 0; i < a.count; i++) { out[i * 3] = a.getX(i); out[i * 3 + 1] = a.getY(i); out[i * 3 + 2] = a.getZ(i); }
        return out;
      };
      const rest = copy('position'), restNormal = copy('normal'), skinArr = copy('_skin');
      o.geometry.setAttribute('position', new THREE.BufferAttribute(Float32Array.from(rest), 3).setUsage(THREE.DynamicDrawUsage));
      o.geometry.setAttribute('normal', new THREE.BufferAttribute(Float32Array.from(restNormal), 3).setUsage(THREE.DynamicDrawUsage));
      // Where the fibres run (from the rest shape; the coordinates then ride with the vertices when posed).
      if (!o.geometry.getAttribute('fibre')) o.geometry.setAttribute('fibre', new THREE.BufferAttribute(fibreCoords(rest, id, restNormal), 4));
      skinData.parts.set(id, { rest, skin: skinArr, ends: (geometry[id]?.ends ?? [0, 0]) as [number, number] });
      out.set(id, { id, mesh: o, material, structure: s, box, cap: null, order: 0, capSize, capTint: new THREE.Color(cutColour(s)), tendonTint: new THREE.Color(tendonColour(s)), rest, restNormal, skin: skinArr });
    });
    // Large structures first, so smaller ones inside them draw their caps last.
    const sorted = [...out.values()].sort((a, b) => b.box.getSize(new THREE.Vector3()).lengthSq() - a.box.getSize(new THREE.Vector3()).lengthSq());
    sorted.forEach((p, i) => { p.order = 10 + i * 2; });
    return out;
  }, [gltf, def, geometry]);

  // Attach materials in an effect, not in useMemo: StrictMode may run the memo twice, and the
  // meshes must carry the materials this component actually updates. Dispose them on unmount.
  useLayoutEffect(() => {
    for (const p of parts.values()) {
      p.mesh.material = p.material;
      p.mesh.userData.structureId = p.id;
    }
    // Compile every part's shader once, with all parts shown, before the model counts as ready.
    let live = true;
    for (const p of parts.values()) p.mesh.visible = true;
    gl.compileAsync(gltf.scene, camera).catch(() => {}).finally(() => {
      if (!live) return;
      setWarm(true);
      onReady?.();
      invalidate();
    });
    return () => parts.forEach((p) => {
      live = false;
      p.material.dispose();
      const c = p.cap;
      if (c) {
        c.material.map?.dispose();
        c.material.dispose();
        if (c.closed !== p.mesh.geometry) c.closed.dispose();
        (c.back.material as THREE.Material).dispose();
        (c.front.material as THREE.Material).dispose();
        c.face.geometry.dispose();
        gltf.scene.remove(c.back, c.front, c.face);
        p.cap = null;
      }
    });
  }, [parts, onReady, gltf, gl, camera, invalidate]);

  // Follow quality changes (a slow device drops the costly coat and sheen).
  useEffect(() => quality.subscribe((level) => {
    for (const p of parts.values()) { applyQuality(p.material, level); p.material.needsUpdate = true; }
    invalidate();
  }), [parts, invalidate]);

  const focus = focusIds(def, state);
  const tint = effectiveTint(def, state);
  const lit = tint ? highlightedIds(def, focus) : new Set<string>();
  const colourBy = effectiveColourBy(def, state);
  const slice = effectiveSlice(def, state);

  // The cut plane: keeps the side where n·p + c ≥ 0. The plane stays attached to every material
  // (parked far outside the model when there is no cut), so turning a cut on or off never
  // recompiles the tissue shaders.
  useEffect(() => {
    const a = slice.axis;
    clip.active = a !== 'off';
    if (clip.active) {
      const ax = a === 'sagittal' ? 0 : a === 'axial' ? 1 : 2;
      const at = sliceWorld(bounds, ax, slice.at);
      const n = new THREE.Vector3();
      n.setComponent(ax, slice.flip ? 1 : -1);
      clip.plane.set(n, slice.flip ? -at : at);
    } else {
      clip.plane.set(new THREE.Vector3(-1, 0, 0), 100);
    }
    invalidate();
  }, [slice.axis, slice.at, slice.flip, bounds, invalidate]);

  // Where every muscle is: each vertex follows its two nearest bones through the pose.
  const poseKey = JSON.stringify(view.pose);
  useEffect(() => {
    const mats = poseMatrices(SKIN_BONES, view.pose);
    skinData.bones = flatten(SKIN_BONES.map((b) => mats.get(b) ?? new THREE.Matrix4()));
    const rest = isRest(view.pose);
    for (const p of parts.values()) {
      const pos = p.mesh.geometry.getAttribute('position') as THREE.BufferAttribute, nor = p.mesh.geometry.getAttribute('normal') as THREE.BufferAttribute;
      if (rest) { (pos.array as Float32Array).set(p.rest); (nor.array as Float32Array).set(p.restNormal); }
      else skin(p.rest, p.restNormal, p.skin, skinData.bones, pos.array as Float32Array, nor.array as Float32Array);
      pos.needsUpdate = nor.needsUpdate = true;
      // Picking and culling use the bounds, so they follow the muscle.
      p.mesh.geometry.computeBoundingBox();
      p.mesh.geometry.computeBoundingSphere();
      p.box.copy(p.mesh.geometry.boundingBox!);
    }
    skinData.version++;
    motion.version++;
    invalidate();
    // poseKey stands for the pose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parts, poseKey, invalidate]);

  useEffect(() => {
    for (const p of parts.values()) {
      const s = p.structure;
      p.mesh.visible = isVisible(def, state, p.id);
      const isLit = lit.has(p.id);
      const isHover = state.hovered === p.id && !isLit;
      const role = view.roles?.get(p.id);
      const work = view.working?.get(p.id);
      const hurt = view.injured.has(p.id);
      const featured = isLit || !!role || work !== undefined || hurt;
      const busy = !!view.roles || !!view.working || view.injured.size > 0;
      const dim = (lit.size > 0 || busy) && !featured;
      p.material.color.set(baseColour(s, colourBy));
      if (hurt) p.material.color.lerp(INJURED_COLOUR, 0.55);
      else if (role) p.material.color.set(ROLE_COLOUR[role]);
      else if (work !== undefined && colourBy === 'real') p.material.color.lerp(GLOW_COLOUR, 0.15 + 0.5 * work);
      else if (isLit && colourBy === 'real') p.material.color.lerp(HIGHLIGHT_COLOUR, 0.35);
      else if (dim) p.material.color.lerp(GREY, 0.45);
      // Tendon parts: pearly off-white in the real look (following the same highlight, glow and dimming);
      // in a colour mode, or for a role or injury, a paler shade of the muscle's colour.
      const t = p.tendonTint;
      if (colourBy === 'real' && !hurt && !role) {
        t.set(tendonColour(s));
        if (work !== undefined) t.lerp(GLOW_COLOUR, 0.15 + 0.5 * work);
        else if (isLit) t.lerp(HIGHLIGHT_COLOUR, 0.35);
        else if (dim) t.lerp(GREY, 0.45);
      } else {
        t.copy(p.material.color);
        if (!isTendon(s)) t.lerp(WHITE, 0.4);
      }
      setTendonColour(p.material, t);
      const emissive = hurt ? INJURED_COLOUR : role ? new THREE.Color(ROLE_COLOUR[role]) : work !== undefined ? GLOW_COLOUR : isLit ? (colourBy === 'real' ? HIGHLIGHT_COLOUR : p.material.color) : null;
      if (emissive) { p.material.emissive.copy(emissive); p.material.emissiveIntensity = hurt ? 0.3 : role === 'prime' ? 0.38 : role ? 0.25 : work !== undefined ? 0.1 + 0.3 * work : 0.3; }
      else { p.material.emissive.set(isHover ? HOVER : '#000000'); p.material.emissiveIntensity = isHover ? 0.3 : 0; }

      let opacity = realOpacity(s);
      if (dim && busy) opacity = 0.32;
      const transparent = opacity < 1;
      // Changing `transparent` changes the shader program; only flag an update when it flips.
      if (p.material.transparent !== transparent) p.material.needsUpdate = true;
      p.material.transparent = transparent;
      p.material.opacity = opacity;
      p.material.depthWrite = !transparent;
      p.mesh.renderOrder = transparent ? 2 : 0;

      p.capTint.set(colourBy !== 'real' ? baseColour(s, colourBy) : cutColour(s));
      if (isLit) p.capTint.lerp(HIGHLIGHT_COLOUR, 0.3);
      else if (dim) p.capTint.lerp(GREY, 0.35);
      p.cap?.material.color.copy(p.capTint);
    }
    invalidate();
  }, [parts, def, state, lit, colourBy, mode, close, view, warm, invalidate]);

  // Keep each cap on the plane, just large enough to cover the part's footprint, and show it only
  // where the plane crosses a solid part. Caps are drawn from the rest shape, so only in the rest pose.
  const tmp = useMemo(() => new THREE.Vector3(), []);
  const size = useMemo(() => new THREE.Vector3(), []);
  const worldBox = useMemo(() => new THREE.Box3(), []);
  useFrame(() => {
    const atRest = isRest(view.pose);
    for (const p of parts.values()) {
      const solid = atRest && p.mesh.visible && p.mesh.material === p.material && !p.material.transparent;
      worldBox.copy(p.box);
      const show = clip.active && solid && clip.plane.intersectsBox(worldBox);
      if (show && !p.cap) {
        const c = makeCap(closeHoles(p.mesh.geometry), [clip.plane], p.order, `#${p.capTint.getHexString()}`, p.capSize);
        c.face.renderOrder = p.order + 1;
        gltf.scene.add(c.back, c.front, c.face);
        p.cap = c;
      }
      const c = p.cap;
      if (!c) continue;
      c.back.visible = c.front.visible = c.face.visible = show;
      if (show) {
        clip.plane.projectPoint(worldBox.getCenter(tmp), tmp);
        c.face.position.copy(tmp);
        c.face.lookAt(tmp.x - clip.plane.normal.x, tmp.y - clip.plane.normal.y, tmp.z - clip.plane.normal.z);
        c.face.scale.setScalar(worldBox.getSize(size).length() * 1.05);
        c.face.updateMatrix();
      }
    }
  });

  /** Ignore hits on the part of the model the cut has removed. */
  const removed = (e: ThreeEvent<PointerEvent | MouseEvent>) => clip.active && clip.plane.distanceToPoint(e.point) < 0;
  const pick = (e: ThreeEvent<MouseEvent>) => {
    const id = e.object.userData.structureId as string | undefined;
    if (!id || !e.object.visible || removed(e)) return; // let the event reach the next hit
    const m = (e.object as THREE.Mesh).material as THREE.Material;
    if (m.transparent && m.opacity < 0.4) return; // ghosted muscles are see-through to clicks
    e.stopPropagation();
    if (e.delta > CLICK_SLOP) return;
    dispatch({ type: 'select', id });
  };
  const over = (e: ThreeEvent<PointerEvent>) => {
    const id = e.object.userData.structureId as string | undefined;
    if (!id || !e.object.visible || removed(e)) return;
    const m = (e.object as THREE.Mesh).material as THREE.Material;
    if (m.transparent && m.opacity < 0.4) return;
    e.stopPropagation();
    dispatch({ type: 'hover', id });
    document.body.style.cursor = 'pointer';
  };
  const out = (e: ThreeEvent<PointerEvent>) => {
    if (e.object.userData.structureId === state.hovered) dispatch({ type: 'hover', id: null });
    document.body.style.cursor = '';
  };

  return <primitive object={gltf.scene} onClick={pick} onPointerOver={over} onPointerOut={out} />;
}

/**
 * The skeleton behind the muscles: ivory bone, ghosted or solid, posed with the same rig so the muscles
 * visibly ride on it. It takes no part in picking.
 */
export function BoneBackdrop({ pose, look }: { pose: Pose; look: Exclude<BonesView, 'off'> }) {
  const gltf = useGLTF(bonesUrl());
  const invalidate = useThree((s) => s.invalidate);
  const bones = useMemo(() => {
    const out: THREE.Mesh[] = [];
    gltf.scene.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      if (o.name.startsWith('female-')) { o.visible = false; return; }
      o.matrixAutoUpdate = false;
      o.raycast = () => {};
      out.push(o);
    });
    return out;
  }, [gltf]);
  const material = useMemo(() => new THREE.MeshStandardMaterial({ color: BONE, roughness: 0.75, metalness: 0, side: THREE.DoubleSide, clippingPlanes: [clip.plane] }), []);
  useEffect(() => () => material.dispose(), [material]);
  const poseKey = JSON.stringify(pose);
  useEffect(() => {
    const mats = poseMatrices(bones.map((b) => b.name), pose);
    for (const b of bones) { b.matrix.copy(mats.get(b.name) ?? new THREE.Matrix4()); b.matrixWorldNeedsUpdate = true; }
    invalidate();
    // poseKey stands for the pose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bones, poseKey, invalidate]);
  useEffect(() => {
    const ghost = look === 'ghost';
    material.transparent = ghost; material.opacity = ghost ? 0.3 : 1; material.depthWrite = !ghost; material.needsUpdate = true;
    for (const b of bones) { b.material = material; b.renderOrder = ghost ? 1 : 0; }
    invalidate();
  }, [bones, material, look, invalidate]);
  return <primitive object={gltf.scene} />;
}
