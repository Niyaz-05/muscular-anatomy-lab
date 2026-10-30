/**
 * Approved asset registry. Definitions reference assets only by these ids; the runtime resolves
 * the file, and the validators check that every mesh structure has a node in the asset. Adding an
 * asset here requires a provenance and licence entry in public/ATTRIBUTION.md.
 */
import muscles from '../lab/generated/muscles.json';

export interface ApprovedAsset {
  id: string;
  /** Path relative to the app's base URL. */
  file: string;
  format: 'glb';
  license: string;
  attribution: string;
  /** Node names present in the file; generated with the model. */
  nodes: readonly string[];
}

const nodesOf = (g: { structures: Record<string, unknown> }) => Object.keys(g.structures).filter((k) => !k.startsWith('$'));

export const APPROVED_ASSETS: Readonly<Record<string, ApprovedAsset>> = {
  'bp3d-muscles-v1': {
    id: 'bp3d-muscles-v1',
    file: 'models/muscles.glb',
    format: 'glb',
    license: 'CC-BY-4.0',
    attribution: 'BodyParts3D (DBCLS), CC BY 4.0; latissimus dorsi, rectus abdominis, internal oblique, transversus abdominis, quadratus lumborum, the muscles of mastication and the facial muscles are modelled in code on this body’s bones',
    nodes: nodesOf(muscles),
  },
};
/** The skeleton drawn behind the muscles and the bones the muscles are bound to. */
export const BONES_FILE = 'models/skeleton.glb';
