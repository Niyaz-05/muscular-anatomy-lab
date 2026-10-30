/**
 * Injuries and disorders of muscle: what they are, where they sit in the body, how they present, how
 * they heal or progress, and readers for the two bedside numbers (creatine kinase and the MRC power
 * grade). Teaching content from Gray's Anatomy, Kumar & Clark's Clinical Medicine, Ekstrand et al. (hamstring
 * injuries in elite football) and EWGSOP2; typical values, not a diagnostic tool.
 */

export type DisorderKind = 'strain' | 'tendon' | 'compartment' | 'neuromuscular' | 'junction' | 'inflammatory' | 'degenerative' | 'metabolic';
export const KIND_LABEL: Record<DisorderKind, string> = {
  strain: 'Muscle injury', tendon: 'Tendon injury', compartment: 'Compartment', neuromuscular: 'Inherited muscle disease',
  junction: 'Neuromuscular junction', inflammatory: 'Inflammatory', degenerative: 'Ageing', metabolic: 'Muscle breakdown',
};

export interface Disorder {
  id: string;
  label: string;
  kind: DisorderKind;
  /** Muscle structures that carry the lesion (the left side; the other side mirrors). */
  sites: string[];
  summary: string;
  mechanism: string;
  features: string[];
  test: string;
  course: string;
  /** Has grades I–III (strains) or weeks of recovery to show. */
  graded?: boolean;
  /** Typical return to full activity (days) by grade for strains, or overall. */
  returnDays?: readonly [number, number, number];
  ck?: string;
  source: string;
}

export const DISORDERS: Disorder[] = [
  { id: 'hamstring', label: 'Hamstring strain', kind: 'strain', sites: ['biceps-femoris-long-head-left', 'semitendinosus-left', 'semimembranosus-left'], graded: true, returnDays: [17, 22, 73],
    summary: 'A tear of the hamstrings, most often the long head of biceps femoris near its musculotendinous junction, in sprinting or kicking.',
    mechanism: 'The muscle is lengthening (eccentric) while it contracts, at the end of the swing phase of sprinting: the stretch and the force together exceed what its fibres and the junction with the tendon can bear.',
    features: ['A sudden sharp pain at the back of the thigh, often with a “pop”', 'Grade I: a few fibres, pain on stretch and resisted bending; Grade II: a partial tear with a palpable gap or bruising; Grade III: complete rupture or avulsion from the ischial tuberosity', 'Bruising tracks down the thigh in the days after'],
    test: 'Pain and weakness against resisted knee flexion; the passive straight-leg raise is limited by pain; MRI shows the oedema and the size of the tear.',
    course: 'Healing follows three overlapping phases: destruction and inflammation (the first days), repair with satellite-cell regeneration and a collagen scar (about 1–3 weeks) and remodelling (weeks to months). Elite footballers return in about 17, 22 and 73 days for grades I, II and III on average; re-tear is common in the first weeks.',
    source: 'Ekstrand J, Healy JC, Waldén M et al. Hamstring muscle injuries in professional football: the correlation of MRI findings with return to play. Br J Sports Med 2012;46:112–7.' },
  { id: 'calf', label: 'Calf strain (tennis leg)', kind: 'strain', sites: ['gastrocnemius-medial-head-left', 'soleus-left'], graded: true, returnDays: [14, 35, 90],
    summary: 'A tear of the medial head of gastrocnemius at its junction with the aponeurosis, in a push-off with the knee extended.',
    mechanism: 'The knee is straight and the ankle dorsiflexed while the calf contracts hard, as when lunging forward in racquet sports.',
    features: ['A sudden pain “like being kicked” in the calf', 'Swelling and bruising low in the calf, tight and tender over the medial head', 'Pain on rising to the toes'],
    test: 'A gap or tenderness in the medial belly; Thompson’s test is normal (the Achilles is intact); ultrasound shows fluid between gastrocnemius and soleus.',
    course: 'Mostly conservative; weeks to a few months. A deep vein thrombosis can mimic or complicate it, so a swollen calf is examined for it.',
    source: 'Delgado GJ et al. Tennis leg: clinical US study of 141 patients and anatomic investigation of four cadavers with MR imaging and US. Radiology 2002;224:112–9.' },
  { id: 'rotator-cuff', label: 'Rotator cuff tear', kind: 'tendon', sites: ['supraspinatus-left', 'infraspinatus-left', 'subscapularis-left', 'teres-minor-left'], graded: false,
    summary: 'A tear of the tendons that steady the humeral head in the glenoid, most often supraspinatus where it passes under the acromion.',
    mechanism: 'Wear of a tendon with a poor blood supply near its insertion, with impingement under the acromion; a fall on the arm can tear it in one go.',
    features: ['Pain at night and when raising the arm between about 60° and 120° (a painful arc)', 'Weak abduction and lateral rotation; in a full tear the arm cannot be held up (drop-arm sign)', 'Common with age: about half of people in their 80s have a tear, many without symptoms'],
    test: 'Empty-can test for supraspinatus; external rotation lag for infraspinatus; ultrasound or MRI confirms.',
    course: 'Partial tears are treated with exercises; full tears in active people are repaired surgically; large tears can lead to cuff arthropathy.',
    source: 'Yamamoto A et al. Prevalence and risk factors of a rotator cuff tear in the general population. J Shoulder Elbow Surg 2010;19:116–20.' },
  { id: 'achilles', label: 'Achilles tendon rupture', kind: 'tendon', sites: ['calcaneal-tendon-left', 'gastrocnemius-medial-head-left', 'soleus-left'], graded: false,
    summary: 'A complete tear of the calcaneal tendon, usually 2–6 cm above the heel where its blood supply is poorest.',
    mechanism: 'A sudden push-off or unexpected dorsiflexion of a degenerate tendon, in a man in his 30s–50s who plays occasional sport; fluoroquinolone antibiotics and steroids increase the risk.',
    features: ['A sudden bang or feeling of being kicked in the heel', 'A palpable gap and a weak, flat-footed push-off (some plantarflexion remains through the deep flexors)'],
    test: 'Thompson (Simmonds) squeeze test: squeezing the calf of a kneeling patient does not plantarflex the foot.',
    course: 'Treated surgically or in a boot with early loading; return to sport takes 6–9 months.',
    source: 'Thompson TC, Doherty JH. Spontaneous rupture of tendon of Achilles: a new clinical diagnostic test. J Trauma 1962;2:126–9.' },
  { id: 'tendinopathy', label: 'Tendinopathy (tennis elbow)', kind: 'tendon', sites: ['extensor-carpi-radialis-brevis-left', 'extensor-digitorum-left'], graded: false,
    summary: 'A painful degeneration of the common extensor origin at the lateral epicondyle (lateral epicondylitis).',
    mechanism: 'Repeated loading of the wrist extensors exceeds the tendon’s capacity to repair; the collagen becomes disorganised with new vessels and nerve ingrowth. It is degenerative rather than inflamed (“tendinosis”).',
    features: ['Pain over the lateral epicondyle on gripping and on lifting with the palm down', 'Tender point on the epicondyle; grip strength is reduced by pain'],
    test: 'Pain on resisted wrist extension with the elbow straight (Cozen’s test).',
    course: 'Often settles over 6–24 months; progressive loading exercises work better than rest or steroid injections in the long term.',
    source: 'Coombes BK et al. Effect of corticosteroid injection, physiotherapy, or both on clinical outcomes in patients with unilateral lateral epicondylalgia. JAMA 2013;309:461–9.' },
  { id: 'compartment', label: 'Compartment syndrome', kind: 'compartment', sites: ['tibialis-anterior-left', 'extensor-digitorum-longus-left', 'extensor-hallucis-longus-left'], graded: false,
    summary: 'Pressure rising inside a closed fascial compartment, most often the anterior compartment of the leg after a tibial fracture, until it cuts off the blood supply to the muscle and nerve inside.',
    mechanism: 'Bleeding or swelling inside a compartment bounded by unyielding fascia and bone raises the pressure above the capillary perfusion pressure; ischaemic muscle swells further.',
    features: ['Pain out of proportion to the injury, worse with passive stretch of the toes', 'A tense, swollen compartment; later paraesthesia and weakness; pulses may still be present until late', 'Foot drop and numbness between the first two toes when the deep fibular nerve is involved'],
    test: 'A clinical diagnosis; compartment pressure above about 30 mmHg, or within 30 mmHg of diastolic pressure, supports it.',
    course: 'A surgical emergency: fasciotomy within hours. Muscle dies after about 4–6 hours of ischaemia; delay leaves contracture and foot drop, and rhabdomyolysis may follow.',
    ck: 'Rises sharply once muscle dies',
    source: 'von Keudell AG et al. Diagnosis and treatment of acute extremity compartment syndrome. Lancet 2015;386:1299–310.' },
  { id: 'rhabdomyolysis', label: 'Rhabdomyolysis', kind: 'metabolic', sites: ['vastus-lateralis-left', 'rectus-femoris-left', 'gastrocnemius-medial-head-left'], graded: false,
    summary: 'Breakdown of skeletal muscle that releases myoglobin and enzymes into the blood.',
    mechanism: 'Crush injury, extreme exertion, heat, statins, alcohol, inherited metabolic disease or compartment syndrome damage the sarcolemma; calcium floods in, enzymes spill out and myoglobin blocks and injures the kidney tubules.',
    features: ['Muscle pain, swelling and weakness', 'Dark (tea- or cola-coloured) urine from myoglobin', 'Creatine kinase above about 5 times the upper limit (usually over 1,000 U/L); high potassium and low calcium; acute kidney injury'],
    test: 'Serum creatine kinase, potassium, creatinine; urine dipstick positive for blood without red cells.',
    course: 'Treated with fluids to keep the kidney perfused and by treating the cause; the risk of kidney injury rises with CK above about 5,000 U/L.',
    ck: '> 5× normal; often > 5,000 U/L',
    source: 'Bosch X, Poch E, Grau JM. Rhabdomyolysis and acute kidney injury. N Engl J Med 2009;361:62–72.' },
  { id: 'duchenne', label: 'Duchenne muscular dystrophy', kind: 'neuromuscular', sites: ['gastrocnemius-medial-head-left', 'gluteus-maximus-left', 'vastus-lateralis-left', 'iliacus-left'], graded: false,
    summary: 'An X-linked recessive disease: no dystrophin, the protein that anchors the muscle fibre’s cytoskeleton to the extracellular matrix.',
    mechanism: 'A deletion in the DMD gene means contraction tears the sarcolemma; calcium enters, fibres die and are replaced by fat and scar. The calves look large (pseudohypertrophy) because of that fat.',
    features: ['Boys: clumsy walking, falls and difficulty on stairs at 2–5 years', 'Gowers’ sign: climbing up the legs with the hands to stand', 'Proximal weakness first, calf pseudohypertrophy; loss of walking around 12 years without steroids; later heart and breathing muscles fail'],
    test: 'Creatine kinase 10–100 times normal from birth; genetic testing finds the DMD deletion.',
    course: 'Steroids, respiratory and cardiac support prolong walking and life; gene-directed and exon-skipping therapies exist for some variants.',
    ck: '10–100× normal (often > 10,000 U/L)',
    source: 'Birnkrant DJ et al. Diagnosis and management of Duchenne muscular dystrophy, part 1. Lancet Neurol 2018;17:251–67.' },
  { id: 'myotonic', label: 'Myotonic dystrophy (type 1)', kind: 'neuromuscular', sites: ['sternocleidomastoid-left', 'flexor-digitorum-profundus-left', 'tibialis-anterior-left'], graded: false,
    summary: 'An autosomal dominant disease with a CTG repeat expansion in DMPK: muscle that cannot relax (myotonia), distal weakness and many other organs affected.',
    mechanism: 'The abnormal RNA sequesters splicing factors; the chloride channel gene is mis-spliced and muscle membrane stays excitable after the nerve has stopped.',
    features: ['A grip that releases slowly (grip myotonia); weak face, neck flexors and distal limbs', 'Frontal balding, cataracts, cardiac conduction defects and insulin resistance', 'Anticipation: the repeat grows and the disease starts earlier in each generation'],
    test: 'Needle EMG shows myotonic discharges (a dive-bomber sound); genetic test for the CTG repeat.',
    course: 'Slowly progressive; heart and breathing are watched. Mexiletine can relieve myotonia.',
    ck: 'Normal or mildly raised',
    source: 'Turner C, Hilton-Jones D. The myotonic dystrophies: diagnosis and management. J Neurol Neurosurg Psychiatry 2010;81:358–67.' },
  { id: 'myasthenia', label: 'Myasthenia gravis', kind: 'junction', sites: ['levator-palpebrae-superioris-left', 'orbicularis-oculi-left', 'masseter-left', 'deltoid-left'], graded: false,
    summary: 'Autoantibodies against the acetylcholine receptors of the motor end plate, so fewer open when ACh is released.',
    mechanism: 'Antibodies block and destroy receptors and complement damages the postsynaptic folds; the end-plate potential falls short of threshold more and more as ACh release declines with repeated use.',
    features: ['Fatigable weakness that worsens with use and improves with rest', 'Droopy eyelids (ptosis) and double vision first; later swallowing, chewing and limb weakness', 'Thymoma or thymic hyperplasia in many'],
    test: 'Anti-acetylcholine receptor antibodies (about 85 %); decremental response on repetitive nerve stimulation; the ice-pack test improves ptosis.',
    course: 'Cholinesterase inhibitors (pyridostigmine), immunosuppression and thymectomy; a myasthenic crisis can stop breathing.',
    ck: 'Normal',
    source: 'Gilhus NE. Myasthenia gravis. N Engl J Med 2016;375:2570–81.' },
  { id: 'lambert-eaton', label: 'Lambert–Eaton syndrome', kind: 'junction', sites: ['gluteus-medius-left', 'iliacus-left', 'psoas-major-left', 'deltoid-left'], graded: false,
    summary: 'Autoantibodies against presynaptic voltage-gated calcium channels, so less ACh is released.',
    mechanism: 'Fewer calcium channels in the nerve terminal give small end-plate potentials at rest; repeated firing builds up calcium in the terminal, so strength improves briefly with effort: the opposite of myasthenia.',
    features: ['Proximal leg weakness, absent reflexes that return after exercise, dry mouth', 'About half are paraneoplastic, mostly small-cell lung cancer'],
    test: 'Small compound muscle action potential that increases (incremental response) after 10 s of exercise or fast stimulation; anti-VGCC antibodies.',
    course: 'Treat the cancer; 3,4-diaminopyridine increases ACh release.',
    ck: 'Normal',
    source: 'Titulaer MJ, Lang B, Verschuuren JJ. Lambert–Eaton myasthenic syndrome: from clinical characteristics to therapeutic strategies. Lancet Neurol 2011;10:1098–107.' },
  { id: 'polymyositis', label: 'Polymyositis', kind: 'inflammatory', sites: ['deltoid-left', 'iliacus-left', 'psoas-major-left', 'gluteus-maximus-left'], graded: false,
    summary: 'An autoimmune inflammation of skeletal muscle by cytotoxic T cells, causing symmetric proximal weakness.',
    mechanism: 'CD8 T cells invade fibres that express MHC class I and destroy them; regeneration cannot keep up.',
    features: ['Weeks to months of trouble rising from a chair, climbing stairs and lifting the arms', 'Muscle pain in a minority; swallowing difficulty; lung and heart involvement', 'Dermatomyositis adds a heliotrope rash and Gottron papules'],
    test: 'CK raised up to 50 times normal; anti-Jo-1 and other antibodies; EMG with spontaneous activity; muscle biopsy with endomysial infiltrate.',
    course: 'Glucocorticoids and other immunosuppressants; screening for cancer is needed in dermatomyositis.',
    ck: 'Up to 50× normal',
    source: 'Dalakas MC. Inflammatory muscle diseases. N Engl J Med 2015;372:1734–47.' },
  { id: 'sarcopenia', label: 'Sarcopenia', kind: 'degenerative', sites: ['vastus-lateralis-left', 'gluteus-maximus-left', 'tibialis-anterior-left'], graded: false,
    summary: 'The loss of muscle mass and strength with age, which raises the risk of falls and dependence.',
    mechanism: 'Fewer motor neurons and fast-twitch fibres, less anabolic signalling and activity, and more fat inside the muscle; type II fibres shrink and disappear more than type I.',
    features: ['Muscle mass falls by about 3–8 % per decade after 30, faster after 60; strength falls faster than mass', 'Slow walking, trouble rising from a chair; probable sarcopenia: grip strength below 27 kg in men or 16 kg in women (EWGSOP2)'],
    test: 'Grip strength, five-times chair stand, gait speed; mass by DXA or BIA to confirm.',
    course: 'Resistance training and enough protein slow or reverse it at any age; the muscle responds at 90.',
    ck: 'Normal',
    source: 'Cruz-Jentoft AJ et al. Sarcopenia: revised European consensus on definition and diagnosis. Age Ageing 2019;48:16–31.' },
];
export const disorderById = (id: string) => DISORDERS.find((d) => d.id === id);

// ── Recovery ───────────────────────────────────────────────────────────────
export interface HealingPhase { id: string; label: string; fromDay: number; toDay: number; text: string }
export const MUSCLE_HEALING: HealingPhase[] = [
  { id: 'destruction', label: 'Destruction and inflammation', fromDay: 0, toDay: 5, text: 'A haematoma forms; neutrophils then macrophages clear the debris; satellite cells are activated.' },
  { id: 'repair', label: 'Repair and regeneration', fromDay: 5, toDay: 21, text: 'Satellite cells proliferate and fuse into new myotubes, while fibroblasts lay down a collagen scar and capillaries grow in.' },
  { id: 'remodelling', label: 'Remodelling', fromDay: 21, toDay: 180, text: 'The scar matures and fibres align along the load, restoring strength; too early a return strains the weak scar and the muscle tears again.' },
];
export const healingPhaseAt = (day: number) => MUSCLE_HEALING.find((p) => day < p.toDay) ?? MUSCLE_HEALING[MUSCLE_HEALING.length - 1]!;

/**
 * Typical share of normal strength after `day` days for a strain of a grade, as an S-curve through the
 * return-to-play time (strength is about 85 % at that time, since return is when function is adequate).
 */
export function strengthAt(day: number, grade: 1 | 2 | 3, returnDays: readonly [number, number, number]): number {
  const T = returnDays[grade - 1]!;
  const start = [0.7, 0.45, 0.2][grade - 1]!;
  const x = Math.max(0, day) / T;
  return start + (1 - start) * (1 - Math.exp(-2.4 * x)) * 1;
}

// ── The two bedside numbers ────────────────────────────────────────────────
export type Sex = 'female' | 'male';
/** Typical upper reference limit of creatine kinase (U/L); laboratories differ and Black men run higher. */
export const CK_ULN: Record<Sex, number> = { female: 190, male: 310 };
export interface CkReading { times: number; band: string; text: string; flag: 'ok' | 'mild' | 'high' | 'severe' }
export function readCk(ck: number, sex: Sex): CkReading {
  const times = ck / CK_ULN[sex];
  if (times <= 1) return { times, flag: 'ok', band: 'Normal', text: 'Within the usual reference range. A normal CK does not exclude every muscle disease (myasthenia gravis and many myopathies have a normal CK).' };
  if (times <= 5) return { times, flag: 'mild', band: 'Mildly raised', text: 'Common after exercise, injections or a fall, and with statins, hypothyroidism and some inherited myopathies; interpret with the history and repeat it after rest.' };
  if (times <= 10) return { times, flag: 'high', band: 'Raised: muscle injury', text: 'Suggests significant muscle damage, an inflammatory myopathy or a dystrophy. With pain and dark urine, think of rhabdomyolysis and check the kidneys.' };
  return { times, flag: 'severe', band: 'Very high', text: ck > 5000 ? 'More than about 5,000 U/L carries a real risk of acute kidney injury from myoglobin. Dystrophies (Duchenne, often 10,000+), rhabdomyolysis and severe myositis give values like this.' : 'Rhabdomyolysis is likely when it is over 10 times normal with muscle pain; Duchenne and severe myositis also reach this range.' };
}

export const MRC: { grade: number; label: string; text: string }[] = [
  { grade: 0, label: 'No contraction', text: 'No flicker of contraction can be felt or seen.' },
  { grade: 1, label: 'Flicker', text: 'A flicker or trace of contraction, but no movement of the joint.' },
  { grade: 2, label: 'Movement without gravity', text: 'Active movement with gravity eliminated (the limb is supported along its plane).' },
  { grade: 3, label: 'Against gravity', text: 'Active movement against gravity, but not against any resistance added by the examiner.' },
  { grade: 4, label: 'Against resistance', text: 'Movement against gravity and moderate resistance; split into 4−, 4 and 4+ for slight, moderate and strong resistance.' },
  { grade: 5, label: 'Normal', text: 'Normal power against full resistance.' },
];
export const mrcReading = (grade: number) => MRC[Math.max(0, Math.min(5, Math.round(grade)))]!;
