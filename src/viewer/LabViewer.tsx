import { Component, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, useGLTF, useProgress } from '@react-three/drei';
import * as THREE from 'three';
import { useLab } from '../app/LabContext';
import { isTouch } from '../app/layout';
import { BoneBackdrop, MuscleModel, modelUrl, type ModelView } from './MuscleModel';
import { CameraRig, type ViewInsets } from './CameraRig';
import { CloseUps } from './CloseUps';
import { Lighting } from './Lighting';
import { LabelLayer } from './LabelLayer';
import { hasWebGL, prefersReducedMotion } from './webgl';
import { closeUpFrame, homeBounds } from '../lab/anchors';
import { effectiveBones, effectiveCloseUp, effectiveExercise, effectiveInside, effectiveInjury, effectiveMode, effectivePose, type LabState } from '../app/state';
import type { SimulationDefinition } from '../contract/schema';
import { rolesForPose } from '../lab/muscle-data';
import { activityFor, driveFor, WORKING } from '../lab/exercise';
import { disorderById } from '../lab/disorders';

class SceneBoundary extends Component<{ onError: (e: Error) => void; children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override componentDidCatch(error: Error) {
    this.props.onError(error);
  }
  override render() {
    return this.state.failed ? null : this.props.children;
  }
}

function LoadingOverlay() {
  const { active, progress } = useProgress();
  if (!active) return null;
  return (
    <div className="viewer-status" role="status">
      <div className="spinner" aria-hidden="true" />
      Loading the model… {Math.round(progress)}%
    </div>
  );
}

/** Keyboard camera control: arrows orbit, +/- zoom. Esc and 0 are handled by the lab shell. */
function KeyboardOrbit({ host }: { host: React.RefObject<HTMLDivElement | null> }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as unknown as { target: THREE.Vector3; update(): void } | null;
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    const el = host.current;
    if (!el || !controls) return;
    const onKey = (e: KeyboardEvent) => {
      const step = Math.PI / 18;
      const offset = camera.position.clone().sub(controls.target);
      const sph = new THREE.Spherical().setFromVector3(offset);
      if (e.key === 'ArrowLeft') sph.theta -= step;
      else if (e.key === 'ArrowRight') sph.theta += step;
      else if (e.key === 'ArrowUp') sph.phi = Math.max(0.05, sph.phi - step);
      else if (e.key === 'ArrowDown') sph.phi = Math.min(Math.PI - 0.05, sph.phi + step);
      else if (e.key === '+' || e.key === '=') sph.radius *= 0.85;
      else if (e.key === '-' || e.key === '_') sph.radius /= 0.85;
      else return;
      e.preventDefault();
      camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(sph));
      camera.lookAt(controls.target);
      controls.update();
      invalidate();
    };
    el.addEventListener('keydown', onKey);
    return () => el.removeEventListener('keydown', onKey);
  }, [host, camera, controls, invalidate]);
  return null;
}

const NONE = new Set<string>();

/** What the model shows for the simulation state (pure apart from the definition's ids). */
export function modelView(def: SimulationDefinition, state: LabState): ModelView {
  const mode = effectiveMode(def, state);
  const pose = effectivePose(def, state);
  const muscles = def.structures.filter((s) => s.kind === 'mesh' && s.muscle);
  let roles: ModelView['roles'] = null;
  let working: ModelView['working'] = null;
  let injured: ReadonlySet<string> = NONE;
  if (mode === 'movement') {
    const r = rolesForPose(pose, muscles.map((s) => ({ id: s.id, muscle: s.muscle!.name, side: s.side })));
    roles = r.size ? r : null;
  } else if (mode === 'exercise') {
    const ex = effectiveExercise(def, state);
    const set = WORKING[activityFor(ex.activity, ex.demand)] ?? {};
    const drive = driveFor(ex.demand) / 100;
    const map = new Map<string, number>();
    for (const s of muscles) {
      const w = set[s.muscle!.name];
      if (w !== undefined) map.set(s.id, Math.min(1, w * (0.35 + 0.65 * drive)));
    }
    working = map;
  } else if (mode === 'injury') {
    const ids = new Set<string>();
    const d = disorderById(effectiveInjury(def, state).id);
    for (const id of d?.sites ?? []) { ids.add(id); ids.add(id.replace(/-left$/, '-right')); }
    // A part's group stands for its parts; expand to the structures that exist as meshes.
    const mesh = new Set(muscles.map((s) => s.id));
    const expanded = new Set<string>();
    for (const id of ids) {
      if (mesh.has(id)) expanded.add(id);
      else for (const m of def.structures.find((x) => x.id === id)?.members ?? []) expanded.add(m);
    }
    injured = expanded;
  }
  return { pose, roles, working, injured, bones: effectiveBones(def, state) };
}

const NO_INSETS: ViewInsets = { left: 0, right: 0, top: 0, bottom: 0 };

export function LabViewer({ insets = NO_INSETS }: { insets?: ViewInsets }) {
  const { def, state, dispatch } = useLab();
  const [webgl] = useState(hasWebGL);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [ready, setReady] = useState(false);
  const onReady = useCallback(() => setReady(true), []);
  const [reducedMotion, setReducedMotion] = useState(prefersReducedMotion);
  const host = useRef<HTMLDivElement>(null);
  const labels = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(mq.matches);
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  const mode = effectiveMode(def, state);
  const close = effectiveCloseUp(def, state);
  const view = useMemo(() => modelView(def, state), [def, state]);
  const inside = effectiveInside(def, state);
  const animating = !!close && state.playing && !reducedMotion;
  const bonesLook = effectiveBones(def, state);
  if (!webgl) {
    return (
      <div className="viewer viewer-fallback" role="note">
        <h2>3D view unavailable</h2>
        <p>This browser or device could not start WebGL, which the 3D model needs. You can still use the structure list, search and explanations, and the movement, muscle, exercise and disorder panels.</p>
        <p className="muted">To get the 3D view, turn on hardware acceleration in your browser settings or try another browser.</p>
      </div>
    );
  }

  const [lo, hi] = homeBounds(def, mode);
  const radius = new THREE.Vector3(...lo).distanceTo(new THREE.Vector3(...hi)) / 2;
  const modelRadius = Math.max(radius, 0.06);
  const closeRadius = close ? closeUpFrame(def, close).radius : 0;

  return (
    <div
      className="viewer"
      ref={host}
      tabIndex={0}
      data-ready={ready && !error ? 'true' : 'false'}
      data-close-up={close ?? 'none'}
      aria-label="3D model of the human muscles. Drag to rotate, scroll or pinch to zoom, right-drag to pan. Arrow keys rotate, plus and minus zoom."
    >
      {error ? (
        <div className="viewer-status is-error" role="alert">
          <strong>The 3D model could not be loaded.</strong>
          <span className="muted">{error}</span>
          <button
            type="button"
            onClick={() => {
              // The loader caches a failed request; drop it so the retry really fetches again.
              useGLTF.clear(modelUrl());
              setError(null);
              setReady(false);
              setAttempt((n) => n + 1);
            }}
          >
            Try again
          </button>
        </div>
      ) : (
        <SceneBoundary key={attempt} onError={(e) => setError(e.message || 'Unknown error')}>
          <Canvas
            frameloop={animating ? 'always' : 'demand'}
            // Phones and tablets: a lower pixel ratio keeps the frame rate up on small GPUs.
            dpr={isTouch() ? [1, 1.5] : [1, 2]}
            camera={{ fov: 32, near: 0.0005, far: 20, position: [0, 0, radius * 4] }}
            gl={{ antialias: true, alpha: true, stencil: true, powerPreference: 'high-performance' }}
            onPointerMissed={(e) => {
              if (e.type !== 'click') return;
              dispatch({ type: 'hover', id: null });
              // On a touch screen there is no Esc key: a tap on empty space closes the details.
              if (isTouch() && state.selected && state.mode !== 'tour') dispatch({ type: 'select', id: state.selected });
            }}
            onCreated={({ gl }) => {
              gl.localClippingEnabled = true;
              gl.domElement.addEventListener('webglcontextlost', (ev) => {
                ev.preventDefault();
                setError('The graphics context was lost (the GPU may have been reset).');
              });
            }}
            aria-hidden="true"
          >
            <Lighting />
            <Suspense fallback={null}>
              <MuscleModel onReady={onReady} view={view} />
            </Suspense>
            {!close && bonesLook !== 'off' && (
              <Suspense fallback={null}>
                <BoneBackdrop pose={view.pose} look={bonesLook} />
              </Suspense>
            )}
            {close && <CloseUps def={def} which={close} playing={state.playing} reducedMotion={reducedMotion} inside={inside} />}
            <OrbitControls
              makeDefault
              enableDamping={!reducedMotion}
              dampingFactor={0.12}
              minDistance={close ? closeRadius * 0.4 : radius * 0.02}
              maxDistance={close ? closeRadius * 8 : modelRadius * 5}
              zoomToCursor
              rotateSpeed={0.8}
            />
            <CameraRig reducedMotion={reducedMotion} insets={insets} />
            <KeyboardOrbit host={host} />
            <LabelLayer container={labels} />
          </Canvas>
          <LoadingOverlay />
        </SceneBoundary>
      )}
      <div className="label-layer" ref={labels} />
    </div>
  );
}
