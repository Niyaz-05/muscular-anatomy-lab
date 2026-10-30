/** The simulation definition of the muscular lab. */
import type { SimulationDefinition } from '../contract/schema';
import { CAMERAS, DISCLAIMERS, SOURCES } from './content/common';
import { LAYERS, STRUCTURES } from './content/muscles';
import { TOUR } from './content/tour';

const OBJECTIVES = [
  { id: 'anatomy', text: 'Name and locate the main skeletal muscles, with their origin, insertion, nerve supply and blood supply, and say which lie superficial and which deep.' },
  { id: 'actions', text: 'Predict which muscles are prime movers, assistants and antagonists for a movement, and whether they shorten (concentric), lengthen (eccentric) or stay the same length (isometric).' },
  { id: 'nerves', text: 'Relate muscles to the cranial nerves and the cervical, brachial, lumbar and sacral plexuses, and predict the weakness that follows an injured nerve.' },
  { id: 'contraction', text: 'Describe excitation–contraction coupling, the sliding-filament mechanism and the cross-bridge cycle, and read the length–tension and force–velocity relationships.' },
  { id: 'control', text: 'Explain twitch, summation and tetanus, and how motor units are recruited by the size principle.' },
  { id: 'exercise', text: 'Describe the energy systems of exercise, the fibre types, fatigue, delayed-onset soreness and how muscle adapts to strength and endurance training.' },
  { id: 'disorders', text: 'Recognise strains, tendon injuries, compartment syndrome, dystrophy, junction disorders and sarcopenia; read creatine kinase and the MRC power grade.' },
];

export const definition: SimulationDefinition = {
  schemaVersion: 1,
  id: 'muscular',
  title: 'Human Muscular System',
  domain: 'biology',
  simulationType: '3d-anatomy',
  audience: 'University anatomy and physiology (medicine, physiotherapy, nursing, sports science, biology)',
  summary: 'The BodyParts3D adult muscles, with the missing ones modelled on its bones, that bend with the skeleton: origins, insertions, nerves and actions, movement with the role of every muscle, the sarcomere and motor units, exercise and fatigue, and the injuries and disorders of muscle.',
  learningObjectives: OBJECTIVES,
  assets: [{ id: 'bp3d-muscles-v1', role: 'anatomy-model' }],
  layers: LAYERS,
  structures: STRUCTURES,
  cameraPresets: CAMERAS,
  defaultCamera: 'anterior',
  tour: TOUR,
  sources: SOURCES,
  disclaimers: DISCLAIMERS,
};
