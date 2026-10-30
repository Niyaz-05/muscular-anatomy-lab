# Human Muscular System — Interactive 3D Learning Lab

An interactive 3D human muscular system for university anatomy and physiology:

- **Anatomy explorer.** 198 muscles and tendons of one adult (BodyParts3D 4.0) in 431 parts, from the eye muscles to the muscles of the sole, grouped into muscles and functional groups (quadriceps, hamstrings, rotator cuff, erector spinae …). Each has its origin, insertion, nerve and roots, actions, blood supply and typical fibre mix. Colour by region, **nerve supply** (cranial, cervical, brachial, thoracic, lumbar, sacral, dorsal rami), **depth** (superficial, intermediate, deep) or **fibre type**; peel the body layer by layer; show the skeleton behind; cut it in three planes; search by everyday names ("quads", "lats", "achilles", "six pack").
- **Muscles bend with the bones.** Every vertex of every muscle follows its two nearest bones through the joint rig of the sibling skeletal lab (CPU linear-blend skinning), so a posed muscle stretches and shortens.
- **Movement.** Poses and per-joint sliders with the AAOS normal ranges; the muscles light up by role (prime mover, assistant, antagonist) and show their length change in the posed model, concentric or eccentric.
- **Inside a muscle.** The length–tension curve (Gordon, Huxley and Julian), the Hill force–velocity curve, a twitch summing to a fused tetanus for slow and fast fibres, motor-unit recruitment by the size principle, the steps of excitation–contraction coupling and the cross-bridge cycle, and six close-ups drawn in code: the sarcomere (the filaments slide as you change the length), the neuromuscular junction, fibre types, the muscle spindle and Golgi tendon organ, the tendon–bone junction, and muscle → fascicle → fibre → myofibril.
- **Exercise and fatigue.** Three energy systems with the oxygen-uptake delay and the critical-power model, the muscles each activity uses, training adaptations (strength, endurance, both) and delayed-onset soreness.
- **Injuries and disorders.** Thirteen conditions shown on the real muscles: hamstring and calf strains (with grades and a recovery curve), rotator-cuff and Achilles tears, tendinopathy, compartment syndrome, rhabdomyolysis, Duchenne and myotonic dystrophy, myasthenia gravis, Lambert–Eaton syndrome, polymyositis and sarcopenia; with readers for creatine kinase and the MRC power grade.
- **Guided tour** of 25 steps through all of it.

**Educational only.** This is not a clinical tool, and the text has not been reviewed by a physician. The muscles are BodyParts3D (DBCLS). BodyParts3D 4.0 has no latissimus dorsi, rectus abdominis, internal oblique, transversus abdominis, quadratus lumborum, masseter, temporalis, pterygoids or facial muscles (checked against its official parts list), so those 27 are **modelled in code** on this body's bones and marked "modelled". Credits and licences are in [public/ATTRIBUTION.md](public/ATTRIBUTION.md) and in the About sheet.

## Run

Requires Node.js ≥ 22.12.

```sh
npm install
npm run dev            # http://localhost:5198
npm run build          # type-check + production build → dist/
npm run preview        # http://localhost:5199
```

Add `?quality=high` or `?quality=low` to the URL to force a rendering quality.

## Check

```sh
npm run typecheck
npm test                                     # unit tests (Vitest)
npm run validate:assets                      # both models: hashes, nodes, geometry, skin binding, baked shading, attribution
npm run build && npx playwright test --project=gpu        # every browser test, in installed Chrome with a GPU
npx playwright install chromium && npx playwright test --project=software   # the @smoke tests with software WebGL
```

See [docs/TESTING.md](docs/TESTING.md) for results and what is not verified, and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how it is built.

## Rebuild the model

`public/models/muscles.glb` is generated from the Human Atlas checkout (`github.com/Niyaz-05/human-atlas`: BodyParts3D) and this lab's `skeleton.glb` (the bones, shown behind the muscles and used as the rig):

```sh
node tools/make-muscles.mjs "<human-atlas>/public/models"      # names, sides and groups → src/lab/source/muscles.source.json
node tools/extract-muscles.mjs "<human-atlas>/public/models"   # simplify, model the missing muscles, skin, classify depth → muscles.glb
node tools/bake-shading.mjs                                    # ambient occlusion and mottling for the real-tissue look
node tools/validate-assets.mjs
```

Every step is deterministic, and every input and output is hashed in `src/lab/generated/muscles-provenance.json`, with the layout checks. The skeleton is built by the sibling skeletal lab's `tools/extract-skeleton.mjs`.

## Layout

| Path | What |
|---|---|
| `src/contract/` | Simulation schema (zod), approved-asset registry, validation gate |
| `src/lab/` | The definition (structures, layers, tour, sources); the muscle knowledge table and roles; skinning; contraction, exercise and disorder science; joints, movements and the posing rig; anchors; generated geometry and provenance |
| `src/app/` | Pure state reducer (modes, colour, peel, bones, cut, close-ups, pose, inside, exercise, injury), search, React context |
| `src/viewer/` | three.js / react-three-fiber scene: tissue materials, the skinned muscle model with capped cuts, the bone backdrop, close-ups, camera rig, labels |
| `src/ui/` | Panels: structures, details, Movement, Inside a muscle, Exercise, Injuries, close-up, tour, About; a small SVG chart |
| `tools/` | Muscle list, extraction and modelling, shading bake and asset validation |
| `tests/unit`, `tests/e2e` | Vitest and Playwright suites |
