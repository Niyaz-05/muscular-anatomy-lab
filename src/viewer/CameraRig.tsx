import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useLab } from '../app/LabContext';
import { boundsOfIds, closeUpFrame, homeBounds } from '../lab/anchors';
import { effectiveCloseUp, effectiveMode } from '../app/state';

/** Distance at which a sphere of `radius` fills the view, for a perspective camera. */
export function fitDistance(radius: number, fovDeg: number, aspect: number, margin = 0.95): number {
  const vFov = THREE.MathUtils.degToRad(fovDeg);
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
  const limiting = Math.min(vFov, hFov);
  return (radius * margin) / Math.sin(limiting / 2);
}

/**
 * Distance at which a sphere fills the smaller side (`spanPx`) of a free rectangle on a canvas
 * `canvasHeightPx` tall. The rectangle's half-angle has tangent tan(vFov/2) · span / height.
 */
export function fitDistanceInRect(radius: number, fovDeg: number, spanPx: number, canvasHeightPx: number, margin = 0.95): number {
  const t = Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2) * (spanPx / Math.max(canvasHeightPx, 1));
  return (radius * margin) / Math.sin(Math.atan(t));
}

/**
 * Distance at which an axis-aligned box, seen from `dir` (target → camera) with `up`, fits inside a free
 * rectangle `spanW` × `spanH` px of a canvas `canvasH` tall, leaving `margin` of it. Tighter than fitting
 * the bounding sphere: a standing body is tall and narrow, and its sphere wastes most of a wide or
 * portrait screen.
 */
export function fitBoxDistance(lo: readonly number[], hi: readonly number[], dir: THREE.Vector3, up: THREE.Vector3, fovDeg: number, spanW: number, spanH: number, canvasH: number, margin = 0.96): number {
  const t = Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2) / Math.max(canvasH, 1);
  const tanV = t * spanH * margin, tanH = t * spanW * margin;
  const z = dir.clone().normalize();
  const x = new THREE.Vector3().crossVectors(up, z);
  if (x.lengthSq() < 1e-8) x.set(1, 0, 0);
  x.normalize();
  const y = new THREE.Vector3().crossVectors(z, x);
  const c = new THREE.Vector3((lo[0]! + hi[0]!) / 2, (lo[1]! + hi[1]!) / 2, (lo[2]! + hi[2]!) / 2);
  const v = new THREE.Vector3();
  let d = 0;
  for (let i = 0; i < 8; i++) {
    v.set(i & 1 ? hi[0]! : lo[0]!, i & 2 ? hi[1]! : lo[1]!, i & 4 ? hi[2]! : lo[2]!).sub(c);
    const pz = v.dot(z);
    d = Math.max(d, pz + Math.abs(v.dot(x)) / tanH, pz + Math.abs(v.dot(y)) / tanV);
  }
  return d;
}

/** Screen space (px) covered by floating panels; the model is framed in what is left. */
export interface ViewInsets { left: number; right: number; top: number; bottom: number }

interface Flight {
  fromPos: THREE.Vector3; toPos: THREE.Vector3;
  fromTarget: THREE.Vector3; toTarget: THREE.Vector3;
  fromUp: THREE.Vector3; toUp: THREE.Vector3;
  t: number; duration: number;
}

type Controls = THREE.EventDispatcher<{ start: object }> & { target: THREE.Vector3; update(): void };

/**
 * Moves the camera when the lab state asks for it (preset, focus, reset). Frames the focus
 * structures, or the whole model when there is no focus, from the preset's direction, centred in the
 * part of the screen the panels leave free. Animated unless the reader prefers reduced motion.
 * After a resize or a panel opening it re-frames at once, unless the reader has moved the camera.
 */
export function CameraRig({ reducedMotion, insets }: { reducedMotion: boolean; insets: ViewInsets }) {
  const { def, state } = useLab();
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const controls = useThree((s) => s.controls) as unknown as Controls | null;
  const size = useThree((s) => s.size);
  const invalidate = useThree((s) => s.invalidate);
  const flight = useRef<Flight | null>(null);
  const userMoved = useRef(false);
  const lastNonce = useRef<number | null>(null);

  // Shift the projection centre into the free area between the panels.
  useEffect(() => {
    const dx = (insets.left - insets.right) / 2;
    const dy = (insets.top - insets.bottom) / 2;
    if (dx === 0 && dy === 0) camera.clearViewOffset();
    else camera.setViewOffset(size.width, size.height, -dx, -dy, size.width, size.height);
    camera.updateProjectionMatrix();
    invalidate();
  }, [camera, size.width, size.height, insets.left, insets.right, insets.top, insets.bottom, invalidate]);

  useEffect(() => {
    if (!controls) return;
    const onStart = () => { userMoved.current = true; flight.current = null; };
    controls.addEventListener('start', onStart);
    return () => controls.removeEventListener('start', onStart);
  }, [controls]);

  useEffect(() => {
    if (!controls) return;
    const isRequest = lastNonce.current !== state.camera.nonce;
    // A resize or panel change only re-frames a camera the reader has not moved.
    if (!isRequest && userMoved.current) return;
    lastNonce.current = state.camera.nonce;
    if (isRequest) userMoved.current = false;

    const mode = effectiveMode(def, state);
    const close = effectiveCloseUp(def, state);
    if (close) {
      // A close-up frames its own scene, straight from the front.
      const fr = closeUpFrame(def, close);
      const target = new THREE.Vector3(...fr.centre);
      const dir = new THREE.Vector3(0, 0, 1);
      const freeW = Math.max(size.width - insets.left - insets.right, 120);
      const freeH = Math.max(size.height - insets.top - insets.bottom, 120);
      const distance = fitDistanceInRect(fr.radius, camera.fov, Math.min(freeW, freeH), size.height);
      flight.current = {
        fromPos: camera.position.clone(), toPos: target.clone().addScaledVector(dir, distance),
        fromTarget: controls.target.clone(), toTarget: target,
        fromUp: camera.up.clone(), toUp: new THREE.Vector3(0, 1, 0),
        t: 0, duration: reducedMotion ? 0 : isRequest ? 0.9 : 0.35,
      };
      invalidate();
      return;
    }
    const preset = def.cameraPresets.find((c) => c.id === state.camera.preset) ?? def.cameraPresets[0]!;
    const around = state.camera.around;
    const box = (around ? [[around[0]! - around[3]!, around[1]! - around[3]!, around[2]! - around[3]!], [around[0]! + around[3]!, around[1]! + around[3]!, around[2]! + around[3]!]] as const : null)
      ?? (state.camera.focus.length ? boundsOfIds(def, state.camera.focus) : null) ?? homeBounds(def, mode);
    const lo = new THREE.Vector3(...box[0]), hi = new THREE.Vector3(...box[1]);
    const target = lo.clone().add(hi).multiplyScalar(0.5);
    const radius = Math.max(lo.distanceTo(hi) / 2, 0.01);
    const dir = new THREE.Vector3(...preset.direction).normalize();
    const toUp = new THREE.Vector3(...(preset.up ?? [0, 1, 0]));
    const freeW = Math.max(size.width - insets.left - insets.right, 120);
    const freeH = Math.max(size.height - insets.top - insets.bottom, 120);
    // A region (`around`) is a sphere; structures are framed by their box, never closer than 2 cm across.
    const distance = around
      ? fitDistanceInRect(radius, camera.fov, Math.min(freeW, freeH), size.height)
      : Math.max(fitBoxDistance(box[0], box[1], dir, toUp, camera.fov, freeW, freeH, size.height), fitDistanceInRect(0.02, camera.fov, Math.min(freeW, freeH), size.height));
    const toPos = target.clone().addScaledVector(dir, distance);
    flight.current = {
      fromPos: camera.position.clone(), toPos,
      fromTarget: controls.target.clone(), toTarget: target,
      fromUp: camera.up.clone(), toUp,
      t: 0, duration: reducedMotion ? 0 : isRequest ? 0.7 : 0.35,
    };
    invalidate();
  }, [state.camera.nonce, state.mode, state.tourIndex, state.closeUp, controls, def, camera, reducedMotion, invalidate, size.width, size.height, insets.left, insets.right, insets.top, insets.bottom]);

  useFrame((_, dt) => {
    const f = flight.current;
    if (!f || !controls) return;
    f.t = f.duration === 0 ? 1 : Math.min(1, f.t + dt / f.duration);
    const k = f.t < 0.5 ? 4 * f.t ** 3 : 1 - (-2 * f.t + 2) ** 3 / 2; // ease in-out cubic
    camera.position.lerpVectors(f.fromPos, f.toPos, k);
    controls.target.lerpVectors(f.fromTarget, f.toTarget, k);
    camera.up.lerpVectors(f.fromUp, f.toUp, k).normalize();
    camera.lookAt(controls.target);
    controls.update();
    if (f.t >= 1) flight.current = null;
    invalidate();
  });

  return null;
}
