# GarmentOS — Master Research Document
## All Research Compiled in One File for Claude Code Reference
*Last updated: April 2026 — Read this alongside CLAUDE.md at the start of every session*

---

# PART 1: HUMAN ANATOMY & BODY PROPORTIONS
## Understanding the Body Before Clothing It

---

## 1.1 THE CORE PRINCIPLE

Fabric is the response to the body — not the starting point. Before a single pattern line is drawn, the body must be understood as a three-dimensional geometric object with consistent internal proportional relationships.

The human body has two types of measurements:
- **Primary/independent dimensions** — measurements that do not reliably predict each other (height, waist, hip independently vary)
- **Proportional/derived dimensions** — measurements that correlate strongly with primary ones and can be calculated rather than measured

GarmentOS reduces user input burden by knowing which measurements are truly independent and which can be derived.

---

## 1.2 THE VITRUVIAN MAN — WHAT IS ACTUALLY TRUE

Leonardo da Vinci documented human proportional relationships around 1490. Contrary to popular belief, **he did not use the golden ratio** — he used whole number fractions. The golden ratio appears in the body only approximately and varies significantly across individuals. It is not a reliable engineering constant for pattern making.

These are the proportions that are actually documented and experimentally verified:

| Relationship | Ratio | Verification |
|---|---|---|
| Wingspan = Height | 1:1 | Experimentally confirmed at 1.023 — within 2.3% |
| Head height = 1/8 of total height | 1:8 | Consistent |
| Foot length = 1/6 of height | 1:6 | Consistent |
| Face height = 1/10 of height | 1:10 | Consistent |
| Elbow to fingertip = 1/5 of height | 1:5 | Consistent |
| Chest = halfway between head and genitals | 1:2 | Consistent |
| Knees = halfway between genitals and feet | 1:2 | Consistent |

**For GarmentOS:** wingspan = height means a user who provides height gives us a reliable arm span estimate — one less measurement to ask for.

---

## 1.3 THE THREE DIMENSIONS OF THE HUMAN BODY

Research consistently finds that human body measurements cluster into three primary axes:

**Axis 1 — Horizontal Circumferences (the girth dimension)**
Waist, chest, hip, seat, thigh, neck, upper arm. Primary drivers of garment fit. From PCA research: chest, waist, hip, and shoulder cluster together as the dominant horizontal component.

**Axis 2 — Vertical Heights (the length dimension)**
Total height, shoulder to waist, waist to hip, waist to knee, waist to ankle, crotch depth, armscye depth. Determine where fabric falls on the body.

**Axis 3 — Width and Shape (the silhouette dimension)**
Hip width vs circumference, shoulder width, back width, buttocks prominence, thigh shape. Differentiates body types within the same size.

Key finding: only 9.15% of people are consistent across bust, waist, and hip within standard sizing categories. 90.84% vary. This is why standard sizes fail most people.

---

## 1.4 PREDICTIVE RELATIONSHIPS BETWEEN MEASUREMENTS

**What can be reliably predicted:**

From height: arm span (×1.0), foot length (÷6), rough body segment lengths

From chest: waist and hip can be estimated (bust is statistically significant predictor of hip per South African research) — but with individual variation

From waist: hip (consistent within body shape types), thigh (waist-to-thigh ratio is stable)

**What CANNOT be reliably predicted — must be measured directly:**
- Crotch depth — varies independently of height and hip — most common source of standard sizing failure
- Back length — varies independently
- Upper thigh circumference — varies independently — critical for trouser fit
- Shoulder width — varies independently of chest circumference

**Minimum measurement set — trouser block:**
1. Waist circumference
2. Hip circumference
3. Crotch depth (body rise)
4. Upper thigh circumference
5. Waist to knee
6. Waist to ankle
7. Height

**Minimum measurement set — shirt block:**
1. Chest circumference
2. Neck circumference
3. Shoulder width
4. Back length (shoulder to waist)
5. Shirt length
6. Sleeve length
7. Height

---

## 1.5 THE EAST AFRICAN / KENYAN BODY — CRITICAL FINDINGS

**The sizing gap (confirmed by Kenyatta University research):**
Kenya Bureau of Standards body size charts are based on data adapted from non-Kenyan foreign samples. Every garment sized to Kenyan standards is built on the wrong body. This is the fundamental problem GarmentOS solves.

**What is known about African body proportions vs European standards:**
- African body morphotypes show significant differences from European sizing assumptions
- Triangle, hourglass, and rectangle are the three most predominant shapes among African women — but their specific proportions differ from Caucasian women of the same shape category
- African male anthropometric data from Ethiopia shows average BMI of 20.63 — significantly leaner than Western male sizing assumptions
- South African male morphotypes from 3D scanning found distinct body clusters that do not match European sizing systems
- Research has identified two unique body shapes for Kenyan women that differ from established Western categories

**Bergmann's Rule context:**
Populations in warmer climates (East Africa) trend toward leaner, longer limb proportions compared to cold-climate populations. European-derived blocks systematically produce garments with too much bulk in the torso and too little length in the limbs for East African bodies.

**GarmentOS calibration path:**
1. Build block engine on Aldrich formulas (best available starting point)
2. Use in production on real Kenyan bodies
3. Collect fit correction data
4. Derive East African correction factors
5. Build the first East African body standard — the long-game competitive moat

---

## 1.6 MALE BODY SHAPE CLASSIFICATION FOR MENSWEAR

**Rectangular** — chest, waist, and hip approximately equal. Most common in East African male population. Minimal waist suppression needed.

**Inverted triangle** — chest significantly wider than waist and hip. Athletic build. Shirt needs wider shoulder and chest, trousers need less hip room.

**Oval/round** — waist equals or exceeds hip and chest. More ease in waist, adjusted crotch depth, modified front rise angle.

**Trapezoid** — hip wider than chest, waist narrower than both. Common in African male bodies. Standard blocks underestimate hip room.

**Key body component variables beyond circumference:**
- Buttocks prominence (flat/average/prominent) — directly affects back seat bezier curve
- Buttocks position (high/middle/low fullness) — changes where curve peaks
- Thigh shape (inner/outer fullness) — affects inseam vs outseam shaping
- Back vs front length asymmetry — torso is not symmetrical

---

## 1.7 THE GEOMETRIC ARCHITECTURE OF THE BODY

The human torso is a series of cylinders of varying diameter stacked vertically, each slightly tilted relative to the one below. Pattern making converts this 3D cylindrical geometry into 2D flat planes that sew back into the 3D shape.

**Stable proportional constants (use as cross-checks in GarmentOS):**
```
Arm span ≈ Height (ratio ~1.0)
Foot length ≈ Height / 6
Forearm + hand ≈ Armpit to hand / 1.715
Crotch depth ≈ Outside leg - Inside leg
Chest position ≈ Height / 2 from top of head
```

**Relationships that vary by body type (not constants):**
```
Hip / Waist — varies significantly (the "drop" value)
Thigh / Hip — varies by muscle mass and fat distribution
Shoulder width / Chest — varies by build type
Back length / Front length — varies by posture
```

---

## 1.8 THE CROTCH CURVE — THE GEOMETRIC PROBLEM AT THE CENTRE

**Benson's father's teaching, validated by academic research:**
The secret to a properly fitting and comfortable trouser is in the bezier curve at the crotch.

**Why the crotch is geometrically complex:**
The crotch must simultaneously satisfy three constraints:
1. The circumference of the seat (horizontal wrap around the body)
2. The rise depth (vertical travel from waist to crotch)
3. The inseam angle (how the leg cylinder departs from the torso cylinder)

A simple arc cannot solve all three simultaneously. A bezier curve can — it allows smooth transition between different tangent angles with controlled intermediate shape.

**The curve requirements:**
- Start near-vertical at the inseam point
- Transition through the complex fork
- Arrive near-horizontal at the seat
- Accommodate the mass of the buttocks behind the body's centre line

**Front vs back crotch bezier — they are different shapes:**
- Front: shallow, nearly vertical curve (fly area)
- Back: deep, dramatically curved seat (buttocks accommodation)

**The East African calibration target:**
Benson's father's hand-drawn crotch curve, calibrated over decades of fitting Kenyan bodies, is the East African bezier ground truth. Photograph it. Digitise it. Encode it. That curve is worth more than any Winifred Aldrich formula for this market.

**NEVER use a simple arc for the crotch curve. Always bezier.**

---

## 1.9 DR. ROSE OTIENO — KEY RESEARCH FINDINGS

Dr. Rose Bujehela Otieno (1960s–October 30, 2025) — Senior Lecturer, Fashion Design and Marketing, Kenyatta University. PhD in Anthropometrics, Manchester Metropolitan University. She passed away October 30, 2025 after a prolonged illness. GarmentOS is built to honour and complete her work.

**Kenyan children's sizing study (PhD thesis + two papers, 1999–2000)**
Anthropometric survey of 618 female Kenyan children aged 2–6 in Nairobi. Analysed 33 body parameters. Key finding: **height, outside leg, chest, and hip** are the four anchor dimensions for a Kenyan sizing system. These are the independent variables from which other dimensions derive for Kenyan bodies specifically.

**Three-issue framework (2008, EuroMed Journal of Business)**
Three problems clothing anthropometrics must solve:
1. Adequate measurement of the body
2. Analysis of significant data for size charts
3. Use of size charts to assure consumer satisfaction

This is exactly the three-step problem GarmentOS solves.

**3D Body Measurement Technology: Implications for Africa (2013, AJEST)**
- Kenyan sizing charts confirmed as adapted from foreign samples
- Anthropometric data for African populations absent from global literature
- Explicitly recommended industry-academic collaboration to fill this gap
- Identified 3D scanning as the frontier technology

**Active collaboration:**
Dr. Lydia Nkatha Kinuthia — Department of Textile Technology, School of Engineering, Kirinyaga University. Contact: nkinuthia@kyu.ac.ke. She has responded positively and is open to collaboration. She co-supervised the 2024 Kenyan maternity wear sizing study with Dr. Otieno. She is the active academic contact for GarmentOS anthropometric data.

---

# PART 2: BASIC BLOCK CONSTRUCTION
## Pattern Drafting Formulas and Construction Logic

---

## 2.1 DRAFTING SYSTEM — PRIMARY REFERENCE

**Winifred Aldrich — Metric Pattern Cutting** is the primary reference system for GarmentOS block geometry. It is the most widely taught academic system globally, metric-based, with clear formulas. Most pattern makers in Kenya were trained on it. It is the starting point — East African calibration is the destination.

Secondary references:
- Müller & Sohn (Germany) — industrial precision, tailoring focus
- Bunka (Japan) — body-hugging fit, detailed ease tables
- Helen Joseph Armstrong (USA) — design variation techniques

---

## 2.2 TROUSER BLOCK — COMPLETE FORMULA SET

### Required body measurements
| Measurement | Code | Notes |
|---|---|---|
| Waist circumference | WC | Natural waist |
| Hip circumference | HC | Fullest part |
| Waist-to-hip distance | WH | Vertical drop |
| Body rise (crotch depth) | BR | Waist to seat when sitting |
| Waist-to-knee | WK | Vertical |
| Waist-to-ankle | WA | Full length reference |
| Upper thigh circumference | UT | At crotch level — CRITICAL, never derive from hip |
| Knee circumference | KC | For leg shaping |

### Key construction lines (vertical axis, top to bottom)
1. Waist Line
2. Hip Line 1 (HC1)
3. Hip Line 2 (HC2)
4. Body Rise Line (BR) — seat/crotch level
5. Knee Line (KH)
6. Ankle Line

### Front panel formulas
```
Front waist width = (WC / 4) + 2cm
Front hip width = (HC / 4) + ease
Crotch fork each side = seat / 6
Crotch extension = from upper thigh (NEVER from hip)
Front fly curve = bezier, 45-degree approach from fork, curves to waist
Front dart = 10cm long, 2cm wide, at 1/16 WC from centre
Knee width = (KC + ease) / 2, split either side of crease
Hem width = (0.125 × WC) + 13cm
```

### Back panel formulas
```
Back waist width = (WC / 4) + 5cm
Back seat width = (HC / 4) + 5cm
Back crotch extension = wider than front (seat accommodation)
Back seat curve = bezier, from seat angle through rise, max 1.5cm from fly line
Back dart 1 = 12cm long, 2cm wide, at 1/3 distance across back waist
Back dart 2 = 10cm long, 2cm wide, at 2/3 distance across back waist
Side seam = connects waist through hip down to hem via all horizontal references
```

### Ease by garment type
| Type | Upper thigh ease |
|---|---|
| Formal trousers | 4 inches (10cm) or more |
| Slacks | ~2.5 inches (6.5cm) |
| Jeans | 1-2 inches (2.5-5cm) |

Ease is user-selectable in GarmentOS — not hardcoded.

### Men vs women trouser block differences
- Men: no pronounced hip curve, wider back seat extension, fly at centre front (not back), less waist-to-hip differential, less curved front crotch

---

## 2.3 SHIRT BLOCK — COMPLETE FORMULA SET

### Required body measurements
| Measurement | Notes |
|---|---|
| Chest circumference | Fullest part |
| Neck circumference | Base of neck |
| Shoulder width | Back, bone to bone |
| Back length | Shoulder to waist, centre back |
| Shirt length | Shoulder to desired hem |
| Sleeve length | Shoulder point to wrist |
| Armscye depth | Shoulder to underarm |

### Back panel formulas
```
Armscye line width (BC) = (chest / 2) + 8cm
Back width point (I) = (back measurement / 2) + 2.5cm from B along armscye
Side seam point (K) = (chest / 3) + 1.5cm from B along armscye
KL upward = 3.5cm (sleeve/armhole junction)
Sleeve crown height = armscye curve length / 3
Back neck curve depth = 3/4 inch standard
```

### Front panel
```
Front neck depth = 8-9cm from shoulder (deeper than back)
Button placket = 1cm placket + 2cm fold = 3cm total from centre front
Armscye bezier = connect U, Q, M, L, Y with smooth curve:
  — within 1.25cm of straight line at sides
  — within 1.75cm at midpoint
  — within 3cm at crown
```

### Fit types from one block
```
Slim fit = chest ease 4-6cm
Regular fit = chest ease 8-10cm
Relaxed fit = chest ease 12cm+
Oversized = chest ease 16cm+
```

Fit type is user-selectable — ease auto-recalculates and block redraws.

### Sleeve block (derived from shirt block)
```
Sleeve crown height = armscye curve / 3
Construction uses pivot method — ruler pivots on crown point intersecting construction lines
Sleeve length = vertical line from crown to desired length
Wrist width = wrist measurement + ease
```

---

## 2.4 CANVAS IMPLEMENTATION LOGIC

Every measurement maps to geometric coordinates on the canvas:
```
Body measurements → mathematical formulas → XY points on canvas
Points → connect via straight lines or bezier curves
Bezier curves required for: crotch, armscye, neck
```

**Construction sequence for GarmentOS block generation:**
1. User inputs body measurements
2. System calculates all derived points
3. Canvas renders construction lines (horizontal and vertical guides)
4. Points plotted at calculated positions
5. Lines and curves connect points
6. Block outline highlighted as final shape
7. User can drag points to adjust fit manually

**Seam allowances are a separate layer — NEVER baked into the block.**

---

## 2.5 VIDEO RESOURCES FOR BLOCK RESEARCH

**University of Fashion (universityoffashion.com) — primary video reference**
Paywalled but the most structured professional menswear block curriculum available. Recommended watch sequence:
1. How to Measure the Male Body (93 measurement points + downloadable charts)
2. Drafting a Men's Upper Body Block
3. Drafting a Men's Set-in Sleeve Sloper
4. Drafting a Men's Shirt Block
5. Drafting a Men's Trouser Block
6. Drafting a Men's Pleated Trouser

**Dresspatternmaking.com YouTube channel**
youtube.com/channel/UCiWmFg4YtA0t30V5da3YUeA
Free. Three-part pants block series. Key insight: upper thigh must be used directly, not derived from hip. Most technically rigorous free resource.

**Critical observation:** The crotch curve and back seat angle cannot be fully taught by text or formulas alone — they require watching a hand move through the curve in real time. Watch the University of Fashion and Dresspatternmaking videos before writing bezier curve logic.

---

# PART 3: FABRIC SCIENCE & 3D SIMULATION
## Free Resources for Cloth Physics and Fabric Properties

---

## 3.1 THE DESIGNER'S REQUIREMENT (NON-NEGOTIABLE)

Benson's brother is the primary designer. He uses Clo3D. His requirement for adopting GarmentOS: an interactive 3D mannequin he can rotate in real time and see pattern tweaks update live. Without this, GarmentOS is "shit" compared to what he currently uses. This is not a nice-to-have. It is the adoption threshold.

---

## 3.2 THE THREE-LAYER 3D ARCHITECTURE

**Layer 1 — Interactive Parametric Mannequin (Stage 2)**
3D body avatar scaled from measurement inputs. Rotate, zoom, any angle. Three.js, browser-based. Pure geometry, no physics. East African proportions from Dr. Kinuthia's data.

**Layer 2 — Geometric Pattern Draping (Stage 3)**
Pattern pieces wrapped mathematically on mannequin surface. Real time update when pattern is edited. Still Three.js. No physics engine yet — pure geometry. Designer sees garment assembled and can rotate and inspect.

**Layer 3 — Fabric Physics Simulation (Stage 8+)**
Actual fabric behaviour — drape, gravity, stiffness, shear. Physics engine enters here. Built on top of correct geometry. Not the first version.

---

## 3.3 FREE 3D AND PHYSICS ENGINES

**Three.js — primary choice (Layers 1 and 2)**
- Open source JavaScript 3D library, browser-native
- MIT license — free including commercial use
- Handles interactive rotation, zoom, real time updates
- github.com/mrdoob/three.js
- Cloth simulation extension exists — suitable for geometric draping, not physics

**Blender Cloth Solver — Layer 3 server-side**
- Production-grade cloth simulation used in film and game studios
- Open source (GNU GPL), completely free
- Runs server-side via Python API — Claude Code can work with it directly
- Workflow: pattern edit → send to server → Blender simulates → result returned
- blender.org, docs.blender.org/manual/en/latest/physics/cloth

**Newton Physics — GPU-accelerated with Style3D cloth example**
- Open source, Apache 2.0 license — free including commercial use
- Built on NVIDIA Warp
- Includes cloth_style3d example — implements Style3D's approach in open source
- github.com/newton-physics/newton
- Significant: Style3D's simulation approach is available free here

**Cannon.js — browser-based physics alternative**
- MIT license, runs in browser
- Lighter than Blender, faster but less realistic
- Good for basic drape approximation in browser
- github.com/schteppe/cannon.js

**NeuralClothSim (NeurIPS 2024)**
- Neural deformation fields + Kirchhoff-Love thin shell theory
- Most recent academic advance in cloth simulation
- Official implementation on GitHub
- Research-grade — shows the direction of future free cloth simulation

---

## 3.4 STYLE3D — THE CHINESE REFERENCE

Style3D is a Chinese company with a cloth simulation engine considered equal to or better than Clo3D in specific areas. They publish their research freely at SIGGRAPH.

**SIGGRAPH Asia 2023 papers (publicly available):**
1. Stability improvement for dihedral-angle-based bending using analytic eigensystem and adaptive geometric stiffness
2. Efficient cloth simulation on GPUs using subspace integration and Jacobi-PD

**SIGGRAPH 2024 papers (publicly available):**
- Neural homogenization for yarn-level fabric simulation
- Automatic digital garment initialization from sewing patterns — directly relevant to GarmentOS
- VR-GS system for 3D garment interaction

Find on: ACM Digital Library (dl.acm.org) — search "Style3D cloth simulation"
Also: ResearchGate — search "Huamin Wang Style3D" (their Chief Science Officer)

**Style3D free tools:**
- Style3D Atelier — free version available — useful for designer testing and research reference
- Benson's brother should test this free version now to inform GarmentOS feature decisions

---

## 3.5 HUAMIN WANG — CHIEF SCIENTIST AT STYLE3D — KEY PUBLICATIONS

wanghmin.github.io/publication/ — full list with free PDFs and GitHub code. Two Minute Papers YouTube channel covers this research. This was found via the YouTube channel link Benson shared.

**Must read before Stage 3 — 2D pattern to 3D garment:**

Automatic Digital Garment Initialization from Sewing Patterns (SIGGRAPH 2024)
PDF: wanghmin.github.io/publication/liu-2024-adg/Liu-2024-ADG.pdf
Dataset: kaggle.com/datasets/style3d/stylexda-multi-modal-benchmark-of-fashion
This paper IS Stage 3. Converts 2D pattern pieces to simulation-ready 3D garments automatically.

GarmageNet: Multimodal Framework for Sewing Pattern Design and Garment Modeling (SIGGRAPH Asia 2025)
PDF: wanghmin.github.io/publication/li-2025-gn/Li-2025-GN.pdf
Code: github.com/Style3D/garmagenet-impl
Dataset: huggingface.co/datasets/Style3D-AI/GarmageSet — 14,801 professionally designed garments
Most advanced implementation of the pattern-to-3D pipeline. Dataset alone is invaluable.

Rule-Free Sewing Pattern Adjustment with Precision and Efficiency (SIGGRAPH 2018)
PDF: wanghmin.github.io/publication/wang-2018-rfs/Wang-2018-RFS.pdf
Dataset: wanghmin.github.io/publication/wang-2018-rfs/Wang-2018-RFS.zip
Pattern editing algorithms — dart manipulation, adjustment, seam relocation. Read before building Stage 3 pattern tools.

Design2GarmentCode: Design Concepts to Garments via Program Synthesis (CVPR 2025)
PDF: wanghmin.github.io/publication/zhou-2025-dgc/Zhou-2025-DGC.pdf
Code: github.com/Style3D/SXDGarmentCode
Future AI layer — designer sketches or describes a garment, LMM generates the pattern program. Stage 11+.

**Must read before Stage 8 — fabric physics:**

Data-Driven Elastic Models for Cloth: Modeling and Measurement (SIGGRAPH 2011)
PDF: wanghmin.github.io/publication/wang-2011-dde/Wang-2011-DDE.pdf
Dataset: graphics.berkeley.edu/papers/Wang-DDE-2011-08/index.html
Foundational paper for translating fabric properties to simulation parameters.

Stable Discrete Bending by Analytic Eigensystem (SIGGRAPH Asia 2023)
PDF: wanghmin.github.io/publication/wang-2023-sdb/Wang-2023-SDB.pdf
Makes bending simulation stable — prevents the simulation from blowing up at fold points.

Modeling Friction and Air Effects between Cloth and Deformable Bodies (SIGGRAPH 2013)
PDF: wanghmin.github.io/publication/chen-2013-mfa/Chen-2013-MFA.pdf
How fabric contacts and sits on the body surface — the difference between realistic drape and floating fabric.

**The East African fabric database breakthrough:**

Learning-Based Bending Stiffness Parameter Estimation by a Drape Tester (SIGGRAPH Asia 2022)
PDF: wanghmin.github.io/publication/feng-2022-lbb/Feng-2022-LBB.pdf
Code: github.com/DrapeTester/ClothDrapeTester

This paper solves the East African fabric data problem without expensive KES equipment.
Method: hang a fabric sample over a rod → photograph the drape → run through the ML model → get bending stiffness value.
Equipment needed: a phone camera and a rod.
Application: Benson can drape-test kitenge, cotton drill, and African print fabrics from the Nairobi market this week and start building the first East African fabric properties database immediately.

---

## 3.6 FABRIC SCIENCE — KAWABATA EVALUATION SYSTEM (KES)

The gold standard for measuring fabric mechanical properties. Developed by Professor Kawabata, Kyoto University, 1968. Commercially available since 1978.

**Five KES property categories:**

| Property | What it measures | Why it matters |
|---|---|---|
| Tensile | Stretch under load | Garment give |
| Shear stiffness | Diagonal deformation | Drape quality |
| Bending rigidity | Resistance to folding | How fabric hangs |
| Compression | Thickness and softness | Feel against body |
| Surface friction & roughness | Slide against itself | Fold behaviour |

**KES values for common fabrics (from published research):**

Cotton shirting: low bending rigidity, moderate shear, low friction — moderate drape, good for shirts and light trousers

Wool suiting: moderate-high bending, 4-8% warp extensibility (ideal per Kawabata & Niwa), shear hysteresis <2.5 gf/cm for good tailorability — structured drape, holds shape

Polyester: low total hand value, low friction, moderate bending — poor natural drape

Cotton/polyester blend: intermediate properties, surface friction 5.89-7.038 — practical, washable, common in East African workwear

Denim: high bending rigidity, low shear — stiff, holds shape. Stone washing significantly reduces bending rigidity.

**FAST System — simpler KES alternative:**
Fabric Assurance by Simple Testing (FAST), developed CSIRO Australia 1980s. Fewer measurements, focused on tailorability. Measures: extensibility, bending rigidity, shear rigidity, formability, relaxation shrinkage, hygral expansion. Good fit for GarmentOS practical use case.

**East African fabric gap:**
KES data for kitenge, African print cotton, cotton drill, polyester lace is sparse in published literature. This is a gap GarmentOS fills over time by measuring local Nairobi market fabrics — the first East African fabric properties database. Partner with Kenyatta University or University of Nairobi textile labs for equipment access.

---

## 3.6 FREE DATA SOURCES

**KES fabric property values:**
- ResearchGate — search "KES fabric properties [fabric type]"
- ScienceDirect — Textile Research Journal archives
- Taylor & Francis textile journals
- Fibre2Fashion.com — industry articles with KES values

**Open source cloth simulation code:**
- github.com/topics/cloth-simulation — curated list
- github.com/newton-physics/newton — Style3D cloth example
- github.com/mrdoob/three.js/tree/dev/examples — Three.js cloth examples

**Blender documentation:**
- docs.blender.org/manual/en/latest/physics/cloth
- docs.blender.org/api (Python API for server-side integration)

---

## 3.7 COMPETITIVE LANDSCAPE

| Feature | Clo3D | GarmentOS target |
|---|---|---|
| 3D mannequin | Yes, static sizing | Yes, scaled from actual measurements |
| Body standard | European/Asian | East African (Dr. Kinuthia data) |
| Interactive rotation | Yes | Yes — Three.js (Stage 2) |
| Real time pattern update | Yes | Yes — Three.js (Stage 3) |
| Fabric physics | Yes, proprietary | Yes, open source (Stage 8) |
| East African fabrics | No | Yes — first in world (Stage 9) |
| Production integration | No | Yes — GARMENTTRACK bridge (Stage 10) |
| Tech pack generation | Limited | Yes (Stage 7) |
| Price | KES 15,000+/month | TBD |

By Stage 3 — designer has rotation and real time feedback.
By Stage 8 — fabric physics closes the Clo3D gap.
By Stage 9 — GarmentOS has something Clo3D will never have.

---

# PART 4: DRESS FORM MANNEQUIN
## Measurements, 3D Body Models, and Parametric Avatar Architecture

---

## 4.1 THE APPROACH — EUROPEAN BASE WITH ADJUSTABLE PARAMETERS

Start from European standard measurements as the geometric base. Expose every key proportion as a user-adjustable input. Mannequin scales in real time as measurements are entered. When East African data accumulates update the defaults. Every real Nairobi body entered is implicitly East African calibration.

---

## 4.2 ISO 8559 — THE MEASUREMENT STANDARD

ISO 8559-1:2017 is the international standard defining where and how every body measurement is taken for clothing. GarmentOS must align with this standard so measurement definitions match what Dr. Kinuthia's research uses, what Clo3D uses, and what any future data source uses.

---

## 4.3 COMPLETE MEASUREMENT SET FOR THE MANNEQUIN

### Tier 1 — Primary user inputs (cannot be derived)

**Girths:**
1. Neck girth — around base of neck
2. Chest girth — fullest part of chest
3. Waist girth — natural waist, narrowest point
4. Hip girth — fullest part of hips
5. Seat girth — fullest part of seat/buttocks
6. Upper thigh girth — at crotch level (CRITICAL — never derive from hip)
7. Knee girth — around centre of knee
8. Calf girth — fullest part of calf
9. Upper arm girth — fullest part of upper arm
10. Wrist girth — around wrist bone

**Lengths/heights:**
11. Total height (stature) — crown to floor
12. Cervical height — base of neck (7th vertebra) to floor
13. Waist height — natural waist to floor
14. Hip height — fullest hip point to floor
15. Crotch height — crotch to floor (= inseam)
16. Knee height — centre knee to floor
17. Back waist length — 7th vertebra to natural waist
18. Front waist length — shoulder to natural waist front
19. Body rise — waist to seat when sitting
20. Shoulder length — neck to shoulder point
21. Sleeve length — shoulder point to wrist
22. Arm length — shoulder point to wrist (straight arm)

**Widths:**
23. Shoulder width — shoulder point to shoulder point across back
24. Back width — between armhole seams at back
25. Chest width — between armhole seams at front

### Tier 2 — Derived automatically (calculated from Tier 1)

| Derived | Formula |
|---|---|
| Arm span | Height × 1.0 |
| Foot length | Height / 6 |
| Waist to knee | Waist height - Knee height |
| Waist to hip | Waist height - Hip height |
| Inseam | = Crotch height |
| Neck approximate | Chest × 0.37 (user can override) |
| Hem width (trousers) | (Waist × 0.125) + 13cm |
| Armscye depth | Chest / 4 (user can override) |

### Tier 3 — Shape toggles (qualitative)

| Toggle | Options |
|---|---|
| Buttocks prominence | Flat / Average / Prominent |
| Buttocks position | High / Middle / Low |
| Thigh fullness | Inner / Balanced / Outer |
| Back posture | Forward / Upright / Backward |
| Shoulder slope | Sloped / Average / Square |
| Body shape | Rectangular / Inverted triangle / Trapezoid / Oval |
| Gender | Male / Female |

---

## 4.4 EUROPEAN DEFAULT VALUES (ISO 8559, Aldrich size 40 medium men's)

| Measurement | Default (cm) |
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
| Crotch height | 81 |
| Sleeve length | 65 |

These are starting values only. User measurements override all of them instantly.

---

## 4.5 FREE OPEN SOURCE 3D BODY MODELS — KEY FINDS

### MakeHuman
- Free open source 3D parametric body modelling software
- Exported models released under CC0 — public domain, commercial use allowed
- Uses morphing technology — single base mesh transforms via linear interpolation
- Height, weight, gender, ethnicity, muscularity, age all adjustable via sliders
- Exports to OBJ and GLTF — importable into Three.js
- makehuman.org
- This is the foundation most professional 3D fashion tools are built on

### Anny (November 2025 — most sophisticated free option)
- Built on MakeHuman assets
- Apache 2.0 license — fully free including commercial use
- 13,380 vertices, 163 bones — high quality mesh
- 564 blendshapes covering age, gender, height, weight, muscle, local body features
- Calibrated against WHO population statistics
- Differentiable — shape parameters can be mathematically optimised against measurements
- Covers all ages from infant to elderly in one unified model
- arxiv.org/abs/2511.03589
- Released by NAVER LABS Europe, February 2026

### bodyapps-viz (CRITICAL — already does MakeHuman + Three.js in browser)
- Open source GitHub project that implements exactly what GarmentOS Stage 2 needs
- MakeHuman base models + Three.js rendering in the browser
- Morph targets for body customisation
- Male, female, and kids body models
- github.com/OpnTec/bodyapps-viz
- **Study this codebase before writing any Stage 2 code**

---

## 4.6 MINIMUM VIABLE MANNEQUIN — THE PICTOFIT INSIGHT

Pictofit achieves 94% body shape accuracy from only 6 input measurements. GarmentOS does not need all 25 measurements to generate a useful mannequin.

**GarmentOS minimum viable mannequin set (7 measurements):**
1. Height
2. Chest girth
3. Waist girth
4. Hip girth
5. Body rise (crotch depth)
6. Shoulder width
7. Back waist length

These 7 generate a mannequin the designer can immediately work with. All other measurements are progressive refinements available on demand.

---

## 4.7 STAGE 2 BUILD ARCHITECTURE

**Stage 2a — MakeHuman base + Three.js morph targets (build first)**
1. Export male base mesh from MakeHuman as GLTF
2. Load into Three.js as base mannequin
3. Define morph targets per measurement (chest expands when chest girth increases, etc.)
4. Measurement input → Three.js interpolates morph targets → mannequin updates real time
5. Interactive rotation via Three.js OrbitControls
6. Front / back / side camera presets

**Stage 2b — Anny optimisation (upgrade path)**
1. Use Anny's differentiable shape space
2. Measurements → optimise Anny's shape parameters (betas) mathematically
3. Output 3D mesh that accurately matches entered measurements
4. Render in Three.js
5. Requires Python backend for optimisation

Start with 2a. Upgrade to 2b when 2a is proven.

---

## 4.8 EAST AFRICAN CALIBRATION PATH

When data from Dr. Kinuthia or from GarmentOS production fit corrections accumulates:
1. Measure deviation between European defaults and real East African bodies per measurement point
2. Store as East African correction factors
3. Add a toggle: "East African defaults / European defaults"
4. Architecture does not change — only default values change

Build a simple fit correction logging feature from Stage 3 onwards — every "let out 2cm at the seat" noted in a factory fitting is a data point. Capture it automatically.

---

# PART 5: NEXT RESEARCH PHASES
## What Still Needs Researching Before Those Build Stages

---

## 4.1 UPCOMING BLOCK RESEARCH (before Stage 4 and 5)
- Collar blocks — shirt collar, stand collar, mandarin collar
- Bodice block (women's) — bust dart system
- Jacket/blazer block — structured tailoring
- Sleeve block standalone variations

## 4.2 EAST AFRICAN BODY DATA (ongoing — Dr. Kinuthia collaboration)
- Adult male Kenyan body measurement dataset
- Adult female Kenyan body measurement dataset
- East African crotch curve calibration from Benson's father's drawings
- Comparison of Aldrich block vs fitted results on Kenyan bodies

## 4.3 EAST AFRICAN FABRIC DATABASE (Stage 9 prerequisite)
- KES measurement of kitenge — multiple weights and weave types
- KES measurement of cotton drill (common workwear fabric)
- KES measurement of African print cotton
- KES measurement of polyester lace
- Partner: Kenyatta University or University of Nairobi textile testing labs

## 4.4 GRADING RESEARCH (before Stage 6)
- East African size increment standards — do not default to European S/M/L
- Grade rule derivation from Kenyan body data
- Grade point placement specific to East African body shape distribution

---

*Document status: v1.0 consolidated — April 2026*
*This document covers: human anatomy, body proportions, Vitruvian Man, East African body research, Dr. Otieno findings, Dr. Kinuthia collaboration, trouser block formulas, shirt block formulas, canvas implementation logic, video resources, 3D engine options, fabric science (KES/FAST), Style3D research, free data sources, competitive landscape*
*All formulas in this document are implementation-ready for Claude Code*
