import type { AnatomicalStructure } from '../contract/schema';
import type { ColourBy } from '../app/state';
import { depthOf } from '../lab/anchors';
import { PLEXUS, type Role } from '../lab/muscle-data';
import type { TissueLook } from './tissue';

/**
 * Real looks, like a fresh dissection: deep, slightly brownish red muscle with a moist sheen and fascicles
 * running along it, each muscle a little lighter or darker and warmer or cooler than its neighbours so
 * their edges can be read; glossy, pearly off-white tendon and aponeurosis where the muscle ends.
 */
/** Tendon and aponeurosis: pearly off-white. */
export const TENDON_COLOUR = '#e6dfcd';
const MUSCLE: TissueLook = {
  color: '#8f3a33', roughness: 0.6, clearcoat: 0.28, clearcoatRoughness: 0.38, sheen: 0.3, sheenColor: '#ffb7a8', rim: 0.16, rimColor: '#ff7a64', ao: 0.95, mottle: 0.32, mottleTint: '#6a2420',
  tendon: 1, tendonColor: TENDON_COLOUR, tendonRoughness: 0.3, fibre: 0.55, fibreScale: 0.006, edge: 0.45,
};
const TENDON: TissueLook = { color: TENDON_COLOUR, roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.15, sheen: 0.5, sheenColor: '#ffffff', rim: 0.15, rimColor: '#f4f1e8', ao: 0.7, mottle: 0.18, mottleTint: '#c6bca4', tendon: 1, tendonColor: TENDON_COLOUR, fibre: 0.12, fibreScale: 0.003 };

const hash = (id: string, salt = 0) => { let h = 2166136261 ^ salt; for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619); h = Math.imul(h ^ (h >>> 15), 2246822507); return ((h >>> 0) % 1000) / 1000; };
/** A colour a little lighter or darker (t: 0–1) and a little warmer or cooler (u: 0–1). */
const shade = (hex: string, t: number, u = 0.5) => {
  const n = parseInt(hex.slice(1), 16);
  const k = 0.84 + t * 0.32;
  const warm = (u - 0.5) * 0.12; // ±6 %: towards orange-brown or towards crimson
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((x, i) => Math.max(0, Math.min(255, Math.round(x * k * (i === 1 ? 1 + warm : i === 2 ? 1 - warm : 1)))));
  return `#${c.map((x) => x.toString(16).padStart(2, '0')).join('')}`;
};
export const isTendon = (s: AnatomicalStructure) => s.muscle?.slow === undefined;

export function realLook(s: AnatomicalStructure): TissueLook {
  if (isTendon(s)) return TENDON;
  const look = s.layer === 'face' || s.layer === 'tongue-larynx' ? { ...MUSCLE, color: '#9c4640' } : s.layer === 'eye' ? { ...MUSCLE, color: '#a8524b' } : MUSCLE;
  return { ...look, color: shade(look.color, hash(s.id), hash(s.id, 7)) };
}
/** The colour the tendon parts of a structure take in its real look. */
export function tendonColour(s: AnatomicalStructure): string {
  return isTendon(s) ? realLook(s).color : shade(TENDON_COLOUR, 0.4 + 0.3 * hash(s.id, 3));
}
/** Muscles use no lobule texture. */
export function lobules(_s: AnatomicalStructure): { scale: number; depth: number } | null {
  return null;
}
/** How see-through each structure is in its real look (1 = opaque). */
export function realOpacity(_s: AnatomicalStructure): number {
  return 1;
}

/** One hue per region (Colour: Regions). */
export const LAYER_COLOUR: Record<string, string> = {
  eye: '#7c5cc4', 'tongue-larynx': '#c46aa6', face: '#e07aa0', neck: '#2fa4b8', back: '#4a73c4', thorax: '#d06090', abdomen: '#e0a040', 'pelvic-floor': '#9a6a4a',
  shoulder: '#e0803a', arm: '#d8b040', forearm: '#7ab648', hand: '#3fb8a0', hip: '#c8443b', thigh: '#49a35f', leg: '#5a8ae0', foot: '#a07ad8',
};
export const DEPTH_COLOUR = { superficial: '#e8765c', intermediate: '#e2b84a', deep: '#5b84c8' } as const;
export const DEPTH_TEXT = { superficial: 'Superficial', intermediate: 'Intermediate', deep: 'Deep' } as const;
/** Fibre type: fast-twitch muscles pale and glycolytic, slow-twitch deep red (myoglobin and mitochondria). */
export function fibreColour(slow: number | undefined): string {
  if (slow === undefined) return '#b5b0a8';
  const t = Math.max(0, Math.min(1, (slow - 35) / 50));
  const a = [240, 205, 170], b = [150, 28, 28];
  return `#${a.map((x, i) => Math.round(x + (b[i]! - x) * t).toString(16).padStart(2, '0')).join('')}`;
}

export function baseColour(s: AnatomicalStructure, colourBy: ColourBy): string {
  switch (colourBy) {
    case 'region': return LAYER_COLOUR[s.layer] ?? realLook(s).color;
    case 'nerve': return PLEXUS[s.muscle?.plexus ?? 'none'].colour;
    case 'depth': { const d = depthOf(s.id); return d ? DEPTH_COLOUR[d] : (s.kind === 'group' ? '#a8a29e' : realLook(s).color); }
    case 'fibre': return fibreColour(s.muscle?.slow);
    default: return realLook(s).color;
  }
}

export const HIGHLIGHT = '#ffc94d';
export const HOVER = '#ffe7a8';
/** The glow of a muscle that is the subject of a simulation. */
export const GLOW = '#ffd27a';
/** What a muscle does in a movement. */
export const ROLE_COLOUR: Record<Role, string> = { prime: '#ff4a2a', assist: '#ffa43a', antagonist: '#3f9bff' };
/** An injured muscle. */
export const INJURED = '#c7253e';
/** The bones behind the muscles. */
export const BONE = '#e6dcc4';

/** Cut-surface colour: the fibrous grain of muscle, pale for tendon. */
export function cutColour(s: AnatomicalStructure): string {
  return isTendon(s) ? '#efe8d6' : '#c25a4e';
}
