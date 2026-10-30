import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import type { CloseUp, SimulationDefinition } from '../contract/schema';
import { closeUpFrame } from '../lab/anchors';

/**
 * Close-ups built in code: magnified scenes drawn where their tissue is while the body is hidden.
 * Scenes are laid out in local units (about −10 … 10) and scaled to the frame. Layouts are
 * deterministic and illustrative, at textbook proportions, not to scale with each other.
 */
const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
function rng(seed: number) { let s = seed; return () => ((s = (s * 16807) % 2147483647) / 2147483647); }
const curve = (pts: THREE.Vector3[]) => new THREE.CatmullRomCurve3(pts, false, 'centripetal');

function Label({ at, children }: { at: THREE.Vector3 | [number, number, number]; children: ReactNode }) {
  return <Html position={at} center zIndexRange={[3, 0]} className="closeup-label" pointerEvents="none">{children}</Html>;
}
function Tube({ points, radius, colour, opacity = 1, emissive = 0.12 }: { points: THREE.Vector3[]; radius: number; colour: string; opacity?: number; emissive?: number }) {
  const g = useMemo(() => new THREE.TubeGeometry(curve(points), Math.max(16, points.length * 8), radius, 8, false), [points, radius]);
  useEffect(() => () => g.dispose(), [g]);
  return (
    <mesh geometry={g} renderOrder={3} raycast={() => null}>
      <meshStandardMaterial color={colour} roughness={0.4} emissive={colour} emissiveIntensity={emissive} transparent={opacity < 1} opacity={opacity} depthWrite={opacity >= 1} />
    </mesh>
  );
}
/** Instanced cells (spheres or other shapes) with their own colours. */
function Cells({ items, geometry, opacity = 1 }: { items: { p: THREE.Vector3; s: number | [number, number, number]; c: string; q?: THREE.Quaternion }[]; geometry: THREE.BufferGeometry; opacity?: number }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ roughness: 0.5, transparent: opacity < 1, opacity, depthWrite: opacity >= 1 }), [opacity]);
  useEffect(() => () => mat.dispose(), [mat]);
  useEffect(() => {
    const m = mesh.current;
    if (!m) return;
    const tmp = new THREE.Object3D(), c = new THREE.Color();
    items.forEach((it, i) => {
      tmp.position.copy(it.p);
      if (typeof it.s === 'number') tmp.scale.setScalar(it.s); else tmp.scale.set(...it.s);
      tmp.quaternion.copy(it.q ?? new THREE.Quaternion()); tmp.updateMatrix();
      m.setMatrixAt(i, tmp.matrix); m.setColorAt(i, c.set(it.c));
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [items]);
  return <instancedMesh ref={mesh} args={[geometry, mat, Math.max(1, items.length)]} raycast={() => null} />;
}
/** Particles running along curves. */
function Particles({ curves, colour, radius, speed, playing, perCurve = 10 }: { curves: THREE.CatmullRomCurve3[]; colour: string; radius: number; speed: number; playing: boolean; perCurve?: number }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const t = useRef(0);
  const geo = useMemo(() => new THREE.SphereGeometry(radius, 8, 6), [radius]);
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ color: colour, toneMapped: false, transparent: true, opacity: 0.95 }), [colour]);
  useEffect(() => () => { geo.dispose(); mat.dispose(); }, [geo, mat]);
  const tmp = useMemo(() => new THREE.Object3D(), []);
  const p = useMemo(() => new THREE.Vector3(), []);
  useFrame((_, dt) => {
    const m = mesh.current;
    if (!m) return;
    if (playing) t.current += Math.min(dt, 0.25) * speed;
    let i = 0;
    for (const c of curves) for (let k = 0; k < perCurve; k++, i++) {
      c.getPointAt((((k / perCurve + t.current) % 1) + 1) % 1, p);
      tmp.position.copy(p); tmp.updateMatrix(); m.setMatrixAt(i, tmp.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
  });
  return <instancedMesh ref={mesh} args={[geo, mat, Math.max(1, curves.length * perCurve)]} frustumCulled={false} renderOrder={7} />;
}
const SPHERE = new THREE.SphereGeometry(1, 14, 10);

const CYL = new THREE.CylinderGeometry(1, 1, 1, 14, 1);
const MAT = (colour: string, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) => ({ color: colour, roughness: 0.5, ...extra });
/** A rod from a to b (local units). */
function Rod({ a, b, r, colour, opacity = 1 }: { a: [number, number, number]; b: [number, number, number]; r: number; colour: string; opacity?: number }) {
  const { pos, quat, len } = useMemo(() => {
    const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b), d = vb.clone().sub(va);
    return { pos: va.clone().add(vb).multiplyScalar(0.5), len: d.length(), quat: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()) };
  }, [a, b]);
  return (
    <mesh geometry={CYL} position={pos} quaternion={quat} scale={[r, len, r]} raycast={() => null}>
      <meshStandardMaterial {...MAT(colour, { transparent: opacity < 1, opacity, depthWrite: opacity >= 1 })} />
    </mesh>
  );
}

// ── The sarcomere: thick and thin filaments sliding, at a chosen length ────
/** One micrometre of sarcomere is this many local units. */
const UM = 5.2;
const ROWS = [-6, -3, 0, 3, 6];
function SarcomereScene({ lengthUm, playing, active }: { lengthUm: number; playing: boolean; active: boolean }) {
  const half = (lengthUm * UM) / 2;
  const thin = 1.0 * UM, thick = 1.6 * UM;
  const heads = useRef<THREE.InstancedMesh>(null);
  const clock = useRef(0);
  // Heads sit along each thick filament's two halves, away from the bare zone in the middle.
  const slots = useMemo(() => {
    const out: { x: number; y: number; side: number; phase: number }[] = [];
    // Seven heads along each half of a thick filament, alternating either side of it, clear of the bare zone in the middle.
    ROWS.forEach((y, r) => { for (let k = 0; k < 7; k++) for (const side of [-1, 1]) out.push({ x: side * (0.9 + k * ((thick / 2 - 1.2) / 6)), y, side, phase: (k * 0.9 + r * 1.3 + (side > 0 ? 1 : 0)) % 6.28 }); });
    return out;
  }, [thick]);
  const tmp = useMemo(() => new THREE.Object3D(), []);
  const headGeo = useMemo(() => new THREE.SphereGeometry(0.24, 8, 6), []);
  const headMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#d9533f', roughness: 0.4 }), []);
  useEffect(() => () => { headGeo.dispose(); headMat.dispose(); }, [headGeo, headMat]);
  useFrame((_, dt) => {
    const m = heads.current;
    if (!m) return;
    if (playing && active) clock.current += Math.min(dt, 0.25) * 2.2;
    slots.forEach((s, i) => {
      // A head either rests beside the thick filament or reaches out to the thin filament beside it and pulls.
      const reach = active ? 0.5 + 0.5 * Math.sin(clock.current + s.phase) : 0;
      tmp.position.set(s.x - s.side * 0.35 * reach, s.y + (0.85 + 0.65 * reach) * (Math.round(s.x * 10) % 2 === 0 ? 1 : -1), 0.2);
      tmp.updateMatrix();
      m.setMatrixAt(i, tmp.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
  });
  const z = (x: number) => <mesh key={x} position={[x, 0, 0]} raycast={() => null}><boxGeometry args={[0.7, 17, 6]} /><meshStandardMaterial {...MAT('#7a6a5c')} /></mesh>;
  return (
    <group>
      {z(-half)}{z(half)}
      {ROWS.map((y) => (
        <group key={y}>
          <Rod a={[-half, y + 1.5, 0]} b={[-half + thin, y + 1.5, 0]} r={0.28} colour="#e6c46a" />
          <Rod a={[half, y + 1.5, 0]} b={[half - thin, y + 1.5, 0]} r={0.28} colour="#e6c46a" />
          <Rod a={[-half, y - 1.5, 0]} b={[-half + thin, y - 1.5, 0]} r={0.28} colour="#e6c46a" />
          <Rod a={[half, y - 1.5, 0]} b={[half - thin, y - 1.5, 0]} r={0.28} colour="#e6c46a" />
          <Rod a={[-thick / 2, y, 0]} b={[thick / 2, y, 0]} r={0.55} colour="#a8453a" />
        </group>
      ))}
      <instancedMesh ref={heads} args={[headGeo, headMat, slots.length]} frustumCulled={false} raycast={() => null} />
      <Label at={[-half, 10.2, 0]}>Z disc</Label>
      <Label at={[half, 10.2, 0]}>Z disc</Label>
      <Label at={[0, 10.2, 0]}>M line</Label>
      <Label at={[0, -9.6, 0]}>A band: thick (myosin) filaments, 1.6 µm, never change length</Label>
      <Label at={[-half + thin * 0.5, 8.4, 0]}>Thin (actin) filaments</Label>
      <Label at={[-half * 0.55, -11.4, 0]}>{`Sarcomere ${lengthUm.toFixed(2)} µm`}</Label>
    </group>
  );
}

// ── The neuromuscular junction ─────────────────────────────────────────────
function NmjScene({ playing }: { playing: boolean }) {
  const axon = useMemo(() => [v3(-18, 5, 0), v3(-11, 5.4, 0), v3(-6, 4.6, 0)], []);
  const ach = useMemo(() => Array.from({ length: 9 }, (_, i) => curve([v3(-3 + i * 0.9, 2.2, 0), v3(-3 + i * 0.9, 0.6, 0), v3(-3.2 + i * 0.9 + (i % 2) * 0.4, -0.6, 0)])), []);
  const vesicles = useMemo(() => { const r = rng(5); return Array.from({ length: 26 }, () => ({ p: v3(-3 + r() * 7, 2.8 + r() * 2.4, (r() - 0.5) * 4), s: 0.34 + r() * 0.12, c: '#f2c14e' })); }, []);
  return (
    <group>
      {/* muscle fibre surface with junctional folds */}
      <mesh position={[2, -6.5, 0]} raycast={() => null}><boxGeometry args={[36, 9, 12]} /><meshStandardMaterial {...MAT('#b5483f')} /></mesh>
      {Array.from({ length: 8 }, (_, i) => <mesh key={i} position={[-2.6 + i * 1.5, -1.7, 0]} raycast={() => null}><boxGeometry args={[0.55, 1.6, 8]} /><meshStandardMaterial {...MAT('#c9604f')} /></mesh>)}
      {Array.from({ length: 8 }, (_, i) => <mesh key={`r${i}`} position={[-2.3 + i * 1.5, -0.8, 0]} raycast={() => null}><sphereGeometry args={[0.28, 8, 6]} /><meshStandardMaterial {...MAT('#4aa3ff', { emissive: '#4aa3ff', emissiveIntensity: 0.4 })} /></mesh>)}
      {/* the nerve: myelinated axon and its terminal */}
      <Tube points={axon} radius={1.5} colour="#e9e2c8" />
      <mesh position={[1, 4, 0]} scale={[6.2, 2.6, 3]} raycast={() => null}><sphereGeometry args={[1, 28, 18]} /><meshStandardMaterial {...MAT('#e8d28c', { transparent: true, opacity: 0.55 })} /></mesh>
      <Cells items={vesicles} geometry={SPHERE} />
      <Particles curves={ach} colour="#ffd54a" radius={0.22} speed={0.28} playing={playing} perCurve={1} />
      <Label at={[-14, 8.2, 0]}>Motor axon (myelinated)</Label>
      <Label at={[1, 8.6, 0]}>Axon terminal: vesicles of acetylcholine</Label>
      <Label at={[10, 1.4, 0]}>Synaptic cleft</Label>
      <Label at={[10, -2.8, 0]}>Motor end plate: folds studded with ACh receptors</Label>
      <Label at={[10, -9, 0]}>Muscle fibre</Label>
    </group>
  );
}

// ── Fibre types in cross-section, and which units a drive recruits ─────────
function FibreTypesScene({ drive, slow }: { drive: number; slow: number }) {
  const cells = useMemo(() => {
    const r = rng(11), out: { x: number; y: number; type: 'S' | 'FR' | 'FF'; thr: number }[] = [];
    const n = 9;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const x = (i - (n - 1) / 2) * 2.35 + (j % 2 ? 1.17 : 0) - 0.6, y = (j - (n - 1) / 2) * 2.05;
      const u = r() * 100;
      const type = u < slow ? 'S' : u < slow + (100 - slow) * 0.45 ? 'FR' : 'FF';
      out.push({ x, y, type, thr: type === 'S' ? r() * 22 : type === 'FR' ? 18 + r() * 45 : 50 + r() * 50 });
    }
    return out;
  }, [slow]);
  const geo = useMemo(() => new THREE.CylinderGeometry(1, 1, 1, 6, 1), []);
  useEffect(() => () => geo.dispose(), [geo]);
  const items = cells.map((c) => {
    const on = c.thr <= drive;
    const base = c.type === 'S' ? '#9b1d1d' : c.type === 'FR' ? '#e07a6a' : '#f1d9bd';
    return { p: v3(c.x, c.y, 0), s: [1.05, 1, 1.05] as [number, number, number], c: on ? base : '#8d8780', q: new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0)) };
  });
  return (
    <group>
      <Cells items={items} geometry={geo} />
      <Label at={[-11, 11.6, 0]}>Type I (slow, oxidative): dark red</Label>
      <Label at={[-11, 10, 0]}>Type IIa (fast, fatigue-resistant): pink</Label>
      <Label at={[-11, 8.4, 0]}>Type IIx (fast, glycolytic): pale</Label>
      <Label at={[11, -11.5, 0]}>{`Drive ${Math.round(drive)} %: grey fibres are not recruited`}</Label>
    </group>
  );
}

// ── The muscle spindle and the Golgi tendon organ ──────────────────────────
function SpindleScene({ playing }: { playing: boolean }) {
  const fibres = useMemo(() => [-7, -4.5, 4.5, 7].map((y) => [v3(-17, y, 0), v3(17, y, 0)] as [THREE.Vector3, THREE.Vector3]), []);
  const afferent = useMemo(() => curve([v3(-1, 2.4, 0), v3(-4, 6, 0), v3(-9, 9.5, 0)]), []);
  const efferent = useMemo(() => curve([v3(-13, 9, 0), v3(-10, 6, 0), v3(-7, 2.4, 0)]), []);
  const goto = useMemo(() => curve([v3(10, 0, 0), v3(10, 7, 0), v3(10, 10.5, 0)]), []);
  return (
    <group>
      {fibres.map(([a, b], i) => <Rod key={i} a={[a.x, a.y, 0]} b={[b.x, b.y, 0]} r={1.2} colour="#b5483f" />)}
      {/* spindle: a capsule with intrafusal fibres */}
      <mesh position={[-4, 0, 0]} scale={[7.5, 2.3, 2.3]} raycast={() => null}><sphereGeometry args={[1, 28, 16]} /><meshStandardMaterial {...MAT('#e8dcc0', { transparent: true, opacity: 0.45 })} /></mesh>
      <Rod a={[-12, 0.7, 0]} b={[4, 0.7, 0]} r={0.35} colour="#c9604f" />
      <Rod a={[-12, -0.7, 0]} b={[4, -0.7, 0]} r={0.35} colour="#d98a78" />
      <mesh position={[-4, 0.7, 0]} scale={[1.7, 0.9, 0.9]} raycast={() => null}><sphereGeometry args={[1, 14, 10]} /><meshStandardMaterial {...MAT('#8a2f3a')} /></mesh>
      <Tube points={afferent.getPoints(10)} radius={0.22} colour="#4aa3ff" />
      <Tube points={efferent.getPoints(10)} radius={0.2} colour="#ffa43a" />
      <Particles curves={[afferent]} colour="#6fb8ff" radius={0.28} speed={0.35} playing={playing} perCurve={4} />
      {/* Golgi tendon organ in the tendon */}
      <Rod a={[6, 0, 0]} b={[18, 0, 0]} r={2.4} colour="#e9e0cb" />
      {[-1.2, -0.4, 0.4, 1.2].map((y) => <Rod key={y} a={[7, y, 0]} b={[17, y, 0]} r={0.28} colour="#c4b794" />)}
      <Tube points={goto.getPoints(10)} radius={0.22} colour="#3fd2a0" />
      <Particles curves={[goto]} colour="#7be8c4" radius={0.28} speed={0.35} playing={playing} perCurve={3} />
      <Label at={[-4, 4.4, 0]}>Muscle spindle (parallel to the fibres)</Label>
      <Label at={[-9.5, 10.8, 0]}>Ia afferent: reports stretch and its speed</Label>
      <Label at={[-13, 8, 0]}>γ motor neuron</Label>
      <Label at={[11, 5.4, 0]}>Golgi tendon organ (in series with the tendon)</Label>
      <Label at={[10, 11.6, 0]}>Ib afferent: reports tension</Label>
      <Label at={[-12, -9.6, 0]}>Extrafusal fibres</Label>
    </group>
  );
}

// ── The tendon–bone junction ───────────────────────────────────────────────
function TendonScene() {
  const strands = useMemo(() => Array.from({ length: 6 }, (_, i) => (i - 2.5) * 1.6), []);
  return (
    <group>
      <mesh position={[-8, 0, 0]} raycast={() => null}><boxGeometry args={[11, 10, 8]} /><meshStandardMaterial {...MAT('#b5483f')} /></mesh>
      {Array.from({ length: 5 }, (_, i) => <mesh key={i} position={[-2.2, -4 + i * 2, 0]} raycast={() => null}><boxGeometry args={[2.6, 1, 7]} /><meshStandardMaterial {...MAT('#b5483f')} /></mesh>)}
      <mesh position={[3, 0, 0]} raycast={() => null}><boxGeometry args={[7, 8, 7]} /><meshStandardMaterial {...MAT('#ece3cd')} /></mesh>
      {strands.map((y) => <Rod key={y} a={[-0.5, y * 0.6, 3.6]} b={[6.4, y * 0.6, 3.6]} r={0.18} colour="#cdbf9c" />)}
      <mesh position={[7.9, 0, 0]} raycast={() => null}><boxGeometry args={[1.6, 8, 7]} /><meshStandardMaterial {...MAT('#c9dde0')} /></mesh>
      <mesh position={[9.5, 0, 0]} raycast={() => null}><boxGeometry args={[1.6, 8, 7]} /><meshStandardMaterial {...MAT('#e0d8c0')} /></mesh>
      <mesh position={[15, 0, 0]} raycast={() => null}><boxGeometry args={[9.6, 12, 9]} /><meshStandardMaterial {...MAT('#e8dcc0', { roughness: 0.8 })} /></mesh>
      <Label at={[-8, 6.6, 0]}>Muscle fibres</Label>
      <Label at={[-2.2, -7, 0]}>Myotendinous junction: folded, to spread the load</Label>
      <Label at={[3, 5.8, 0]}>Tendon: parallel type I collagen</Label>
      <Label at={[8, -6.2, 0]}>Fibrocartilage (uncalcified, then calcified)</Label>
      <Label at={[15, 7.8, 0]}>Bone (enthesis)</Label>
    </group>
  );
}

// ── Muscle → fascicle → fibre → myofibril ──────────────────────────────────
function FascicleScene() {
  const fibres = useMemo(() => { const r = rng(3), out: { p: THREE.Vector3; s: number; c: string }[] = []; for (let j = -3; j <= 3; j++) for (let i = -3; i <= 3; i++) if (Math.hypot(i, j * 1.1) <= 3.3) out.push({ p: v3(-5 + i * 1.35, j * 1.35, 0), s: 0.62 + r() * 0.06, c: r() < 0.5 ? '#9b1d1d' : '#d9604f' }); return out; }, []);
  const geo = useMemo(() => new THREE.CylinderGeometry(1, 1, 7, 16, 1), []);
  useEffect(() => () => geo.dispose(), [geo]);
  const items = fibres.map((f) => ({ p: f.p, s: [f.s, 1, f.s] as [number, number, number], c: f.c, q: new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0)) }));
  return (
    <group>
      <mesh position={[-5, 0, 0]} rotation={[Math.PI / 2, 0, 0]} raycast={() => null}><cylinderGeometry args={[5.2, 5.2, 7.2, 40, 1, true]} /><meshStandardMaterial {...MAT('#efe6d0', { transparent: true, opacity: 0.35, side: THREE.DoubleSide })} /></mesh>
      <Cells items={items} geometry={geo} />
      {/* one fibre pulled out, with its myofibrils */}
      <group position={[10, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <mesh raycast={() => null}><cylinderGeometry args={[4.2, 4.2, 8, 36, 1, true]} /><meshStandardMaterial {...MAT('#c9604f', { transparent: true, opacity: 0.3, side: THREE.DoubleSide })} /></mesh>
        {Array.from({ length: 19 }, (_, i) => { const a = (i / 19) * Math.PI * 2, r = i < 12 ? 2.6 : 0.9; const ang = i < 12 ? a : (i - 12) * 0.9; return <mesh key={i} position={[Math.cos(ang) * r, 0, Math.sin(ang) * r]} raycast={() => null}><cylinderGeometry args={[0.55, 0.55, 8, 10]} /><meshStandardMaterial {...MAT(i % 2 ? '#a8453a' : '#c0584a')} /></mesh>; })}
      </group>
      <Label at={[-5, 6.4, 0]}>Fascicle: fibres bundled by the perimysium</Label>
      <Label at={[-5, -6.4, 0]}>Fibres wrapped in endomysium</Label>
      <Label at={[10, 5.6, 0]}>One muscle fibre: a cell with hundreds of nuclei</Label>
      <Label at={[10, -5.6, 0]}>Myofibrils: chains of sarcomeres</Label>
    </group>
  );
}

/** The close-up in its frame: magnified scenes scaled to the frame's radius. */
export function CloseUps({ def, which, playing, reducedMotion, inside }: { def: SimulationDefinition; which: CloseUp; playing: boolean; reducedMotion: boolean; inside: { length: number; drive: number; hz: number } }) {
  const fr = closeUpFrame(def, which);
  // Wider scenes are drawn smaller so they fit between the side panels.
  const FIT: Record<CloseUp, number> = { sarcomere: 0.8, nmj: 0.6, 'fibre-types': 0.95, spindle: 0.6, tendon: 0.72, fascicle: 0.72 };
  const k = (fr.radius / 11) * FIT[which];
  const play = playing && !reducedMotion;
  return (
    <group position={fr.centre} scale={k}>
      <hemisphereLight args={['#ffffff', '#806060', 0.6]} />
      {which === 'sarcomere' && <SarcomereScene lengthUm={inside.length} playing={play} active={inside.hz > 0 && inside.length > 1.3 && inside.length < 3.6} />}
      {which === 'nmj' && <NmjScene playing={play} />}
      {which === 'fibre-types' && <FibreTypesScene drive={inside.drive} slow={50} />}
      {which === 'spindle' && <SpindleScene playing={play} />}
      {which === 'tendon' && <TendonScene />}
      {which === 'fascicle' && <FascicleScene />}
    </group>
  );
}
