import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import * as THREE from 'three';
import { definition as def } from '../../src/lab/definition';
import { validateDefinition } from '../../src/contract/validate';
import { APPROVED_ASSETS } from '../../src/contract/assets';
import geometryJson from '../../src/lab/generated/muscles.json';
import provenance from '../../src/lab/generated/muscles-provenance.json';
import { MUSCLES, parseActions, PLEXUS, plexusOf, rolesForPose, describeActions } from '../../src/lab/muscle-data';
import { movementById, POSES } from '../../src/lab/joints';
import { poseMatrices } from '../../src/lab/rig';
import { flatten, pathLengthChangePct } from '../../src/lab/skinning';
import { activeForce, forceAtVelocity, motorUnits, OPTIMAL_VELOCITY, passiveForce, powerAtVelocity, recruit, ripple, SARCOMERE, stimulusTrace, summationState } from '../../src/lab/contraction';
import { ACTIVITIES, activityFor, adaptation, dominantSystem, domsAt, driveFor, energyDuring, glycogenMinutes, timeToExhaustionMin, WORKING } from '../../src/lab/exercise';
import { DISORDERS, mrcReading, readCk, strengthAt } from '../../src/lab/disorders';
import { effectivePose, initialState, isVisible, makeReducer, DISORDER_VIEW } from '../../src/app/state';
import { searchStructures } from '../../src/app/search';
import { SKIN_BONES, depthOf } from '../../src/lab/anchors';

type G = { centroid: number[]; depth: string; ends: [number, number]; side: string; layer: string; triangleCount: number; modelled?: boolean; bones: string[] };
const geometry = Object.fromEntries(Object.entries(geometryJson.structures).filter(([k]) => !k.startsWith('$'))) as unknown as Record<string, G>;
const meshes = def.structures.filter((s) => s.kind === 'mesh');
const reduce = makeReducer(def);

describe('definition and the validation gate', () => {
  it('passes with no errors or warnings', () => {
    const r = validateDefinition(def);
    expect(r.ok).toBe(true);
    expect(r.issues).toEqual([]);
  });
  it('rejects an unapproved asset and a missing left/right partner', () => {
    expect(validateDefinition({ ...def, assets: [{ id: 'nope', role: 'anatomy-model' as const }] }).ok).toBe(false);
    expect(validateDefinition({ ...def, structures: def.structures.filter((s) => s.id !== 'soleus-right') }).ok).toBe(false);
  });
  it('has one mesh structure per model node, and every node a structure', () => {
    expect(meshes.map((s) => s.id).sort()).toEqual([...APPROVED_ASSETS['bp3d-muscles-v1']!.nodes].sort());
    expect(meshes.length).toBe(Object.keys(geometry).length);
  });
  it('puts every sided muscle on its side', () => {
    for (const s of meshes.filter((x) => x.side !== 'midline')) {
      const x = geometry[s.id]!.centroid[0]!;
      if (Math.abs(x) > 0.004) expect(Math.sign(x), s.id).toBe(s.side === 'left' ? 1 : -1);
    }
  });
  it('cites https sources and every cited source exists', () => {
    for (const src of def.sources) if (src.url) expect(src.url.startsWith('https://')).toBe(true);
  });
  it('gives every modelled muscle a note that says so', () => {
    const modelled = meshes.filter((s) => geometry[s.id]!.modelled);
    expect(modelled.length).toBe(27);
    for (const s of modelled) expect(s.modelNote, s.id).toMatch(/odelled/);
  });
  it('checks every tour step and its focus, and lets each kind of view appear', () => {
    expect(def.tour.length).toBeGreaterThanOrEqual(20);
    for (const t of def.tour) for (const f of t.focus) expect(def.structures.some((s) => s.id === f), `${t.id}: ${f}`).toBe(true);
    for (const m of ['movement', 'exercise', 'injury'] as const) expect(def.tour.some((t) => t.mode === m)).toBe(true);
    expect(def.tour.some((t) => t.closeUp === 'sarcomere')).toBe(true);
    expect(def.tour.some((t) => t.slice)).toBe(true);
  });
  it('puts the disorders’ sites on real muscles and gives each a camera', () => {
    for (const d of DISORDERS) {
      for (const s of d.sites) expect(def.structures.some((x) => x.id === s), `${d.id}: ${s}`).toBe(true);
      expect(DISORDER_VIEW[d.id], d.id).toBeTruthy();
    }
  });
  it('knows the muscles every activity uses', () => {
    const names = new Set(meshes.map((s) => s.muscle!.name));
    for (const a of ACTIVITIES) for (const n of Object.keys(WORKING[a.id]!)) expect(names.has(n), `${a.id}: ${n}`).toBe(true);
  });
});

describe('the knowledge table', () => {
  it('covers every muscle of the model, with nerve and blood supply', () => {
    for (const s of meshes) {
      const info = MUSCLES.get(s.muscle!.name);
      expect(info, s.id).toBeTruthy();
      expect(info!.origin.length, s.id).toBeGreaterThan(3);
      expect(info!.blood.length, s.id).toBeGreaterThan(3);
    }
    expect(MUSCLES.size).toBeGreaterThanOrEqual(198);
  });
  it('writes every action with a movement the lab has', () => {
    for (const info of MUSCLES.values()) for (const a of info.actions) expect(movementById(a.movement), `${info.name}: ${a.movement}`).toBeTruthy();
    expect(parseActions('elbow-flex+*, forearm-pron-')).toEqual([{ movement: 'elbow-flex', sign: 1, prime: true }, { movement: 'forearm-pron', sign: -1, prime: false }]);
    expect(parseActions('-')).toEqual([]);
  });
  it('sorts nerves into their families', () => {
    const plex = (n: string) => MUSCLES.get(n)!.plexus;
    expect(plex('biceps brachii')).toBe('brachial');
    expect(plex('deltoid')).toBe('brachial');
    expect(plex('masseter')).toBe('cranial');
    expect(plex('lateral rectus')).toBe('cranial');
    expect(plex('sternocleidomastoid')).toBe('cranial');
    expect(plex('gluteus maximus')).toBe('sacral');
    expect(plex('gastrocnemius')).toBe('sacral');
    expect(plex('vastus lateralis')).toBe('lumbar');
    expect(plex('adductor longus')).toBe('lumbar');
    expect(plex('longissimus thoracis')).toBe('spinal');
    expect(plex('diaphragm')).toBe('cervical');
    expect(plex('rectus abdominis')).toBe('thoracic');
    expect(plex('external intercostal')).toBe('thoracic');
    expect(plexusOf('-', '-')).toBe('none');
    for (const info of MUSCLES.values()) if (info.slow !== null) expect(info.plexus, info.name).not.toBe('none');
    expect(Object.keys(PLEXUS)).toContain('spinal');
  });
  it('describes actions in words, mirrored for the right-hand trunk muscles', () => {
    const d = describeActions('elbow-flex+*, forearm-pron-', 'left');
    expect(d[0]).toMatchObject({ joint: 'Elbow', movement: 'flexion', prime: true });
    expect(d[1]!.movement).toMatch(/supination/);
    const left = describeActions('neck-rot-*', 'left')[0]!.movement, right = describeActions('neck-rot-*', 'right')[0]!.movement;
    expect(left).not.toBe(right);
  });
  it('lists fibre mixes between 0 and 100 and slow muscles where expected', () => {
    for (const info of MUSCLES.values()) if (info.slow !== null) expect(info.slow).toBeGreaterThanOrEqual(30), expect(info.slow).toBeLessThanOrEqual(90);
    expect(MUSCLES.get('soleus')!.slow!).toBeGreaterThan(MUSCLES.get('biceps brachii')!.slow!);
  });
});

describe('the model', () => {
  it('passes the extractor’s checks', () => {
    expect(Object.entries(provenance.checks).filter(([, ok]) => !ok)).toEqual([]);
  });
  it('is light enough for a phone: under 300k triangles and 8 MB', () => {
    const out = provenance.outputs.muscles;
    expect(out.triangles).toBeLessThan(300_000);
    expect(out.bytes).toBeLessThan(8_000_000);
  });
  it('binds every vertex to bones that exist, with weights in 0–1', { timeout: 60_000 }, async () => {
    const doc = await new NodeIO().readBinary(new Uint8Array(fs.readFileSync(path.join(__dirname, '../../public/models/muscles.glb'))));
    let n = 0;
    for (const node of doc.getRoot().listNodes().slice(0, 600)) {
      const prim = node.getMesh()!.listPrimitives()[0]!;
      const skin = prim.getAttribute('_SKIN')!.getArray()!;
      for (let v = 0; v < skin.length; v += 3) {
        expect(skin[v]).toBeGreaterThanOrEqual(0); expect(skin[v]).toBeLessThan(SKIN_BONES.length);
        expect(skin[v + 1]).toBeGreaterThanOrEqual(0); expect(skin[v + 1]).toBeLessThan(SKIN_BONES.length);
        expect(skin[v + 2]).toBeGreaterThanOrEqual(0); expect(skin[v + 2]).toBeLessThanOrEqual(1);
        n++;
      }
    }
    expect(n).toBeGreaterThan(100_000);
  });
  it('sorts muscles into the three depths and puts the big superficial ones outside', () => {
    const count = (d: string) => Object.values(geometry).filter((g) => g.depth === d).length;
    expect(count('superficial')).toBeGreaterThan(80);
    expect(count('intermediate')).toBeGreaterThan(40);
    expect(count('deep')).toBeGreaterThan(20);
    expect(depthOf('trapezius-ascending-part-left') ?? depthOf('deltoid-acromial-part-left')).toBe('superficial');
    expect(depthOf('subscapularis-left')).not.toBe('superficial');
  });
});

describe('roles in a movement', () => {
  const list = meshes.map((s) => ({ id: s.id, muscle: s.muscle!.name, side: s.side }));
  const role = (pose: Record<string, number>, id: string) => rolesForPose(pose, list).get(id);
  it('flexing the left elbow: biceps and brachialis lead, triceps opposes, the right arm is left alone', () => {
    const pose = { 'elbow-flex-left': 90 };
    expect(role(pose, 'brachialis-left')).toBe('prime');
    expect(role(pose, 'biceps-brachii-long-head-left')).toBe('prime');
    expect(role(pose, 'triceps-brachii-long-head-left')).toBe('antagonist');
    expect(role(pose, 'biceps-brachii-long-head-right')).toBeUndefined();
  });
  it('flexing the hip and the knee', () => {
    expect(role({ 'hip-flex-left': 60 }, 'iliacus-left')).toBe('prime');
    expect(role({ 'hip-flex-left': 60 }, 'gluteus-maximus-left')).toBe('antagonist');
    expect(role({ 'knee-flex-left': 60 }, 'semitendinosus-left')).toBe('prime');
    expect(role({ 'knee-flex-left': 60 }, 'vastus-lateralis-left')).toBe('antagonist');
  });
  it('turning the head: a sternocleidomastoid turns the face to the opposite side', () => {
    // neck-rot is negative towards the right; the left sternocleidomastoid turns the face to the right.
    expect(role({ 'neck-rot': -30 }, 'sternocleidomastoid-left')).toBe('prime');
    expect(role({ 'neck-rot': -30 }, 'sternocleidomastoid-right')).toBe('antagonist');
    expect(role({ 'neck-rot': 30 }, 'sternocleidomastoid-right')).toBe('prime');
  });
  it('assigns nothing at rest or for tiny movements', () => {
    expect(rolesForPose({}, list).size).toBe(0);
    expect(rolesForPose({ 'elbow-flex-left': 2 }, list).size).toBe(0);
  });
  it('finds prime movers for every pose', () => {
    for (const p of POSES.filter((x) => x.id !== 'anatomical')) {
      const roles = rolesForPose(p.pose, list);
      expect([...roles.values()].filter((r) => r === 'prime').length, p.id).toBeGreaterThan(4);
    }
  });
});

describe('muscles bend with the bones', async () => {
  const doc = await new NodeIO().readBinary(new Uint8Array(fs.readFileSync(path.join(__dirname, '../../public/models/muscles.glb'))));
  const parts = new Map<string, { rest: Float32Array; skin: Float32Array }>();
  for (const node of doc.getRoot().listNodes()) {
    const prim = node.getMesh()!.listPrimitives()[0]!;
    parts.set(node.getName(), { rest: Float32Array.from(prim.getAttribute('POSITION')!.getArray()!), skin: Float32Array.from(prim.getAttribute('_SKIN')!.getArray()!) });
  }
  const bonesFor = (pose: Record<string, number>) => {
    const m = poseMatrices(SKIN_BONES, pose);
    return flatten(SKIN_BONES.map((b) => m.get(b) ?? new THREE.Matrix4()));
  };
  const change = (id: string, pose: Record<string, number>) => { const p = parts.get(id)!; return pathLengthChangePct(p.rest, p.skin, (geometryJson.structures as unknown as Record<string, { axes: number[][] }>)[id]!.axes[0]!, bonesFor(pose)); };
  it('moves nothing at rest', () => {
    for (const id of ['biceps-brachii-long-head-left', 'gastrocnemius-medial-head-left', 'rectus-femoris-left', 'gluteus-maximus-right']) expect(Math.abs(change(id, {})), id).toBeLessThan(0.01);
  });
  it('elbow flexion shortens the biceps and lengthens the triceps', () => {
    const pose = { 'elbow-flex-left': 120 };
    expect(change('biceps-brachii-long-head-left', pose)).toBeLessThan(-3);
    expect(change('triceps-brachii-long-head-left', pose)).toBeGreaterThan(2);
    expect(Math.abs(change('biceps-brachii-long-head-right', pose))).toBeLessThan(0.5);
  });
  it('knee flexion stretches the rectus femoris and shortens the hamstrings and the calf', () => {
    const pose = { 'knee-flex-left': 100 };
    expect(change('rectus-femoris-left', pose)).toBeGreaterThan(3);
    expect(change('semitendinosus-left', pose)).toBeLessThan(-2);
    expect(change('gastrocnemius-medial-head-left', pose)).toBeLessThan(-2);
  });
  it('hip flexion shortens the iliopsoas and stretches the gluteus maximus and the hamstrings', () => {
    const pose = { 'hip-flex-left': 90 };
    expect(change('iliacus-left', pose)).toBeLessThan(-3);
    expect(change('gluteus-maximus-left', pose)).toBeGreaterThan(5);
    expect(change('semitendinosus-left', pose)).toBeGreaterThan(5);
  });
  it('shoulder abduction shortens the deltoid and stretches the latissimus and the pectoralis major', () => {
    const pose = { 'shoulder-abd-left': 120 };
    expect(change('deltoid-acromial-part-left', pose)).toBeLessThan(-3);
    expect(change('latissimus-dorsi-left', pose)).toBeGreaterThan(5);
    expect(change('pectoralis-major-sternocostal-part-left', pose)).toBeGreaterThan(5);
  });
  it('plantarflexion stretches the muscles on the front of the leg', () => {
    expect(change('tibialis-anterior-left', { 'ankle-flex-left': 40 })).toBeGreaterThan(1);
  });
  it('keeps muscles attached: a bent elbow moves the biceps’ insertion with the radius', () => {
    const p = parts.get('biceps-brachii-long-head-left')!;
    const [a, b] = geometry['biceps-brachii-long-head-left']!.ends;
    const rest = (i: number) => new THREE.Vector3(p.rest[i * 3], p.rest[i * 3 + 1], p.rest[i * 3 + 2]);
    const wrist = poseMatrices(['radius-left'], { 'elbow-flex-left': 120 }).get('radius-left')!;
    // The end of the muscle nearer the forearm travels with the forearm: it ends up closer to where the radius went than to where it was.
    const distal = rest(a).y < rest(b).y ? a : b;
    const posed = new THREE.Vector3(...[0, 1, 2].map((k) => p.rest[distal * 3 + k]!) as [number, number, number]);
    const bones = bonesFor({ 'elbow-flex-left': 120 });
    const out = new THREE.Vector3();
    const ia = p.skin[distal * 3]! * 16, ib = p.skin[distal * 3 + 1]! * 16, w = p.skin[distal * 3 + 2]!;
    const m = (k: number) => bones[ia + k]! * (1 - w) + bones[ib + k]! * w;
    out.set(m(0) * posed.x + m(4) * posed.y + m(8) * posed.z + m(12), m(1) * posed.x + m(5) * posed.y + m(9) * posed.z + m(13), m(2) * posed.x + m(6) * posed.y + m(10) * posed.z + m(14));
    const withRadius = posed.clone().applyMatrix4(wrist);
    expect(out.distanceTo(withRadius)).toBeLessThan(out.distanceTo(posed));
  });
});

describe('contraction', () => {
  it('length–tension: a plateau at 2.0–2.25 µm, zero beyond 3.65 and below 1.27', () => {
    expect(activeForce(2.1)).toBe(1);
    expect(activeForce(SARCOMERE.optimalLow)).toBe(1);
    expect(activeForce(3.65)).toBe(0);
    expect(activeForce(3.9)).toBe(0);
    expect(activeForce(1.2)).toBe(0);
    expect(activeForce(1.67)).toBeCloseTo(0.84, 2);
    expect(activeForce(3.0)).toBeCloseTo(0.46, 1);
    expect(activeForce(1.8)).toBeLessThan(1);
    expect(passiveForce(2.2)).toBe(0);
    expect(passiveForce(3.4)).toBeGreaterThan(passiveForce(3.0));
  });
  it('force–velocity: isometric 1, zero at vmax, more when lengthening, power peaks near a third', () => {
    expect(forceAtVelocity(0)).toBeCloseTo(1, 9);
    expect(forceAtVelocity(1)).toBe(0);
    expect(forceAtVelocity(0.5)).toBeLessThan(forceAtVelocity(0.2));
    expect(forceAtVelocity(-0.5)).toBeGreaterThan(1.5);
    expect(forceAtVelocity(-1)).toBeLessThan(1.81);
    expect(OPTIMAL_VELOCITY).toBeGreaterThan(0.2);
    expect(OPTIMAL_VELOCITY).toBeLessThan(0.4);
    expect(powerAtVelocity(OPTIMAL_VELOCITY)).toBeGreaterThan(powerAtVelocity(0.8));
  });
  it('twitch to tetanus: a single twitch is small, the rate fuses them, slow fibres fuse sooner', () => {
    const one = stimulusTrace(1, 'fast', 400);
    expect(Math.max(...one.force)).toBeLessThan(0.6);
    expect(Math.max(...one.force)).toBeGreaterThan(0.05);
    const fast = (hz: number) => stimulusTrace(hz, 'fast');
    expect(Math.max(...fast(100).force)).toBeGreaterThan(0.95);
    expect(Math.max(...fast(30).force)).toBeGreaterThan(Math.max(...fast(10).force));
    expect(ripple(fast(100))).toBeLessThan(0.08);
    expect(ripple(fast(10))).toBeGreaterThan(0.5);
    expect(ripple(stimulusTrace(20, 'slow'))).toBeLessThan(ripple(stimulusTrace(20, 'fast')));
    expect(summationState(1, 'fast')).toBe('twitch');
    expect(summationState(100, 'fast')).toBe('fused tetanus');
    expect(summationState(20, 'slow')).toMatch(/tetanus/);
    expect(summationState(10, 'fast')).not.toBe('fused tetanus');
  });
  it('size principle: thresholds and force rise together; slow units come first; full drive recruits all', () => {
    const u = motorUnits(60);
    expect(u.types.filter((t) => t === 'S').length).toBe(60);
    for (let i = 1; i < u.thresholds.length; i++) { expect(u.thresholds[i]!).toBeGreaterThanOrEqual(u.thresholds[i - 1]!); expect(u.force[i]!).toBeGreaterThanOrEqual(u.force[i - 1]!); }
    expect(u.types[0]).toBe('S');
    expect(u.types[99]).toBe('FF');
    const low = recruit(u, 10), mid = recruit(u, 50), full = recruit(u, 100);
    expect(low.count).toBeLessThan(mid.count);
    expect(mid.count).toBeLessThan(full.count);
    expect(full.count).toBe(100);
    expect(full.forcePct).toBeGreaterThan(95);
    expect(low.byType.FF).toBe(0);
    expect(low.forcePct).toBeLessThan(mid.forcePct);
    expect(recruit(u, 0).count).toBeLessThanOrEqual(1);
  });
});

describe('exercise', () => {
  const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
  it('a sprint runs on phosphocreatine and glycolysis; a marathon on oxygen', () => {
    const sprint = energyDuring(4, 0.18, 'untrained');
    expect(dominantSystem(sprint)).not.toBe('oxidative');
    expect(sprint.oxidative[sprint.oxidative.length - 1]! / sprint.oxidative[0]!).toBeLessThan(10);
    expect(dominantSystem(energyDuring(0.75, 180, 'untrained'))).toBe('oxidative');
    expect(dominantSystem(energyDuring(1.2, 3.8, 'trained'))).toBe('oxidative');
    expect(sum(energyDuring(2.1, 0.8, 'untrained').glycolysis)).toBeGreaterThan(sum(energyDuring(2.1, 0.8, 'untrained').pcr) * 0.3);
  });
  it('oxygen uptake lags behind the demand and training speeds it', () => {
    const slow = energyDuring(1, 5, 'untrained'), quick = energyDuring(1, 5, 'trained');
    expect(slow.oxidative[3]!).toBeLessThan(slow.oxidative[slow.oxidative.length - 1]!);
    expect(quick.oxidative[8]!).toBeGreaterThan(slow.oxidative[8]!);
  });
  it('critical power: time to exhaustion falls steeply above it and training lengthens it', () => {
    expect(timeToExhaustionMin(0.5, 'untrained')).toBe(Infinity);
    expect(timeToExhaustionMin(1.0, 'untrained')).toBeGreaterThan(2);
    expect(timeToExhaustionMin(1.0, 'untrained')).toBeLessThan(8);
    expect(timeToExhaustionMin(1.0, 'trained')).toBeGreaterThan(timeToExhaustionMin(1.0, 'untrained'));
    expect(timeToExhaustionMin(2, 'untrained')).toBeLessThan(timeToExhaustionMin(1.2, 'untrained'));
    expect(timeToExhaustionMin(4, 'untrained') * 60).toBeLessThan(30);
  });
  it('a demand that cannot be met is flagged as exhausted before it ends', () => {
    expect(energyDuring(4, 5, 'untrained').exhaustedAtS).not.toBeNull();
    expect(energyDuring(0.5, 30, 'untrained').exhaustedAtS).toBeNull();
  });
  it('glycogen lasts about two hours at 75 % and less when harder', () => {
    expect(glycogenMinutes(0.75)).toBeCloseTo(120, 0);
    expect(glycogenMinutes(0.9)).toBeLessThan(glycogenMinutes(0.75));
    expect(glycogenMinutes(0.2)).toBe(Infinity);
  });
  it('picks the muscles of an activity and the drive it needs', () => {
    expect(activityFor('10k', 5)).toBe('10k');
    expect(activityFor(null, 4)).toBe('sprint');
    expect(activityFor(null, 0.3)).toBe('walk');
    expect(driveFor(4)).toBe(100);
    expect(driveFor(0.3)).toBeLessThan(driveFor(1.2));
    expect(driveFor(0.1)).toBeGreaterThanOrEqual(3);
  });
  it('training: strength gains come from neural drive first, then size; endurance adds mitochondria and VO₂max', () => {
    const early = adaptation('strength', 4), late = adaptation('strength', 24);
    expect(early.neural / late.neural).toBeGreaterThan(early.fibreArea / late.fibreArea);
    expect(late.strength).toBeGreaterThan(20);
    expect(adaptation('strength', 12).strength).toBeGreaterThan(adaptation('endurance', 12).strength);
    expect(adaptation('endurance', 12).mitochondria).toBeGreaterThan(20);
    expect(adaptation('endurance', 12).vo2max).toBeGreaterThan(8);
    expect(adaptation('none', 30)).toMatchObject({ strength: 0, vo2max: 0, mitochondria: 0 });
    expect(adaptation('both', 12).fibreArea).toBeLessThan(adaptation('strength', 12).fibreArea);
    expect(adaptation('strength', 0).strength).toBe(0);
  });
  it('soreness starts late, peaks at about 2 days, fades, and is smaller after a repeat', () => {
    expect(domsAt(0)).toBe(0);
    expect(domsAt(6)).toBeLessThan(domsAt(24));
    const peak = [24, 36, 48, 60, 72].map((h) => domsAt(h));
    expect(Math.max(...peak)).toBeCloseTo(domsAt(48), 1);
    expect(domsAt(168)).toBeLessThan(2);
    expect(domsAt(48, 1, true)).toBeLessThan(domsAt(48) * 0.5);
  });
});

describe('disorders', () => {
  it('recovers strength over time, faster for milder grades', () => {
    const rd = [17, 22, 73] as const;
    for (const g of [1, 2, 3] as const) {
      const T = rd[g - 1]!;
      expect(strengthAt(0, g, rd)).toBeLessThan(strengthAt(T, g, rd));
      expect(strengthAt(T, g, rd)).toBeGreaterThan(0.85);
    }
    expect(strengthAt(0, 1, rd)).toBeGreaterThan(strengthAt(0, 3, rd));
    expect(strengthAt(20, 1, rd)).toBeGreaterThan(strengthAt(20, 3, rd));
  });
  it('reads creatine kinase against the upper limit, by sex', () => {
    expect(readCk(150, 'female').flag).toBe('ok');
    expect(readCk(250, 'male').flag).toBe('ok');
    expect(readCk(250, 'female').flag).toBe('mild');
    expect(readCk(1000, 'male').flag).toBe('mild');
    expect(readCk(2500, 'male').flag).toBe('high');
    expect(readCk(20000, 'male').flag).toBe('severe');
    expect(readCk(20000, 'male').text).toMatch(/kidney/);
    expect(readCk(1500, 'female').times).toBeGreaterThan(readCk(1500, 'male').times);
  });
  it('reads the MRC grade, clamped to 0–5', () => {
    expect(mrcReading(5).label).toBe('Normal');
    expect(mrcReading(3).text).toMatch(/gravity/);
    expect(mrcReading(9).grade).toBe(5);
    expect(mrcReading(-2).grade).toBe(0);
  });
  it('covers the conditions the lab promises, each with a source, tests and a course', () => {
    expect(DISORDERS.length).toBe(13);
    for (const d of DISORDERS) for (const k of ['summary', 'mechanism', 'test', 'course', 'source'] as const) expect(d[k].length, `${d.id}.${k}`).toBeGreaterThan(20);
    expect(DISORDERS.filter((d) => d.graded).length).toBe(2);
  });
});

describe('the reducer', () => {
  const s0 = initialState(def);
  it('starts on the anatomy with every layer and no bones', () => {
    expect(s0.mode).toBe('explore');
    expect(s0.visibleLayers.size).toBe(def.layers.length);
    expect(s0.bones).toBe('off');
  });
  it('shows the bones when movement opens, and poses only in the movement view', () => {
    const s1 = reduce(s0, { type: 'set-mode', mode: 'movement' });
    expect(s1.bones).toBe('ghost');
    const s2 = reduce(s1, { type: 'set-pose', preset: 'squat' });
    expect(Object.keys(effectivePose(def, s2)).length).toBeGreaterThan(3);
    expect(Object.keys(effectivePose(def, reduce(s2, { type: 'set-mode', mode: 'explore' }))).length).toBe(0);
  });
  it('clamps a movement to its range and ignores nonsense', () => {
    const s = reduce(reduce(s0, { type: 'set-mode', mode: 'movement' }), { type: 'set-movement', key: 'elbow-flex-left', value: 400 });
    expect(s.joints.pose['elbow-flex-left']).toBe(150);
    expect(reduce(s, { type: 'set-movement', key: 'elbow-flex-left', value: Number.NaN })).toBe(s);
    expect(reduce(s, { type: 'set-movement', key: 'nonsense-left', value: 10 })).toBe(s);
  });
  it('moves both arms at once with a -both key', () => {
    const s = reduce(s0, { type: 'set-movement', key: 'elbow-flex-both', value: 60 });
    expect(s.joints.pose['elbow-flex-left']).toBe(60);
    expect(s.joints.pose['elbow-flex-right']).toBe(60);
  });
  it('peels the body: superficial muscles go first, deep ones last, a selection stays', () => {
    const superficial = meshes.find((m) => depthOf(m.id) === 'superficial')!.id;
    const deep = meshes.find((m) => depthOf(m.id) === 'deep')!.id;
    expect(isVisible(def, s0, superficial)).toBe(true);
    const p1 = reduce(s0, { type: 'set-peel', value: 1 });
    expect(isVisible(def, p1, superficial)).toBe(false);
    expect(isVisible(def, p1, deep)).toBe(true);
    const p2 = reduce(s0, { type: 'set-peel', value: 2 });
    expect(isVisible(def, p2, deep)).toBe(true);
    expect(isVisible(def, p2, meshes.find((m) => depthOf(m.id) === 'intermediate')!.id)).toBe(false);
    expect(isVisible(def, reduce(p1, { type: 'select', id: superficial }), superficial)).toBe(true);
  });
  it('hides a layer, and the close-up hides the body', () => {
    const id = 'biceps-brachii-long-head-left';
    expect(isVisible(def, reduce(s0, { type: 'toggle-layer', layer: 'arm' }), id)).toBe(false);
    expect(isVisible(def, reduce(s0, { type: 'set-close-up', value: 'sarcomere' }), id)).toBe(false);
  });
  it('turns the camera to a disorder and picks the activity’s numbers', () => {
    const s = reduce(s0, { type: 'set-mode', mode: 'injury' });
    expect(s.camera.preset).toBe('posterior');
    expect(s.camera.focus.length).toBeGreaterThan(0);
    const c = reduce(s, { type: 'set-injury', value: { id: 'compartment' } });
    expect(c.camera.preset).toBe('anterior');
    expect(reduce(c, { type: 'set-injury', value: { id: 'nonsense' } })).toBe(c);
    const e = reduce(s0, { type: 'set-activity', id: 'sprint' });
    expect(e.exercise.demand).toBe(4);
    expect(reduce(e, { type: 'set-exercise', value: { demand: 2 } }).exercise.activity).toBeNull();
  });
  it('keeps settings in range', () => {
    expect(reduce(s0, { type: 'set-inside', value: { length: 9, hz: 500, drive: -5 } }).inside).toMatchObject({ length: 3.8, hz: 100, drive: 0 });
    expect(reduce(s0, { type: 'set-exercise', value: { weeks: 99, minutes: 9999 } }).exercise).toMatchObject({ weeks: 52, minutes: 240 });
    expect(reduce(s0, { type: 'set-injury', value: { ck: -4, mrc: 9, day: 400 } }).injury).toMatchObject({ ck: 0, mrc: 5, day: 180 });
  });
  it('steps through the tour, back and finish', () => {
    let s = reduce(s0, { type: 'set-mode', mode: 'tour' });
    expect(s.tourIndex).toBe(0);
    s = reduce(s, { type: 'tour-go', index: 999 });
    expect(s.tourIndex).toBe(def.tour.length - 1);
    s = reduce(s, { type: 'tour-go', index: 6 });
    expect(Object.keys(effectivePose(def, s)).length).toBeGreaterThan(0);
  });
  it('finds muscles by everyday names', () => {
    const top = (q: string) => searchStructures(def.structures, q, 6).map((h) => h.structure.id);
    expect(top('biceps')).toEqual(expect.arrayContaining(['biceps-brachii-left']));
    expect(top('quads')).toEqual(expect.arrayContaining(['quadriceps-left']));
    expect(top('hamstrings').some((id) => id.startsWith('hamstrings'))).toBe(true);
    expect(top('achilles')).toEqual(expect.arrayContaining(['calcaneal-tendon-left']));
    expect(top('lats').some((id) => id.startsWith('latissimus'))).toBe(true);
    expect(top('six pack').some((id) => id.startsWith('rectus-abdominis'))).toBe(true);
    expect(top('zzzz')).toEqual([]);
  });
});
