# Architecture

The muscular lab shares the heart, lungs, brain, digestive, eye, kidney, endocrine, reproductive and skeletal labs' design: a validated, data-only **`SimulationDefinition`** rendered by a generic viewer. The code is a deliberate copy of the skeletal lab, not a shared package, so each lab deploys independently. It reuses the skeletal lab's joint catalogue and posing rig (`src/lab/joints.ts`, `rig.ts`) unchanged and its `skeleton.glb` as the bones.

## Differences from the skeletal lab

| Area | Muscular |
|---|---|
| Body | Two models loaded together: `muscles.glb` (the structures; 431 → 428 mesh parts, 255k triangles, 6.5 MB) and `skeleton.glb` (the bones, loaded only when the skeleton is shown; the rig's source). |
| Contract | Modes `explore` / `movement` / `inside` / `exercise` / `injury` / `tour`. A structure may carry **muscle facts** (origin, insertion, nerve, roots, nerve family, actions, blood supply, slow-twitch share). Tour steps can set a pose, inside-a-muscle values, an activity and training, a disorder, a close-up, a cut, the colour (real, regions, nerve, depth, fibre), the peel and the skeleton. Up to 800 structures. |
| Knowledge (`src/lab/content/muscle-table.ts`, `muscle-data.ts`) | One line per muscle: origin, insertion, nerve and roots, actions as movement ids with a direction (`elbow-flex+*`: towards flexion, `*` for a prime mover), blood supply, slow-twitch share and a note. `muscle-data.ts` parses it, files nerves into families (the colour key), and `rolesForPose` turns a pose into prime mover / assistant / antagonist for every muscle (limb muscles answer only to their own side; trunk and neck side and rotation signs are mirrored for muscles on the right). |
| Structures (`content/muscles.ts`) | Built from `src/lab/source/muscles.source.json` (written by `tools/make-muscles.mjs`) and the table: one mesh per BodyParts3D part or modelled muscle, a group for a muscle in several parts (the heads of biceps), and 27 functional groups (quadriceps, hamstrings, rotator cuff, …) per side. |
| Skinning (`skinning.ts`, `MuscleModel.tsx`) | Each vertex stores its two nearest bones and a weight (`_SKIN`); at each pose change the rig's matrices (`poseMatrices`) are blended per vertex on the CPU (about 129k vertices) and the bounding volumes are refreshed so picking follows the muscle. `pathLengthChangePct` measures a muscle's length change by cutting it into eight slices along its long axis and following the slice centres: unlike the distance between the two ends it follows a muscle that wraps a joint (the quadriceps over the patella) or fans out (the gluteus maximus). |
| Model (`MuscleModel.tsx`) | Colour by real / regions / nerve / depth / fibre; roles tint muscles in the movement view and dim the rest; the exercise view warms the working muscles by drive; injuries tint the affected muscles crimson. The peel hides the superficial (then intermediate) muscles. Stencil cut caps are built from the rest shape, so a cut shows its cap only in the anatomical position. `BoneBackdrop` draws the bones ghosted or solid with the same rig. |
| Labels | Surface samples are re-taken whenever the pose changes (a motion counter). |
| Science (`src/lab/`) | `contraction.ts`: length–tension (Gordon, Huxley and Julian), force–velocity (Hill, with a lengthening branch), a twitch summing to a tetanus from a calcium-activation model for slow and fast fibres, motor units and the size principle, the steps of excitation–contraction coupling and the cross-bridge cycle. `exercise.ts`: three energy systems with an oxygen-uptake lag, the critical-power model, glycogen, the muscles of each activity, training adaptation and delayed-onset soreness. `disorders.ts`: thirteen conditions, three-phase muscle healing and strength recovery by grade, a creatine kinase reader and the MRC grades. |
| Close-ups (`CloseUps.tsx`) | The sarcomere (filaments and cross-bridge heads at the chosen length), the neuromuscular junction, fibre types and recruited motor units in cross-section, the muscle spindle and Golgi tendon organ, the tendon–bone junction, and muscle → fascicle → fibre → myofibril. |

The real-tissue look (`tissue.ts`, `Lighting.tsx`, `tools/bake-shading.mjs`) is the same in every lab. The bake lets each region shade only itself, since muscles of different regions slide over one another when posed.

## Asset pipeline

```
BodyParts3D (Human Atlas): ~400 muscle and tendon parts            ─┐
  named, sided and grouped by rule (tools/make-muscles.mjs)         │
  simplified (meshoptimizer, ≤ 1.2 % error), centred like the bones ├─ tools/extract-muscles.mjs
Bones: this lab's skeleton.glb                                      │    27 modelled muscles (cast, wrapped, tubes, rings)
                                                                    ┘    skinning to the two nearest bones, depth by outward rays, layout checks
        └─ tools/bake-shading.mjs ─▶ public/models/muscles.glb (6.5 MB) · muscles.json · muscles-provenance.json
```

**Missing muscles.** BodyParts3D 4.0 has no latissimus dorsi, rectus abdominis, internal oblique, transversus abdominis, quadratus lumborum, masseter, temporalis, pterygoids or facial muscles (other than the platysma): confirmed against its official parts list. They are shaped from their real attachments on this body's bones and marked "modelled": a latissimus sheet from the T7–L5 spinous processes and the iliac crest to the humeral groove, wrapped by outward rays over the ribs and the deep back muscles; a rectus strap from the pubic crest to the xiphoid and costal cartilages 5–7; the internal oblique and transversus as the real external oblique moved 6 and 12 mm inwards and trimmed to their rib levels; slabs cast onto the skull and mandible for the masseter, temporalis and occipitofrontalis; tubes for the pterygoids and zygomaticus; rings round the eyeballs and the mouth.

**Source asymmetries.** BodyParts3D has no right longus colli and no left intermediate tendon of the digastric, and it labels the sides of the flexor pollicis brevis the wrong way round; `make-muscles.mjs` takes the side from the position when it is clear, and leaves out what has no partner.

**Checks written by the extractor.** The latissimus is on the back, the rectus in front, the obliques layered, the masseter on the ramus, the temporalis above it, biceps on the arm and gastrocnemius on the leg, every vertex bound; also every sided muscle's centroid on its side.

## Performance

On an AMD integrated GPU (installed Chrome, D3D11) the views run at 60 fps; skinning 129k vertices on a pose change takes a few milliseconds. Under software WebGL (SwiftShader) the views work but slowly, which is why the browser suite runs on the GPU and only the smoke tests in software.
