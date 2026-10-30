import type { AnatomicalStructure } from '../contract/schema';
import type { ColourBy } from '../app/state';
import { depthOf } from '../lab/anchors';
import { PLEXUS, type Role } from '../lab/muscle-data';
import type { TissueLook } from './tissue';

/**
 * Real looks: dark red-brown muscle with a moist sheen, each muscle a little lighter or darker than its
 * neighbours so their edges can be read; glossy off-white tendon and fascia.
 */
const MUSCLE: TissueLook = { color: '#a9483e', roughness: 0.55, clearcoat: 0.3, clearcoatRoughness: 0.4, sheen: 0.4, sheenColor: '#ffc2b5', rim: 0.2, rimColor: '#ff8c78', ao: 0.9, mottle: 0.3, mottleTint: '#7e2a24' };
const TENDON: TissueLook = { color: '#e9e0cb', roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.15, sheen: 0.5, sheenColor: '#ffffff', rim: 0.15, rimColor: '#f4f1e8', ao: 0.7, mottle: 0.18, mottleTint: '#c6bca4' };

const hash = (id: string) => { let h = 2166136261; for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619); return ((h >>> 0) % 1000) / 1000; };
const shade = (hex: string, t: number) => {
  const n = parseInt(hex.slice(1), 16);
  const k = 0.86 + t * 0.28;
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((x) => Math.max(0, Math.min(255, Math.round(x * k))));
  return `#${c.map((x) => x.toString(16).padStart(2, '0')).join('')}`;
};
const isTendon = (s: AnatomicalStructure) => s.muscle?.slow === undefined;

export function realLook(s: AnatomicalStructure): TissueLook {
  if (isTendon(s)) return TENDON;
  const look = s.layer === 'face' || s.layer === 'tongue-larynx' ? { ...MUSCLE, color: '#b9564d' } : s.layer === 'eye' ? { ...MUSCLE, color: '#c0605a' } : MUSCLE;
  return { ...look, color: shade(look.color, hash(s.id)) };
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
