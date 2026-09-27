# GarmentOS — CLAUDE.md
## Persistent Project Context for All Claude Code Sessions
*Read this file at the start of every session before writing any code*

---

## 1. WHAT GARMENTOS IS

GarmentOS is a web-based pattern creation, editing, design, and technical platform built specifically for the East African garments manufacturing market. It sits under the Aurel parent company alongside TBS and GARMENTTRACK.

**The mission in one sentence:** Give East African garment manufacturers and designers a pattern tool built on East African bodies, not European assumptions.

**The founder:** Benson — a Nairobi-based garments manufacturer and entrepreneur running an actual factory in Ruai. He is a vibe coder, not a trained developer. Build sessions use Claude Code iteratively.

**The primary users:**
- The designer (Benson's brother) — uses Clo3D currently, needs a 3D interactive mannequin he can rotate and make tweaks on in real time. This is non-negotiable for his adoption.
- The manufacturer (Benson) — needs pattern accuracy, production integration, and tech pack output.

**The competitive context:** GarmentOS is not trying to replicate Clo3D entirely. It is building the version Clo3D cannot build — calibrated to East African bodies from the ground up, connected to production from day one.

---

## 2. THE SPLIT VIEW — THE CORE PRODUCT FEATURE

Benson's brother uses Clo3D daily. The single feature driving his adoption is the live split view — 2D pattern canvas on the left, 3D mannequin on the right, synchronised in real time. Every point moved, every line drawn, every dart closed on the 2D side instantly reflects on the 3D side without any button press or export step.

This is not a nice-to-have. It is the product. Everything else is secondary to this.

**How Clo3D implements it (from official documentation):**
- 2D pattern window is the source of truth
- All adjustments in 2D automatically synchronise with the 3D window
- Two-way sync — changes on the 3D garment also update the 2D pattern
- Sync fires on every edit — no manual trigger required
- Physical fabric properties (Stretch, Shear, Bending, Density, Friction) drive the 3D simulation

**Clo3D's known weakness — GarmentOS's opportunity:**
With complex patterns, Clo3D's sync becomes slow — users report waiting for auto-sync consuming 90% of their working time. GarmentOS uses geometric draping (not particle physics running continuously) which is significantly faster for basic blocks. GarmentOS can be more responsive than Clo3D for the pattern types Benson's operation produces.

**GarmentOS split view specification:**
- Left panel (60%): 2D pattern canvas — all drafting
- Right panel (40%): Three.js 3D mannequin — live geometric draping
- Divider: draggable, user resizable
- Sync: automatic on every canvas edit, target under 200ms for basic blocks
- Two-way: drag a point on 3D mannequin → 2D pattern coordinates update
- Physics simulation: separate on-demand action (not running continuously) — keeps sync fast
- Panel modes: full-screen 2D for detailed drafting, full-screen 3D for design review

**The East African body is what Clo3D cannot match:**
Clo3D's mannequin is built on European/Asian bodies. GarmentOS's mannequin is built on East African anthropometric data and Benson's father's fit corrections. Same split view experience. Better body underneath it.

This is the most important thing to understand about GarmentOS.

All existing pattern software — Clo3D, Optitex, Gerber — is built on European or Asian body data. Kenya Bureau of Standards sizing charts are themselves adapted from non-Kenyan foreign samples. This means every pattern tool on the market is systematically wrong for East African bodies.

East African academic research on body sizing confirms:
- Kenyan sizing charts are based on foreign data — confirmed
- The four anchor dimensions for Kenyan sizing are: height, outside leg, chest, hip
- Comprehensive anthropometric data for the Kenyan population is absent from global literature
- Collaboration between academic institutions and industry is needed to fill this gap

GarmentOS is that collaboration. Every block generated must eventually be calibrated against East African body data, not just Winifred Aldrich formulas. The Aldrich system is the starting point. East African calibration is the destination.

The East African body context:
- East African male bodies trend leaner and longer-limbed than European sizing assumptions (Bergmann's Rule)
- The dominant male body shapes in East African populations: rectangular, inverted triangle, trapezoid
- Buttocks prominence and position varies significantly from European norms — this directly affects the crotch curve
- Standard Western blocks systematically produce too much bulk in the torso and too little limb length

---

## 3. THE CROTCH CURVE — CRITICAL KNOWLEDGE

Benson's father is a master tailor who has been fitting Kenyan bodies for decades. His core teaching, validated independently by academic research: **the secret to a properly fitting and comfortable trouser is in the bezier curve at the crotch.**

The crotch is geometrically the most complex point in pattern making because it must simultaneously satisfy:
1. The circumference of the seat (horizontal wrap)
2. The rise depth (vertical travel from waist to crotch)
3. The inseam angle (how the leg cylinder departs from the torso cylinder)

This cannot be a simple arc. It requires a bezier curve — a smooth transition between different tangent angles with controlled intermediate shape. The front crotch curve is shallow and near-vertical (fly area). The back crotch curve is deep and dramatic (seat accommodation).

**The East African crotch curve calibration is the single most important technical task in GarmentOS.** Benson's father's hand-drawn curve, calibrated to Kenyan bodies over decades, is the ground truth we are working toward encoding mathematically.

Never approximate the crotch curve with a simple arc. Always use bezier.

---

## 3b. THE TROUSER BLOCK STANDARD — LOCKED (27 Sep 2026)

Benson approved the classic Aldrich trouser block ("3 is the most accurate … use 3 as the standard and true pattern block"). It lives in `src/lib/blocks/trouserBlock.js` and every other part of the system (3D body, drape, measurements, tests) is built backwards from it.

What defines it:
- Each panel is drafted around its own CREASE, halfway between side seam and fork tip at the crotch line; knee and hem split evenly on the crease
- Front: waist WC/4 + 2cm (incl. dart), hip Hip/4 + ease, fly straight down CF then bezier to the fork
- Back: seat Seat/4 + 5cm, waist WC/4 + 5cm (incl. darts), CB leans 3.5cm toward the side and is raised 2.5cm (pitched waist), deep bezier seat curve, fork 1.6 × front and dropped 1cm
- Back leg 4cm wider than front at knee and hem
- Outseam French curve flips at hip line + (hip to knee length) / 2; inseam fork→knee hollowed 1cm; knee→hem ruled straight; grainline on each crease
- Vertical lengths (hip depth, waist-to-knee, waist-to-ankle) come from `legLengths()` in `src/lib/body/dims.js` — the SAME source the 3D body uses

How it is locked:
- `trouserBlock.standard.test.js` asserts every drafting rule above for 4 sizes × 3 fits and pins the geometry in a snapshot
- If those tests fail, the block changed. Do NOT "fix" the tests or run `vitest -u` unless the new shape has been approved by the pattern maker

The 3D side follows the block: the parametric avatar (§3c) and a drape that eases the 1cm back-fork drop, lays each panel's crotch seam along the body's centre line by arc length so the forks meet under the crotch, and never tears (tested by stretch across 5 body sizes).

## 3c. THE PARAMETRIC AVATAR (27 Sep 2026)

The mannequin is one signed-distance body in `src/lib/avatar/` — the same field is meshed for display and answers the fabric's collision queries, so what you see is what the fabric touches.
- `sdf.js` — primitives (round cones, ellipsoids, ellipse sections, smooth min, monotone keyframe curves)
- `body.js` — `createBodyModel()`: torso lofted through keyframed oval sections (separate front/back depth at the torso bottom: belly runs into the fly, seat curves under), round-cone legs and arms (A-pose, opened to clear the hips), neck, head. Then CALIBRATED: tape-measure girths (convex hull, like a real tape) for chest, waist, hip, seat and upper thigh are iterated to the measurements (±0.4%), and the crotch is moved to exactly one body rise below the waist
- `mesher.js` — surface nets, closed manifold mesh (checked; retried on a shifted grid if not)
- `avatar.js` — `createAvatar()`, `createAvatarModel()`, `bodyForDrape()`, `avatarMeshData()`; `avatar.worker.js` meshes off the main thread
- Each measurement changes its own region only (tested: hip, upper thigh, body rise, shoulder width)
- Drape collision: level (horizontal) push out from each row's wrap centre, then a push along the surface normal; fabric rests 3mm off the skin
- Tests: `avatar.test.js` (girths, height, crotch height, manifold mesh, crotch saddle, outward normals, speed, local morphs) for 5 bodies

## 3d. CLOTH PHYSICS — PBD SOLVER (28 Sep 2026)

On demand ("simulate" in the 3D view), never continuous: the live 2D ⇄ 3D sync stays on the instant geometric drape. Any edit, new body or "reset" returns to the live drape.
- `src/lib/cloth/pbd.js` — `buildCloth(instances)` turns drape instances into particles (drape mesh at 15mm spacing). Rest lengths come from the FLAT PATTERN with darts sewn (`sewnXY`), so the cloth relaxes to its true size. Panels are sewn where the drape put their edges together (side seams, inseams, CF, CB, crotch). The waistband (top 10mm on paper) is held at its height and softly in place; long-range tethers stop the legs creeping
- `createClothSim(cloth, body)` — each frame = 12 substeps: predict → stretch/shear, bending, tethers, seams → collisions in priority order: body SDF (projection along ∇d by the penetration depth, position-based Coulomb friction μs 0.6 / μk 0.35) → seams re-closed → cloth-cloth self-collision (spatial hash, 5mm thickness) → body SDF again (body always wins) → velocities with restitution (default 0: no bounce)
- Stability: rest lengths ramp from draped to pattern over 20 frames, capped corrections, speed clamp, soft compression (fabric buckles), bending 0.2 (below ~0.1 the mesh shivers)
- `runner.js` (frame loop, settle detection, cancel) is shared by `cloth.worker.js` and the main-thread fallback in `clothClient.js` (`simulateCloth()`); frames stream back as transferred Float32Arrays
- Tests: `pbd.test.js` (projection exactness, friction, restitution, self-collision, priority, no explosion, trousers settle on 2 bodies: nothing inside, seams closed, stretch < 1.6), `e2e/cloth.spec.js` (worker used, stop, reset, orbit while running, edits cancel)

---

## 4. COMPLETE FEATURE MANIFEST
*Every feature listed here must exist in the final product. Do not omit any of these.*

### Core Canvas
- [ ] 2D drawing canvas — place points, draw lines and bezier curves
- [ ] Real time measurement display as lines are drawn
- [ ] Grid with toggle (on/off)
- [ ] Zoom and pan
- [ ] Undo/redo
- [ ] Save and load pattern files
- [ ] Export pattern pieces (PDF, SVG, DXF)

### Measurement Input System
- [ ] Structured measurement input form — trouser set and shirt set
- [ ] Trouser measurements: waist, hip, crotch depth, upper thigh, waist-to-knee, waist-to-ankle, height
- [ ] Shirt measurements: chest, neck, shoulder width, back length, shirt length, sleeve length, armscye depth
- [ ] Derived measurements calculated automatically (arm span from height, hem width from waist formula, etc.)
- [ ] Body shape classification from drop values (hip minus chest)
- [ ] Body type toggles: buttocks prominence (flat/average/prominent), thigh fullness (inner/balanced/outer), posture (forward/upright/back)
- [ ] Ease selector: slim fit, regular fit, relaxed fit, oversized — auto-recalculates block
- [ ] Garment type selector: trouser, slack, jeans — auto-adjusts thigh ease

### Basic Block Engine — Trouser (Winifred Aldrich primary system)
- [ ] Automatic trouser block generation from measurements
- [ ] Construction lines rendered first (horizontal guides: waist, hip 1, hip 2, rise, knee, ankle)
- [ ] Crease line (vertical centre of leg)
- [ ] Front panel: waist width = WC/4 + 2cm, hip width = Hip/4 + ease, crotch fork = seat/6
- [ ] Front fly bezier curve — 45-degree approach, curves to waist
- [ ] Front dart: 10cm long, 2cm wide, at 1/16 WC from centre
- [ ] Knee width from knee circumference + ease
- [ ] Hem width = (0.125 × waist) + 13cm
- [ ] Back panel: waist = WC/4 + 5cm, seat = Hip/4 + 5cm
- [ ] Back seat bezier curve — deep curve for buttocks accommodation, no more than 1.5cm from fly line
- [ ] Back darts: dart 1 = 12cm × 2cm at 1/3 back waist, dart 2 = 10cm at 2/3 back waist
- [ ] Side seam connecting all horizontal reference points
- [ ] Upper thigh used directly for crotch extension — never derived from hip
- [ ] East African calibration layer — correction factors applied on top of Aldrich base

### Basic Block Engine — Shirt (Winifred Aldrich primary system)
- [ ] Automatic shirt block generation from measurements
- [ ] Back panel: armscye line = chest/2 + 8cm, back width point = back/2 + 2.5cm
- [ ] Side seam point = chest/3 + 1.5cm from back
- [ ] Back neck curve: 3/4 inch depth standard
- [ ] Front panel mirrored from back with deeper neck (8-9cm)
- [ ] Button placket: 1cm placket + 2cm fold = 3cm total
- [ ] Armscye bezier curve: within 1.25cm of straight at sides, 1.75cm at midpoint, 3cm at crown
- [ ] Sleeve block: crown height = armscye curve / 3, pivot method for sleeve cap construction
- [ ] Fit type auto-adjustment: slim (4-6cm ease), regular (8-10cm), relaxed (12cm+), oversized (16cm+)

### Basic Block Engine — Skirt
- [ ] Straight skirt block from waist and hip measurements
- [ ] A-line skirt block — flared from hip
- [ ] Dart placement at waist — front and back
- [ ] Side seam shaping from waist through hip to hem
- [ ] Hem length as user input

### Basic Block Engine — Dress (Bodice + Skirt combined)
- [ ] Bodice front and back block — bust dart system
- [ ] Waist seam joining bodice to skirt
- [ ] Princess seam variation
- [ ] Sleeve block attachment point

### Pattern Tools
- [ ] Seam allowance generation — user-defined amount added as separate layer
- [ ] Notches placement
- [ ] Grain line placement and rotation
- [ ] Mirror/flip pattern piece
- [ ] Move and rotate pieces on canvas
- [ ] Dart manipulation — open, close, pivot, transfer
- [ ] Slash and spread tool
- [ ] Seam relocation

### Grading
- [ ] Grade rules input per size
- [ ] Automatic grading across size range from base size
- [ ] Grade points visible and editable
- [ ] East African size range — not defaulting to European S/M/L/XL

### 3D Mannequin (Three.js — interactive, non-negotiable for designer adoption)
- [ ] Parametric 3D body avatar — scales from measurement inputs in real time
- [ ] Built on MakeHuman base mesh (CC0 license) — study bodyapps-viz on GitHub before building
- [ ] Upgrade path to Anny model (Apache 2.0, November 2025) for more accurate shape
- [ ] European standard defaults (ISO 8559, Aldrich size 40) as starting point — East African defaults when data arrives
- [ ] Minimum viable mannequin from 7 measurements — additional measurements refine progressively
- [ ] Interactive rotation — all angles via Three.js OrbitControls
- [ ] Zoom in/out
- [ ] Front / back / side camera presets
- [ ] Pattern pieces draped geometrically on mannequin
- [ ] Real time update when pattern is edited in 2D canvas
- [ ] Body shape toggles: buttocks prominence, thigh fullness, posture, shoulder slope, body shape, gender
- [ ] Fit correction logging — every factory fitting adjustment captured as East African calibration data
- [ ] East African / European defaults toggle (architecture ready from day one, data populates later)

### Fabric Physics (Three.js Layer 2 / Blender server-side Layer 3)
- [ ] Fabric type selector — cotton, wool, polyester, denim, cotton/poly blend, kitenge
- [ ] Fabric properties database using Kawabata Evaluation System (KES) values
- [ ] Basic drape simulation showing fabric behaviour on mannequin
- [ ] East African fabric database — locally measured kitenge, cotton drill, African print properties

### Technical Flats
- [ ] Front and back flat sketch drawing tools
- [ ] Construction detail annotation
- [ ] Stitch type indicators
- [ ] Pocket placement
- [ ] Closure indicators (zip, button, hook)

### Tech Pack Generator
- [ ] Auto-pull pattern measurements into tech pack
- [ ] Fabric and trim callouts
- [ ] Stitch specifications
- [ ] Construction sequence notes
- [ ] Size breakdown table
- [ ] Export to PDF
- [ ] Export to Excel

### GARMENTTRACK Bridge
- [ ] Style created in GarmentOS automatically creates production job in GARMENTTRACK
- [ ] Bill of Materials sync — fabric quantities, trim requirements
- [ ] Size run quantities
- [ ] Pattern version control linked to production batches

---

## 5. BUILD STAGE PLAN
*Always know which stage the current session is working on*

- **Stage 1** — Canvas foundation (2D drawing surface, points, lines, bezier curves, measurements)
- **Stage 2** — Split view with live 3D sync (2D canvas left + Three.js mannequin right, real time geometric draping bridge, two-way sync, OrbitControls rotation)
- **Stage 3** — Block engine — trouser (full Aldrich formula set, bezier crotch curve, generates directly into split view)
- **Stage 4** — Block engine — shirt (full Aldrich formula set, armscye bezier, sleeve block)
- **Stage 5** — Block engine — skirt (straight skirt, A-line, waist darts, side seam shaping, hem length input)
- **Stage 6** — Block engine — dress/bodice (bodice front and back, bust dart system, waist seam, princess seam variation, sleeve attachment)
- **Stage 7** — Pattern tools (seam allowance, notches, grain lines, mirror, dart manipulation, slash and spread)
- **Stage 8** — Grading (grade rules, automatic size range, East African size increments)
- **Stage 9** — Technical flats (design illustration layer)
- **Stage 10** — Tech pack generator (PDF and Excel export)
- **Stage 11** — Fabric physics (KES/Drape Tester database, on-demand drape simulation)
- **Stage 12** — GARMENTTRACK bridge (production integration)

---

## 6. TECHNICAL ARCHITECTURE

### Stack
- Frontend: React, served statically
- Styling: Tailwind CSS
- 3D: Three.js (browser-based, interactive mannequin and pattern draping)
- 2D Canvas: HTML Canvas or SVG — decision to be confirmed in Stage 1
- Backend: Node.js / Express (existing pattern from TBS and GARMENTTRACK)
- Database: PostgreSQL via Prisma
- Hosting: Railway
- Server-side simulation (Stage 9): Blender cloth solver via Python API

### Tailwind v4 rules — this project uses Tailwind v4, not v3
- NO tailwind.config.js — it does not exist in v4
- Custom colours, fonts, breakpoints go in index.css using @theme directive
- Entry point is @import "tailwindcss" — never use @tailwind base/components/utilities
- Use bg-linear-to-* not bg-gradient-to-* for gradients
- No content array needed — v4 auto-detects files
- Arbitrary values often work without brackets — h-100 not h-[100px] for standard values
- Custom theme example:
```css
@import "tailwindcss";
@theme {
  --color-canvas: #1a1a2e;
  --color-panel: #16213e;
  --color-accent: #e94560;
}
```

### Key architectural decisions — do not reverse these
- Web-based, not desktop — runs in browser, no installation
- 3D mannequin is interactive and real time — not static renders
- East African body data is a first-class input, not an afterthought
- Crotch curve is always bezier — never a simple arc
- Seam allowances are a separate layer from the block — never baked in
- Block system is Winifred Aldrich as primary, with East African calibration layer on top
- Upper thigh measurement is always used directly for crotch extension — never derived from hip

### Free resources confirmed for use
- Three.js (MIT license) — github.com/mrdoob/three.js
- MakeHuman base mesh (CC0 for exports) — makehuman.org
- Anny parametric body model (Apache 2.0) — arxiv.org/abs/2511.03589
- bodyapps-viz — MakeHuman + Three.js browser implementation — github.com/OpnTec/bodyapps-viz
- Blender cloth solver (GNU GPL) — blender.org
- Newton Physics with Style3D cloth example (Apache 2.0) — github.com/newton-physics/newton
- Cannon.js browser physics (MIT) — github.com/schteppe/cannon.js
- KES fabric property values — from published academic papers (cited in research docs)
- Style3D Atelier free tier — for designer testing and research reference

---

## 7. RESEARCH DOCUMENTS
*Read these files for deeper context on specific topics*

- `GARMENTOS-RESEARCH.md` — Master consolidated research document — read this first
- `GARMENTOS-MANNEQUIN-RESEARCH.md` — Complete dress form measurements (25 points), ISO 8559, MakeHuman/Anny/bodyapps-viz, Stage 2 build architecture, minimum viable mannequin set
- `GARMENTOS-BASIC-BLOCKS-RESEARCH.md` — Complete trouser and shirt block formulas, construction sequences, mathematical relationships, video resources
- `GARMENTOS-HUMAN-ANATOMY-RESEARCH.md` — Body proportions, Vitruvian Man, East African body data, academic research findings, body shape classification, crotch geometry
- `GARMENTOS-FABRIC-SCIENCE-AND-3D-RESEARCH.md` — Kawabata fabric properties, Three.js plan, Blender integration, Style3D papers, 3D build sequence

---

## 8. PEOPLE AND RELATIONSHIPS

**Benson** — founder, manufacturer, vibe coder. Runs garments factory in Ruai, Nairobi. Works unconventional hours. Prefers minimal, direct communication. No bold or headers in conversational responses.

**Benson's brother** — lead designer. Current Clo3D user. Will only adopt GarmentOS if it has an interactive 3D mannequin he can rotate and tweak in real time. This feature is his specific requirement and must not be compromised.

**Benson's father** — master tailor. Decades of fitting Kenyan bodies. His core knowledge: the crotch bezier curve is the secret to a well-fitting trouser. His hand-drawn curve is the East African ground truth we are encoding mathematically.

---

## 9. WHAT NOT TO DO

- Do not use simple arcs for the crotch curve — always bezier
- Do not derive upper thigh from hip — measure it directly
- Do not default to European body proportions for the mannequin
- Do not bake seam allowances into the block — keep them as a separate layer
- Do not hardcode ease values — they must be user-selectable
- Do not skip the East African calibration layer even in early stages — build the architecture for it from the start
- Do not build a static mannequin — the designer requires real time interactive rotation
- Do not omit the GARMENTTRACK bridge from the architecture even in early stages

---

*Last updated: September 2026 (classic trouser block locked; parametric avatar; PBD cloth solver)*
*All three research documents should be present in the project directory*
