# Testing

Results recorded on 2026-10-28 on Windows 11, Node 22.14.0. The browser suite ran in installed Google Chrome with hardware WebGL on an AMD Radeon integrated GPU (ANGLE, Direct3D 11) through Playwright 1.64; the smoke tests also ran in Playwright's Chromium with software WebGL (SwiftShader).

## Commands

| Check | Command | What it covers |
|---|---|---|
| Types | `npm run typecheck` | TypeScript strict, `noUncheckedIndexedAccess` |
| Unit | `npm test` | **Definition:** passes the validation gate with no warnings; an unapproved asset and a missing left/right partner are rejected; one mesh structure per model node (428); every sided muscle on its side; https-only sources; the 27 modelled muscles carry a "modelled" note; every tour step's focus exists and each kind of view is toured; every disorder's sites exist and have a camera; every activity's muscles exist. **Knowledge table:** every muscle has origin, insertion and blood supply; every action names a real movement; nerves sort into their families; actions read in words, mirrored for right-hand trunk muscles; fibre mixes. **Model:** the extractor's checks; under 300k triangles and 8 MB; every vertex bound to bones that exist with weights in 0–1; the three depth classes. **Roles:** flexing the elbow (biceps and brachialis prime, triceps antagonist, the other arm untouched), the hip and knee, turning the head (a sternocleidomastoid turns the face to the opposite side), nothing at rest, prime movers for every pose. **Skinning on the real model:** nothing moves at rest; elbow flexion shortens the biceps and lengthens the triceps; knee flexion stretches the rectus femoris and shortens the hamstrings and calf; hip flexion shortens the iliacus and stretches the gluteus maximus and hamstrings; shoulder abduction shortens the deltoid and stretches the latissimus and pectoralis major. **Contraction:** the length–tension plateau and its zeros, force–velocity (isometric 1, zero at vmax, more when lengthening, power peak near a third), twitch to fused tetanus with slow fibres fusing sooner, the size principle. **Exercise:** the energy system of a sprint and a marathon, the oxygen lag, critical power, glycogen, adaptation by program, soreness. **Disorders:** recovery by grade, the CK reader by sex, MRC grades. **Reducer:** modes, clamping, both arms at once, peel, layers, close-up, injury cameras, settings in range, the tour, search by everyday names. `closeHoles` on synthetic meshes |
| Assets | `npm run validate:assets` | Both GLBs: sha256 = provenance and the recorded baked hash, node set = geometry record, finite positions in range, unit normals, indices in range, triangle counts, baked `_TISSUE` on every mesh, `_SKIN` binding (bone indices in range, weights 0–1) on every muscle, no morph targets; the attribution names BodyParts3D, DBCLS, HuBMAP, the licence, the modelled muscles, the official parts list and the source and output hashes |
| Determinism | re-run `tools/make-muscles.mjs`, `extract-muscles.mjs`, `bake-shading.mjs` | Byte-identical `muscles.glb` |
| Build | `npm run build` | Type check + production bundle |
| E2E (GPU) | `npm run build && npx playwright test --project=gpu` | All 24 scenarios below; screenshots in `docs/screenshots/` |
| E2E (software) | `npx playwright test --project=software` | The 4 scenarios tagged @smoke, with software WebGL |

## E2E scenarios (`tests/e2e/lab.spec.ts`)

1. Loads with no console errors and a clean main screen (@smoke).
2. Clicking the model selects the muscle under the pointer; a drag does not.
3. Search finds muscles by everyday names (quads, achilles, lats, six pack, hamstrings).
4. The details give origin, insertion, nerve, actions and blood supply; the parts of a muscle link back to it (@smoke).
5. A muscle BodyParts3D lacks says it is modelled.
6. Colour by nerve, depth and fibre type repaint the model and show a key.
7. Peel removes the superficial muscles and then the intermediate ones.
8. Layers hide and show regions.
9. Isolate, Zoom to and Reset.
10. Camera presets and region buttons change the view.
11. Labels mode shows labels that do not overlap.
12. The cut turns the camera to face it; Flip and Off.
13. Movement: poses bend the muscles with the bones and name the prime movers.
14. Movement: an elbow slider makes the biceps shorten and the triceps lengthen, on the chosen side only.
15. Inside a muscle: length–tension, force–velocity, summation, motor units and steps.
16. Close-ups open from inside a muscle and return to the body; the sarcomere follows its length slider.
17. Exercise: each activity shows its energy system, its muscles and a limit; training and soreness.
18. Injuries: a hamstring strain heals by grade and day; CK and power are read; other disorders open.
19. The guided tour: every step in order, back, Finish (and no console errors, which includes no NaN geometry in any pose).
20. Phone 390×844: no horizontal overflow; Structures opens from the dock; picking shows the details (@smoke).
21. About (ⓘ): the BodyParts3D credit, the modelled muscles and the science credits; Escape closes.
22. `?nowebgl`: fallback message; the list, details and every panel still work (@smoke).
23. Missing model (HTTP 404): error alert; Try again refetches and loads.
24. Reduced motion: every view and an animated close-up work without errors.

## Results

| Check | Result |
|---|---|
| `npm run typecheck` | **Pass** |
| `npm test` | **Pass**: 60/60 in 2 files |
| `npm run validate:assets` | **Pass**: skeleton 301 nodes, 449,043 triangles (sha256 `760829effac2…`); muscles 428 nodes, 253,417 triangles (sha256 `5365faa41176…`) |
| Determinism | Not re-run after the last extraction (two successive extractions of the same inputs were identical in size and checks; the unbaked and baked hashes are in `muscles-provenance.json`) |
| `npm run build` | **Pass**. Vite warns about chunk size (mostly three.js) |
| E2E, GPU | **Pass**: 24/24 in 3.0 minutes |
| E2E, software (SwiftShader) | **Pass**: 4/4 @smoke tests in 1.2 minutes |
| GPU check (Chrome, AMD Radeon, D3D11) | Every mode, pose, close-up and the 25-step tour render with no console errors; posing the whole body re-skins 129k vertices without a visible stall |
| Live site | Not published yet |


## Defects found and fixed during QA

- **Posing produced NaN geometry.** The model's vertex attributes are stored interleaved, so `attribute.array` is the whole interleaved buffer: skinning wrote positions into the wrong places. The loader now copies positions, normals and skin weights into plain arrays; the tour test (which poses the body) fails on any console error, so it guards this.
- **A muscle's length change was measured between its two extreme vertices,** which gave the wrong sign for muscles that wrap a joint (the quadriceps over the patella) or fan out (the gluteus maximus). It is now measured along the muscle's own axis (the path through the centres of eight slices), which gives textbook directions and sizes (biceps −11 % at 120° of elbow flexion; rectus femoris +8 % at 100° of knee flexion; gluteus maximus +27 % at 90° of hip flexion).
- **The first model was too heavy** (704k triangles, 17 MB, because the smallest meshes were re-subdivided after simplifying); it is 253k triangles and 6.5 MB now.
- **BodyParts3D is not symmetric:** it has no right longus colli and no left intermediate tendon, and mislabels the sides of the flexor pollicis brevis (left for right). The structure tool takes the side from the position when it is clear and leaves out what has no partner, so every left muscle has its right partner.
- **The first extractor run was far too slow:** rays were tested against every triangle (no BVH was attached to three's `Raycaster`); it takes about two minutes now.
- **Searching "hamstrings" found a single muscle,** because every hamstring muscle also carried the group's name as a synonym; the group names now belong to the groups.
- **The cross-bridge heads in the sarcomere close-up clumped into blobs;** they are spread along the thick filaments now.

## Not verified

- **Physical devices other than one AMD integrated GPU.** No phone, tablet or discrete GPU was tested; the phone layout is the older one from the skeletal lab (the responsive layer is being piloted on the heart lab first). Firefox and Safari were not run.
- **Automated accessibility audit.** axe-core is not installed; keyboard paths and ARIA labels were checked by hand and by E2E only.
- **Medical review.** The text follows OpenStax A&P 2e, Gray's Anatomy, Kendall, Moore and the cited papers; no anatomist, physiotherapist or neurologist has reviewed it.
- **The models are teaching models.** Joints turn about fixed axes; muscles bend by skinning to their two nearest bones, so a muscle's shape in a pose, its length change and the paths of fan-shaped muscles are approximate (the extreme case is a muscle that slides over a bone, which the model does not do); the modelled muscles are shaped from their attachments and are not anatomical scans; force, energy-system, training and soreness figures are typical values; recovery times are averages for elite athletes (hamstrings) or typical ranges. None is for diagnosis or treatment.
- **Muscles in the cut.** Stencil caps are built from the rest shape, so a cut shows its filled face only in the anatomical position.
- **Fibre direction, fascia and the tendons' fine structure are not in the 3D model** (the fibres appear only in close-ups).
