/**
 * Content shared across the lab: sources, camera presets and disclaimers.
 */
import type { CameraPreset, Source } from '../../contract/schema';

export const SOURCES: Source[] = [
  { id: 'openstax-muscle', citation: 'Betts JG et al. Anatomy and Physiology 2e, chapters 10 (Muscle Tissue) and 11 (The Muscular System). OpenStax, 2022.', url: 'https://openstax.org/books/anatomy-and-physiology-2e/pages/10-introduction', license: 'CC BY 4.0' },
  { id: 'grays', citation: 'Standring S, ed. Gray’s Anatomy: The Anatomical Basis of Clinical Practice, 42nd ed. Elsevier, 2021.' },
  { id: 'bp3d', citation: 'Mitsuhashi N et al. BodyParts3D: 3D structure database for anatomical concepts. Nucleic Acids Res 2009;37:D782–5. Database Center for Life Science (DBCLS).', url: 'https://doi.org/10.1093/nar/gkn613', license: 'CC BY 4.0' },
  { id: 'kendall', citation: 'Kendall FP, McCreary EK, Provance PG, Rodgers MM, Romani WA. Muscles: Testing and Function with Posture and Pain, 5th ed. Lippincott Williams & Wilkins, 2005.' },
  { id: 'moore', citation: 'Moore KL, Dalley AF, Agur AMR. Clinically Oriented Anatomy, 8th ed. Wolters Kluwer, 2018.' },
  { id: 'norkin', citation: 'Norkin CC, White DJ. Measurement of Joint Motion: A Guide to Goniometry, 5th ed. F.A. Davis, 2016 (with the AAOS normal ranges).' },
  { id: 'huxley-hanson-1954', citation: 'Huxley H, Hanson J. Changes in the cross-striations of muscle during contraction and stretch and their structural interpretation. Nature 1954;173:973–6.', url: 'https://doi.org/10.1038/173973a0' },
  { id: 'gordon-1966', citation: 'Gordon AM, Huxley AF, Julian FJ. The variation in isometric tension with sarcomere length in vertebrate muscle fibres. J Physiol 1966;184:170–92.', url: 'https://doi.org/10.1113/jphysiol.1966.sp007909' },
  { id: 'hill-1938', citation: 'Hill AV. The heat of shortening and the dynamic constants of muscle. Proc R Soc Lond B 1938;126:136–95.', url: 'https://doi.org/10.1098/rspb.1938.0050' },
  { id: 'henneman-1965', citation: 'Henneman E, Somjen G, Carpenter DO. Functional significance of cell size in spinal motoneurons. J Neurophysiol 1965;28:560–80.', url: 'https://doi.org/10.1152/jn.1965.28.3.560' },
  { id: 'monod-1965', citation: 'Monod H, Scherrer J. The work capacity of a synergic muscular group. Ergonomics 1965;8:329–38.', url: 'https://doi.org/10.1080/00140136508930810' },
  { id: 'gastin-2001', citation: 'Gastin PB. Energy system interaction and relative contribution during maximal exercise. Sports Med 2001;31:725–41.', url: 'https://doi.org/10.2165/00007256-200131100-00003' },
  { id: 'jones-2010', citation: 'Jones AM, Vanhatalo A, Burnley M, Morton RH, Poole DC. Critical power: implications for determination of VO2max and exercise tolerance. Med Sci Sports Exerc 2010;42:1876–90.', url: 'https://doi.org/10.1249/MSS.0b013e3181d9cf7f' },
  { id: 'hughes-2018', citation: 'Hughes DC, Ellefsen S, Baar K. Adaptations to endurance and strength training. Cold Spring Harb Perspect Med 2018;8:a029769.', url: 'https://doi.org/10.1101/cshperspect.a029769' },
  { id: 'cheung-2003', citation: 'Cheung K, Hume P, Maxwell L. Delayed onset muscle soreness: treatment strategies and performance factors. Sports Med 2003;33:145–64.', url: 'https://doi.org/10.2165/00007256-200333020-00005' },
  { id: 'mchugh-2003', citation: 'McHugh MP. Recent advances in the understanding of the repeated bout effect: the protective effect against muscle damage from a single bout of eccentric exercise. Scand J Med Sci Sports 2003;13:88–97.', url: 'https://doi.org/10.1034/j.1600-0838.2003.02477.x' },
  { id: 'ekstrand-2012', citation: 'Ekstrand J, Healy JC, Waldén M et al. Hamstring muscle injuries in professional football: the correlation of MRI findings with return to play. Br J Sports Med 2012;46:112–7.', url: 'https://doi.org/10.1136/bjsports-2011-090155' },
  { id: 'bosch-2009', citation: 'Bosch X, Poch E, Grau JM. Rhabdomyolysis and acute kidney injury. N Engl J Med 2009;361:62–72.', url: 'https://doi.org/10.1056/NEJMra0801327' },
  { id: 'birnkrant-2018', citation: 'Birnkrant DJ et al. Diagnosis and management of Duchenne muscular dystrophy, part 1. Lancet Neurol 2018;17:251–67.', url: 'https://doi.org/10.1016/S1474-4422(18)30024-3' },
  { id: 'gilhus-2016', citation: 'Gilhus NE. Myasthenia gravis. N Engl J Med 2016;375:2570–81.', url: 'https://doi.org/10.1056/NEJMra1602678' },
  { id: 'cruz-jentoft-2019', citation: 'Cruz-Jentoft AJ et al. Sarcopenia: revised European consensus on definition and diagnosis. Age Ageing 2019;48:16–31.', url: 'https://doi.org/10.1093/ageing/afy169' },
  { id: 'mrc-1976', citation: 'Medical Research Council. Aids to the examination of the peripheral nervous system. Memorandum no. 45. Her Majesty’s Stationery Office, London, 1976.' },
];

export const CAMERAS: CameraPreset[] = [
  { id: 'anterior', label: 'Front', direction: [0, 0.05, 1] },
  { id: 'posterior', label: 'Back', direction: [0, 0.05, -1] },
  { id: 'left', label: 'Left side', direction: [1, 0.05, 0.02] },
  { id: 'right', label: 'Right side', direction: [-1, 0.05, 0.02] },
  { id: 'superior', label: 'From above', direction: [0, 1, 0.0001], up: [0, 0, -1] },
  { id: 'inferior', label: 'From below', direction: [0, -1, 0.35] },
  { id: 'oblique', label: '3/4', direction: [0.65, 0.2, 0.75] },
];

export const DISCLAIMERS = [
  'For learning only. Not a diagnostic or treatment tool: a suspected muscle injury, weakness or neuromuscular disease needs a doctor.',
  'The muscles are BodyParts3D (one adult male); 27 it lacks (latissimus dorsi, the abdominal wall but the external oblique, quadratus lumborum, the jaw muscles, facial muscles) are modelled in code on this body’s bones and marked “modelled”. Fibre direction, fascia and the fine structure of tendons are not shown.',
  'Muscles bend with the bones by skinning: each follows its two nearest bones, so length changes are approximate. Force, energy and training figures are textbook averages in teaching models; real people vary widely.',
];
