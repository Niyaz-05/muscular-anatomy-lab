import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import * as THREE from 'three';
import { fibreCoords, principalAxes } from '../../src/viewer/fibres';
import { fitBoxDistance, fitDistanceInRect } from '../../src/viewer/CameraRig';
import { baseColour, realLook, tendonColour } from '../../src/viewer/palette';
import { definition as def } from '../../src/lab/definition';

/** A tapering cylinder along y (a fusiform muscle): rings of `around` points at `rings` heights. */
function spindle(length = 0.2, radius = 0.02, rings = 21, around = 16) {
  const out: number[] = [];
  for (let j = 0; j < rings; j++) {
    const y = -length / 2 + (length * j) / (rings - 1);
    const r = radius * (0.25 + 0.75 * Math.sin((Math.PI * j) / (rings - 1)));
    for (let i = 0; i < around; i++) { const a = (2 * Math.PI * i) / around; out.push(r * Math.cos(a), y, r * Math.sin(a)); }
  }
  return Float32Array.from(out);
}

describe('fibre coordinates', () => {
  it('run along the muscle: the along coordinate follows its long axis, the across ones its cross-section', () => {
    const pos = spindle();
    const f = fibreCoords(pos, 'test-muscle');
    expect(f.length).toBe((pos.length / 3) * 4);
    // Along: increases (or decreases) monotonically with height, by about the length.
    const along = (i: number) => f[i * 4 + 2]!;
    const first = along(0), last = along(pos.length / 3 - 1);
    expect(Math.abs(last - first)).toBeGreaterThan(0.15);
    expect(Math.abs(last - first)).toBeLessThan(0.25);
    // Across: points of one ring share an along coordinate but spread across.
    const ring = Array.from({ length: 16 }, (_, i) => 10 * 16 + i);
    const s = ring.map(along);
    expect(Math.max(...s) - Math.min(...s)).toBeLessThan(0.003);
    const u = ring.map((i) => f[i * 4]!);
    expect(Math.max(...u) - Math.min(...u)).toBeGreaterThan(0.02);
    for (const x of f) expect(Number.isFinite(x)).toBe(true);
  });
  it('say how squarely the surface faces along the fibres', () => {
    const pos = spindle();
    // Normals of the spindle's side point outwards from the axis: they lie across the fibres.
    const normals = Float32Array.from(pos, (v, i) => (i % 3 === 1 ? 0 : v));
    const f = fibreCoords(pos, 'test-muscle', normals);
    expect(f[10 * 16 * 4 + 3]!).toBeLessThan(0.1);
    const capped = fibreCoords(pos, 'test-muscle', Float32Array.from(pos, (_, i) => (i % 3 === 1 ? 1 : 0)));
    expect(capped[10 * 16 * 4 + 3]!).toBeGreaterThan(0.9);
  });
  it('converge where the muscle narrows into its tendon (but not without limit)', () => {
    const f = fibreCoords(spindle(), 'test-muscle');
    const spread = (j: number) => { const u = Array.from({ length: 16 }, (_, i) => f[(j * 16 + i) * 4]!); return Math.max(...u) - Math.min(...u); };
    // The tip ring is a quarter as wide as the belly; its across coordinates are stretched towards the belly's.
    expect(spread(0) / spread(10)).toBeGreaterThan(0.5);
    expect(spread(0) / spread(10)).toBeLessThan(1.5);
  });
  it('run round a ring muscle', () => {
    const pos: number[] = [];
    for (let i = 0; i < 64; i++) { const a = (2 * Math.PI * i) / 64; pos.push(0.025 * Math.cos(a), 0.015 * Math.sin(a), 0.001 * (i % 2)); }
    const f = fibreCoords(Float32Array.from(pos), 'orbicularis-oris');
    // Along = arc length: neighbours differ by about the spacing round the ring.
    const step = Math.abs(f[5 * 4 + 2]! - f[4 * 4 + 2]!);
    expect(step).toBeGreaterThan(0.001);
    expect(step).toBeLessThan(0.004);
  });
  it('finds the principal axis', () => {
    const { axes } = principalAxes(spindle());
    expect(Math.abs(axes[0][1])).toBeGreaterThan(0.99);
  });
});

describe('the baked tendon mask', async () => {
  const doc = await new NodeIO().readBinary(new Uint8Array(fs.readFileSync(path.join(__dirname, '../../public/models/muscles.glb'))));
  const share = (id: string, where?: (p: number[]) => boolean) => {
    const prim = doc.getRoot().listNodes().find((n) => n.getName() === id)!.getMesh()!.listPrimitives()[0]!;
    const t = prim.getAttribute('_TISSUE')!.getArray()!, p = prim.getAttribute('POSITION')!.getArray()!;
    let sum = 0, n = 0;
    for (let v = 0; v < t.length / 4; v++) {
      if (where && !where([p[v * 3]!, p[v * 3 + 1]!, p[v * 3 + 2]!])) continue;
      sum += t[v * 4 + 3]! / 255; n++;
    }
    return sum / n;
  };
  it('marks the long tendons of the forearm and leg, and leaves bellies fleshy', () => {
    // The finger flexors end in long tendons at the wrist and in the hand; the biceps belly is muscle.
    expect(share('flexor-digitorum-superficialis-left', (p) => p[1]! < -0.05)).toBeGreaterThan(0.5);
    expect(share('flexor-digitorum-superficialis-left', (p) => p[1]! > 0.1)).toBeLessThan(0.2);
    expect(share('tibialis-anterior-left', (p) => p[1]! < -0.65)).toBeGreaterThan(0.5);
    expect(share('gluteus-maximus-left')).toBeLessThan(0.15);
    expect(share('vastus-lateralis-left')).toBeLessThan(0.25);
  });
  it('marks the aponeuroses: the galea, the rectus sheath and the thoracolumbar fascia', () => {
    const top = Math.max(...(doc.getRoot().listNodes().find((n) => n.getName() === 'occipitofrontalis-left')!.getMesh()!.listPrimitives()[0]!.getAttribute('POSITION')!.getArray() as Float32Array).filter((_, i) => i % 3 === 1));
    expect(share('occipitofrontalis-left', (p) => p[1]! > top - 0.01)).toBeGreaterThan(0.8);
    expect(share('external-oblique-left', (p) => Math.abs(p[0]!) < 0.04 && p[1]! > 0.1 && p[1]! < 0.3)).toBeGreaterThan(0.4);
    expect(share('external-oblique-left', (p) => Math.abs(p[0]!) > 0.12)).toBeLessThan(0.2);
    expect(share('latissimus-dorsi-left', (p) => Math.abs(p[0]!) < 0.05 && p[1]! < 0.2)).toBeGreaterThan(0.7);
  });
});

describe('real look and framing', () => {
  const s = (id: string) => def.structures.find((x) => x.id === id)!;
  it('gives muscles a deep red with fibres and tendons a pale colour, and varies neighbours', () => {
    const m = new THREE.Color(realLook(s('biceps-brachii-long-head-left')).color);
    expect(m.r).toBeGreaterThan(m.g * 2);
    expect(realLook(s('biceps-brachii-long-head-left')).fibre).toBeGreaterThan(0);
    const t = new THREE.Color(tendonColour(s('biceps-brachii-long-head-left')));
    expect(t.g).toBeGreaterThan(0.75);
    expect(realLook(s('biceps-brachii-long-head-left')).color).not.toBe(realLook(s('brachialis-left')).color);
    expect(baseColour(s('calcaneal-tendon-left'), 'real')).toBe(tendonColour(s('calcaneal-tendon-left')));
  });
  it('frames a tall narrow box closer than its bounding sphere would', () => {
    const lo = [-0.5, -0.87, -0.15], hi = [0.5, 0.87, 0.15];
    const dir = new THREE.Vector3(0, 0, 1), up = new THREE.Vector3(0, 1, 0);
    const box = fitBoxDistance(lo, hi, dir, up, 32, 400, 700, 800);
    const sphere = fitDistanceInRect(Math.hypot(1, 1.74, 0.3) / 2, 32, 400, 800);
    expect(box).toBeLessThan(sphere);
    // and still fits: the top corner projects inside the free height.
    const t = Math.tan(THREE.MathUtils.degToRad(16)) * (700 / 800);
    expect(0.87 / (box - 0.15)).toBeLessThanOrEqual(t * 1.0001);
  });
});
