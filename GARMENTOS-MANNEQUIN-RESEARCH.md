# GarmentOS — Dress Form Mannequin Research
## Measurements, 3D Body Models, and Parametric Avatar Architecture
*Research for Stage 2 build — Interactive Parametric Mannequin*

---

## 1. THE APPROACH — EUROPEAN BASE WITH ADJUSTABLE PARAMETERS

The GarmentOS mannequin strategy:
- Start from European standard measurements as the geometric base — well documented, immediately available
- Expose every key proportion as a user-adjustable input
- Mannequin scales in real time as measurements are entered
- When Dr. Kinuthia's data or fit correction data accumulates, update the default starting proportions to East African — architecture already supports it
- Every real Nairobi body entered is implicitly East African calibration data

This means the designer gets his interactive mannequin immediately without waiting for a dataset that doesn't exist yet.

---

## 2. THE INTERNATIONAL STANDARD — ISO 8559

ISO 8559 is the global standard for body measurement definitions used in clothing. It defines exactly where and how each measurement is taken so that "waist girth" means the same thing to every tailor, manufacturer, and researcher globally.

**ISO 8559-1:2017** — Anthropometric definitions for body measurement
- Provides the complete list of measurements for creating physical and digital anthropometric databases
- Used as the basis for creating fit mannequins
- Referenced by Clo3D, Browzwear, and every major pattern software
- This is the measurement language GarmentOS must speak

**ISO 8559-2** — Primary and secondary dimension indicators for garment types

GarmentOS should align its measurement definitions with ISO 8559-1. This ensures interoperability with other tools, academic research, and Dr. Kinuthia's future data which will also be ISO-aligned.

---

## 3. COMPLETE MEASUREMENT LIST FOR THE PARAMETRIC MANNEQUIN

Organised into tiers — Tier 1 are user inputs, Tier 2 are derived automatically, Tier 3 are shape toggles.

### TIER 1 — PRIMARY USER INPUTS (must be entered, cannot be reliably derived)

**Girth measurements (circumferences):**
| # | Measurement | ISO name | Description |
|---|---|---|---|
| 1 | Neck girth | Neck girth | Around base of neck |
| 2 | Chest/bust girth | Chest girth | Fullest part of chest |
| 3 | Waist girth | Waist girth | Natural waist, narrowest point |
| 4 | Hip girth | Hip girth | Fullest part of hips |
| 5 | Seat girth | Seat girth | Fullest part of seat/buttocks |
| 6 | Upper thigh girth | Thigh girth | At crotch level — CRITICAL |
| 7 | Knee girth | Knee girth | Around centre of knee |
| 8 | Calf girth | Calf girth | Fullest part of calf |
| 9 | Upper arm girth | Upper arm girth | Fullest part of upper arm |
| 10 | Wrist girth | Wrist girth | Around wrist bone |

**Length/height measurements:**
| # | Measurement | ISO name | Description |
|---|---|---|---|
| 11 | Total height | Stature | Crown of head to floor |
| 12 | Cervical height | Cervical height | Base of neck (7th vertebra) to floor |
| 13 | Waist height | Waist height | Natural waist to floor |
| 14 | Hip height | Hip height | Fullest hip point to floor |
| 15 | Crotch height | Crotch height | Crotch to floor (= inseam) |
| 16 | Knee height | Knee height | Centre knee to floor |
| 17 | Back waist length | Back length | 7th vertebra to natural waist |
| 18 | Front waist length | Front length | Shoulder to natural waist front |
| 19 | Body rise | Body rise | Waist to seat when sitting |
| 20 | Shoulder length | Shoulder length | Neck to shoulder point |
| 21 | Sleeve length | Sleeve length | Shoulder point to wrist |
| 22 | Arm length | Arm length | Shoulder point to wrist (straight arm) |

**Width measurements:**
| # | Measurement | ISO name | Description |
|---|---|---|---|
| 23 | Shoulder width | Shoulder width | Shoulder point to shoulder point across back |
| 24 | Back width | Across back | Between armhole seams at back |
| 25 | Chest width | Across chest | Between armhole seams at front |

### TIER 2 — DERIVED AUTOMATICALLY (calculated from Tier 1 inputs)

| Derived measurement | Formula | Source |
|---|---|---|
| Arm span | Height × 1.0 | Vitruvian Man — within 2.3% accuracy |
| Foot length | Height / 6 | Vitruvian Man |
| Waist to knee | Waist height - Knee height | From height measurements |
| Waist to hip distance | Waist height - Hip height | From height measurements |
| Inseam | Crotch height | Direct from floor measurement |
| Neck approximate | Chest × 0.37 | Statistical approximation — user can override |
| Hem width for trousers | (Waist × 0.125) + 13cm | Aldrich formula |
| Armscye depth | Chest / 4 | Aldrich formula — user can override |

### TIER 3 — SHAPE TOGGLES (qualitative adjustments to mannequin shape)

| Toggle | Options | Effect on mannequin |
|---|---|---|
| Buttocks prominence | Flat / Average / Prominent | Adjusts back seat curve depth |
| Buttocks position | High / Middle / Low | Shifts fullest point up or down |
| Thigh fullness | Inner / Balanced / Outer | Adjusts inner vs outer thigh shape |
| Back posture | Forward / Upright / Backward | Tilts spine angle |
| Shoulder slope | Sloped / Average / Square | Adjusts shoulder angle |
| Body shape | Rectangular / Inverted triangle / Trapezoid / Oval | Adjusts overall silhouette proportions |
| Gender | Male / Female | Switches base mesh and proportion defaults |

---

## 4. EUROPEAN STANDARD DEFAULT VALUES (starting point before user input)

Based on ISO 8559 and Winifred Aldrich size 40 (European men's medium):

| Measurement | Default value (cm) |
|---|---|
| Height | 178 |
| Neck girth | 38 |
| Chest girth | 100 |
| Waist girth | 84 |
| Hip girth | 100 |
| Seat girth | 102 |
| Upper thigh girth | 58 |
| Knee girth | 40 |
| Calf girth | 37 |
| Upper arm girth | 33 |
| Wrist girth | 17 |
| Back waist length | 44 |
| Shoulder width | 46 |
| Body rise | 29 |
| Inseam/crotch height | 81 |
| Sleeve length | 65 |

These defaults load on launch. The moment a user enters their measurements all values update and the mannequin rescales. The defaults are never the final mannequin — they are just the starting shape.

**Future East African defaults (when data is available):**
Based on Bergmann's Rule and existing East African anthropometric research, expected adjustments:
- Height: likely similar (~175-178cm for Kenyan men)
- Waist and hip: potentially leaner proportions
- Limb lengths: potentially longer relative to torso
- Seat prominence: differs from European norm
- Dr. Kinuthia's data will confirm exact values

---

## 5. FREE OPEN SOURCE 3D BODY MODELS — CRITICAL FINDS

These are the most important discovery for the mannequin build. Instead of building the 3D body mesh from scratch, GarmentOS uses an existing open source parametric body model as the foundation.

### MakeHuman (Primary recommendation)
- Free and open source — GNU Affero GPL for software, CC0 for exported models
- CC0 means exported mannequin models are public domain — usable in commercial products
- Built on morphing technology — a single base mesh transforms via linear interpolation
- Supports: height, weight, gender, ethnicity, muscularity, age via sliders
- Exports to multiple formats including OBJ and FBX — importable into Three.js
- makehuman.org
- This is the foundation most professional 3D fashion tools are built on

### Anny (November 2025 — most recent and most relevant)
- Built on MakeHuman assets but more sophisticated
- Apache 2.0 license — fully free including commercial use
- 13,380 vertices, 163 bones — high quality mesh
- 564 artist-defined blendshapes (phenotypes) — age, gender, height, weight, muscle, local features
- Calibrated against WHO population statistics — demographically grounded
- Differentiable — shape parameters can be optimised mathematically against measurements
- Supports all ages from infant to elderly in one unified model
- arxiv.org/abs/2511.03589 — paper with implementation
- NAVER LABS Europe — released February 2026
- This is the most promising base model for GarmentOS — it can be optimised to fit any set of measurements

### bodyapps-viz (CRITICAL — already combines MakeHuman + Three.js)
- Open source project on GitHub that does exactly what GarmentOS needs for Stage 2
- Uses MakeHuman models as base
- Runs in browser using Three.js
- Supports male, female, and kids body models
- Morph targets for body customisation
- github.com/OpnTec/bodyapps-viz
- This is essentially a working prototype of the GarmentOS mannequin — study this codebase before building Stage 2

### SMPL (for reference — used in academic research)
- Statistical parametric body model from Max Planck Institute
- Used in most academic 3D body research
- Shape parameters (betas) can be optimised against measurements
- More complex to work with than MakeHuman
- Useful reference for how measurement-to-shape optimisation works
- smpl.is.tue.mpg.de

---

## 6. THE PICTOFIT INSIGHT — MINIMUM VIABLE MEASUREMENTS

Pictofit (a commercial fashion tech company) published that their personalised mannequin system achieves 94% body shape accuracy from only 6 input measurements.

Their 6 measurements:
1. Height
2. Weight (used to estimate volume/mass)
3. Chest/bust girth
4. Waist girth
5. Hip girth
6. One length measurement (varies by garment type)

This means GarmentOS does not need all 25 measurements to generate a convincing mannequin. A minimum viable mannequin (Phase 1 of Stage 2) can work with 6-8 measurements and still give the designer something useful to work with immediately. Additional measurements refine the shape progressively.

**GarmentOS minimum viable mannequin input set:**
1. Height
2. Chest girth
3. Waist girth
4. Hip girth
5. Body rise (crotch depth)
6. Shoulder width
7. Back waist length

These 7 measurements generate a mannequin accurate enough for the designer to start working. The remaining 18 measurements add refinement and are requested as the user needs them.

---

## 7. BUILD ARCHITECTURE FOR STAGE 2

### Option A — MakeHuman/Anny + Three.js (recommended)
1. Export a male base mesh from MakeHuman as OBJ or GLTF
2. Load into Three.js as the base mannequin
3. Define morph targets for each key measurement (chest expands when chest girth increases, etc.)
4. User inputs measurement → Three.js interpolates morph targets → mannequin updates in real time
5. Interactive rotation via Three.js OrbitControls
6. Camera presets for front, back, side views

Complexity: moderate. The bodyapps-viz GitHub project has working code for this exact approach. Study it first.

### Option B — Anny parametric optimisation (more sophisticated)
1. Use Anny's differentiable shape space
2. User inputs measurements → optimise Anny's shape parameters (betas) to match measurements
3. Output is a posed 3D mesh that matches the entered measurements
4. Render in Three.js

Complexity: harder — requires Python backend for optimisation. Better result. Build this after Option A is working.

### Recommended sequence:
- Stage 2a: Option A — MakeHuman base mesh + Three.js morph targets. Designer gets his mannequin fast.
- Stage 2b: Option B — Anny optimisation for more accurate body shape. Upgrade path when Option A proves itself.

---

## 8. MEASUREMENT INPUT UX

The measurement input experience must be simple enough for a factory worker to use, not just a pattern maker.

**Recommended UX flow:**
1. Select garment type (trouser / shirt / jacket)
2. Enter minimum viable set (7 measurements) — mannequin appears immediately
3. "Add more measurements" button reveals additional refinements
4. Each measurement input has an illustration showing exactly where to measure
5. Measurements can be saved as a client profile
6. Profiles can be recalled to generate new patterns without re-measuring

**Measurement illustrations:**
Source from University of Fashion's "How to Measure the Male Body" content (93 measurement point diagrams). These are behind a paywall but the measurement definitions are in ISO 8559-1 which is referenced in many free publications.

---

## 9. FREE RESOURCES CONFIRMED

| Resource | What it provides | License | URL |
|---|---|---|---|
| MakeHuman | Base 3D body mesh, morph targets | CC0 for exports | makehuman.org |
| Anny | Sophisticated parametric body model | Apache 2.0 | arxiv.org/abs/2511.03589 |
| bodyapps-viz | Working MakeHuman + Three.js browser implementation | Open source | github.com/OpnTec/bodyapps-viz |
| Three.js | 3D rendering, rotation, morph target animation | MIT | github.com/mrdoob/three.js |
| ISO 8559-1 | Measurement definitions and methodology | Referenced in free papers | iso.org/standard/61686 |
| SMPL model | Academic parametric body reference | Research use | smpl.is.tue.mpg.de |

---

## 10. EAST AFRICAN CALIBRATION PATH (when data becomes available)

When Dr. Kinuthia's research data surfaces or when GarmentOS accumulates fit correction data from Nairobi production:

1. Measure the deviation between Aldrich European defaults and real East African bodies at each measurement point
2. Store these as East African correction factors
3. Add a toggle to GarmentOS: "East African defaults / European defaults"
4. When East African is selected, the mannequin starts from East African proportions instead of European
5. The mannequin architecture does not change — only the default values change

Every production fitting in a Nairobi factory where a pattern maker notes "let out 2cm at the seat" is a data point. Build a simple fit correction logging feature into GarmentOS from Stage 3 onwards so this data is captured automatically.

---

*Document status: v1.0 — Dress form mannequin measurements and 3D body model research*
*Key finding: bodyapps-viz GitHub project already implements MakeHuman + Three.js in browser — study this before writing Stage 2 code*
*Key finding: Anny (Apache 2.0, November 2025) is the most sophisticated free parametric body model available — ideal upgrade path for Stage 2b*
