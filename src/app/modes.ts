import type { Mode } from '../contract/schema';

/** The camera each mode starts with. */
export const MODE_CAMERA: Partial<Record<Mode, string>> = {
  explore: 'anterior', movement: 'oblique', inside: 'anterior', exercise: 'anterior', injury: 'anterior',
};
