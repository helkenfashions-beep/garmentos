# GarmentOS — Fabric Science & 3D Simulation Research
## Free and Open Resources for Cloth Physics and Fabric Properties
*Foundation for the GarmentOS 3D mannequin and fabric drape engine*

---

## 1. THE PROBLEM WE ARE SOLVING

The designer (primary user) needs to:
- See the garment on a 3D body
- Rotate and inspect from any angle
- Make pattern tweaks and see the result update in real time
- Understand how different fabrics will behave on that body

This is what Clo3D delivers. GarmentOS needs to deliver the same workflow built on East African body data, at zero or near-zero licensing cost.

---

## 2. THE THREE-LAYER 3D ARCHITECTURE

### Layer 1 — Interactive Parametric Mannequin (Stage 2 build)
A 3D body avatar that scales from measurement inputs. Rotate, zoom, view from any angle. Built with Three.js in the browser. No physics. Pure geometry. Fast to build, fast to iterate.

### Layer 2 — Geometric Pattern Draping (Stage 3 build)
Pattern pieces assembled on the mannequin geometrically — mathematically wrapped around the body surface without physics simulation. The designer sees the garment assembled. Updates when pattern edits are made. Still Three.js. No physics engine needed yet.

### Layer 3 — Fabric Physics Simulation (Stage 8+ build)
Actual fabric behaviour — drape, gravity, stiffness, shear. This is where the physics engine enters. Not the first version. Built on top of the geometry that is already correct.

---

## 3. 3D ENGINE OPTIONS — FREE

### Three.js (Primary choice for Layers 1 and 2)
- Open source JavaScript 3D library
- Runs natively in the browser — no installation for users
- Already in the GarmentOS tech stack plan
- Handles interactive rotation, zoom, real time updates
- Large community, extensive documentation
- GitHub: github.com/mrdoob/three.js
- License: MIT — completely free, commercial use allowed

Three.js cloth simulation extension exists but is basic. Suitable for Layer 2 geometric draping. Not suitable for realistic fabric physics in Layer 3.

### Blender Cloth Solver (For Layer 3 server-side simulation)
- Blender's built in cloth simulation engine is production grade
- Used in film, animation, and game studios
- Completely open source (GNU GPL)
- Cannot run in browser directly — runs server side
- Workflow: user makes pattern edit → GarmentOS sends to server → Blender runs cloth sim → result returned as 3D render
- Python API available — Claude Code can work with it directly
- Slower than real time but functional and free
- blender.org

### Cannon.js (Browser-based physics alternative)
- Open source physics engine for JavaScript/browser
- Lighter than Blender, runs in browser
- Less realistic than Blender for fabric but faster
- Suitable for basic drape approximation in browser
- GitHub: github.com/schteppe/cannon.js
- License: MIT

### Newton Physics (GPU-accelerated, includes Style3D cloth example)
- Open source GPU-accelerated physics engine built on NVIDIA Warp
- Specifically includes a cloth_style3d example — meaning it implements Style3D's cloth simulation approach
- Python-based, runs server side
- GitHub: github.com/newton-physics/newton
- License: Apache 2.0 — free including commercial use
- This is significant: Style3D's approach is implemented in open source here

### NeuralClothSim (NeurIPS 2024 — cutting edge research)
- Neural deformation fields + thin shell theory for cloth simulation
- Published at NeurIPS 2024 — most recent academic advance in the field
- Official implementation available on GitHub
- github.com/topics/cloth-simulation → NeuralClothSim
- Research-grade but shows direction of where free cloth simulation is heading

---

## 4. STYLE3D — THE CHINESE REFERENCE

Style3D is a Chinese company that built the most credible Clo3D competitor. Their physics engine is considered equal to or better than Clo3D in specific areas.

### What they publish freely:
Style3D Research publishes academic papers at SIGGRAPH (the top computer graphics conference) annually. Their 2023 and 2024 papers are publicly available and describe their simulation methods in technical detail.

**SIGGRAPH Asia 2023 — Two papers:**
1. Stability improvement for dihedral-angle-based bending model using analytic eigensystem and adaptive geometric stiffness — describes how to make bending simulation more stable and accurate
2. Efficient cloth simulation on GPUs using subspace integration and Jacobi-PD — describes how to make simulation fast enough for real time use

**SIGGRAPH 2024 — Six papers including:**
- Neural homogenization model for yarn-level fabric simulation — AI approach to simulating how individual yarns in fabric behave
- Automatic digital garment initialization from sewing patterns — converting 2D patterns to 3D garments automatically (directly relevant to GarmentOS)
- VR-GS system for human-centric 3D garment interaction

### Style3D free tools:
- Style3D Atelier — 3D garment modelling software, has a FREE version
- Style3D Simulator — Unreal Engine plugin for real time simulation
- These are not open source but the free tier of Atelier is usable for research and prototyping

Style3D papers are searchable on ACM Digital Library and ResearchGate. Reading their SIGGRAPH papers gives GarmentOS the technical blueprint of how a professional cloth engine works without the years of trial and error.

---

## 5. FABRIC SCIENCE — THE KAWABATA EVALUATION SYSTEM (KES)

### What KES is
The Kawabata Evaluation System was developed by Professor Kawabata at Kyoto University, Japan, starting 1968, commercially available since 1978. It is the gold standard for measuring fabric mechanical properties that determine how fabric feels and behaves.

KES measures five categories of fabric properties:

| Property | What it measures | Why it matters for simulation |
|---|---|---|
| Tensile | How fabric stretches under load | Determines how much give a garment has |
| Shear stiffness | How fabric deforms diagonally | Determines drape quality |
| Bending rigidity | Resistance to folding | Determines how fabric hangs and folds |
| Compression | Thickness and softness under pressure | Determines how fabric feels against body |
| Surface friction & roughness | How fabric slides against itself and skin | Determines fold behaviour and comfort |

### KES values for common fabrics (from published research)

These are cited values from academic papers — usable as starting parameters for GarmentOS fabric simulation:

**Cotton (woven, shirting weight)**
- Bending rigidity: low — soft, folds easily
- Shear stiffness: moderate
- Surface friction: low (smooth feel)
- Behaviour: drapes moderately, good for shirts and light trousers

**Wool suiting**
- Bending rigidity: moderate to high
- Tensile extensibility: 4-8% in warp direction (ideal suiting range per Kawabata & Niwa)
- Shear hysteresis at 5°: must be less than 2.5 gf/cm for good tailorability
- Behaviour: structured drape, holds shape, ideal for formal trousers

**Polyester**
- Total hand value: low compared to natural fibres
- Surface friction: low
- Bending rigidity: moderate
- Behaviour: poor natural drape, requires specific construction to hang well

**Cotton/polyester blend**
- Properties intermediate between pure cotton and pure polyester
- Surface friction: low (5.89-7.038 range in published data)
- Behaviour: practical, washable, common in East African workwear

**Denim**
- High bending rigidity — stiff, holds shape
- Low shear — does not drape
- Stone washing significantly reduces bending rigidity and improves tactile comfort

### FAST System — simpler alternative to KES
Fabric Assurance by Simple Testing (FAST) was developed by CSIRO Australia in the 1980s as a simpler, faster alternative to KES. Fewer measurements, less equipment. Focused specifically on tailorability prediction. Good for GarmentOS's practical use case — predicting how a fabric will behave in trouser and shirt construction.

FAST measures: extensibility, bending rigidity, shear rigidity, formability, relaxation shrinkage, hygral expansion. All directly relevant to pattern making.

### East African fabrics — the gap
KES data exists for European and Asian fabrics extensively. Data for fabrics commonly used in East African manufacturing — kitenge, African print cotton, cotton drill, polyester lace — is sparse in published literature. This is another data gap GarmentOS can fill over time by measuring local fabrics and building the first East African fabric properties database.

---

## 6. FREE DATA SOURCES

### Academic papers with KES values
- ResearchGate — search "KES fabric properties [fabric type]" — many papers cite specific values
- ScienceDirect — Textile Research Journal archives
- Taylor & Francis textile journals
- Fibre2Fashion.com — industry articles with KES explanations and values

### Open source cloth simulation code repositories
- github.com/topics/cloth-simulation — curated list of open source implementations
- github.com/newton-physics/newton — includes Style3D cloth example
- Three.js examples — github.com/mrdoob/three.js/tree/dev/examples — includes cloth simulation examples

### Style3D papers
- ACM Digital Library: dl.acm.org — search "Style3D cloth simulation"
- ResearchGate: search "Huamin Wang Style3D" — their Chief Science Officer's papers

### Blender cloth simulation documentation
- docs.blender.org/manual/en/latest/physics/cloth — full technical documentation
- Python API: docs.blender.org/api — for server-side integration

---

## 7. BUILD SEQUENCE FOR 3D IN GARMENTOS

### Stage 2 — Parametric mannequin (Three.js)
Input: measurement values from user
Output: interactive 3D body avatar that scales correctly
Technology: Three.js, browser-based
Complexity: moderate — Three.js has good documentation and examples
East African calibration: future anthropometric data feeds the mannequin proportions

### Stage 3 — Geometric pattern draping (Three.js)
Input: completed 2D pattern pieces
Output: pieces wrapped geometrically on mannequin, real time update on edits
Technology: Three.js surface mapping
Complexity: moderate to hard — requires mapping 2D coordinates to 3D surface
No physics needed at this stage — pure geometry

### Stage 8 — Basic fabric physics (Blender server-side or Cannon.js browser-side)
Input: pattern pieces + fabric type selection
Output: simulated drape showing how that fabric behaves on that body
Technology: Blender cloth solver (server) or Cannon.js (browser)
Fabric properties: from KES database built into GarmentOS
Complexity: hard — but all components are free and documented

### Stage 9 — East African fabric database
Input: physical fabric samples from Nairobi market
Output: GarmentOS fabric library with locally measured properties
Method: partner with a textile testing lab or university with KES equipment
Local university textile departments likely have access to fabric testing equipment

---

## 8. THE COMPETITIVE PICTURE

| Feature | Clo3D | GarmentOS target |
|---|---|---|
| 3D mannequin | Yes, static sizing | Yes, scaled from actual measurements |
| Body standard | European/Asian | East African (anthropometric data) |
| Interactive rotation | Yes | Yes (Three.js) |
| Real time pattern update | Yes | Yes (Stage 3) |
| Fabric physics | Yes, proprietary | Yes, open source (Stage 8) |
| East African fabrics | No | Yes (Stage 9) |
| Production integration | No | Yes (GARMENTTRACK bridge) |
| Tech pack generation | Limited | Yes (Stage 6) |
| Price | KES 15,000+/month | TBD |

The gap closes more with every stage. By Stage 3 the designer has his rotation and real time feedback. By Stage 8 he has fabric physics. By Stage 9 GarmentOS has something Clo3D will never have.

---

## 10. CLO3D SPLIT VIEW ARCHITECTURE — WHAT GARMENTOS MUST REPLICATE

This section documents exactly how Clo3D implements the split view that Benson's brother uses daily, so GarmentOS can replicate and improve on it.

---

### How Clo3D's split view actually works

Clo3D includes a template window, avatar window, object window, and attribute window. 3D avatar fitting and 2D template drawing can be designed and modified at the same time, and the data are synchronised.

The 2D pattern window is the source of truth. The real-time synchronisation between the 3D and 2D windows means that as you manipulate the garment in 3D, you see the corresponding pattern piece in the 2D window update instantly. This two-way communication bridges the gap between technical drafting and intuitive sculpting.

Critically, the Edit Styling tool allows clicking and dragging points and lines directly on the simulated 3D garment — want to raise a hemline, just pull it up on the 3D avatar. The 2D pattern updates instantly.

The synchronisation in Clo3D is triggered by Ctrl+D. All adjustments made in the 2D window automatically synchronise with the 3D window. Once sync is activated, any adjustments — not only design adjustments, but also sewing lines, print textures, and particle distances — get reflected in the 3D window.

### The known pain point in Clo3D's sync

With complex patterns, users report having to wait after every single movement in the 2D window — "waiting for sync is now 90% of my working time" for complex garments. Automatic synchronisation on complex patterns is described as making the software "a torture."

This is a direct product opportunity for GarmentOS — a faster, lighter synchronisation approach that does not freeze on complex patterns. Because GarmentOS starts with basic blocks (not complex multi-piece garments), the sync load is manageable. And because the Three.js geometric draping approach (without physics simulation running continuously) is faster than Clo3D's particle-based physics, GarmentOS can deliver a more responsive experience on simpler garments.

### Clo3D fabric properties used in simulation

Physical properties of fabrics in the CLO3D system include: Stretch-Weft, Stretch-Warp, Shear, Bending-Weft, Bending-Warp, Buckling-Ratio, Buckling-Stiffness, Internal-Damping, Density, Friction-Coefficient, and Pressure.

These are the parameters GarmentOS needs to store per fabric type in its fabric database — mapped from KES values or from the Drape Tester ML estimation approach.

### Two-way sync — the feature that matters most

What Benson's brother loves is not just 3D — it is the two-way live link. Change in 2D → instant 3D update. Change in 3D → instant 2D update. This is a fundamentally different workflow from any tool that requires an export or a manual refresh step.

GarmentOS must implement this from Stage 2. The sync must be:
- Triggered automatically on every canvas edit — no button press
- Fast enough to feel instant — target under 200ms for basic block geometry
- Two-way — dragging a point on the 3D mannequin updates the 2D pattern coordinates
- Non-blocking — the 2D canvas must remain interactive while the 3D updates

### GarmentOS split view implementation plan

Left panel (60% width): 2D pattern canvas — all drafting, points, lines, bezier curves
Right panel (40% width): Three.js 3D mannequin — live geometric draping of current pattern state
Divider: draggable, user can resize panels
Sync layer: every canvas edit event fires a recalculation of how current pattern pieces map to 3D mannequin surface
Camera: OrbitControls on right panel, independent of left panel
Panel toggle: full-screen 2D mode for detailed drafting, full-screen 3D mode for design review

The key architectural decision: the 3D panel does not run physics continuously. It updates geometrically on each edit. Physics simulation is a separate on-demand action (click to simulate drape). This is what keeps the sync fast on basic blocks.

---

*This section added after Benson's brother confirmed the split view is the core feature driving his Clo3D adoption*

This is the most valuable technical resource found for GarmentOS. Huamin Wang is the Chief Scientist at Style3D and the leading researcher globally on cloth simulation. His entire publication list is at wanghmin.github.io with free PDFs and GitHub code for most papers. Two Minute Papers on YouTube covers his work extensively.

I had previously referenced Style3D's SIGGRAPH papers generally. This section now provides specific papers, PDFs, and code that are directly usable for GarmentOS.

---

### TIER 1 — Directly relevant, read before building corresponding stages

**1. Automatic Digital Garment Initialization from Sewing Patterns (SIGGRAPH 2024)**
- What it does: Converts 2D sewing patterns into 3D garments automatically, ready for physics simulation
- Why it matters: This is exactly Stage 3 of GarmentOS — the bridge between the 2D pattern canvas and the 3D mannequin
- PDF: wanghmin.github.io/publication/liu-2024-adg/Liu-2024-ADG.pdf
- Dataset: kaggle.com/datasets/style3d/stylexda-multi-modal-benchmark-of-fashion
- Read this before building Stage 3

**2. GarmageNet: A Multimodal Generative Framework for Sewing Pattern Design and Generic Garment Modeling (SIGGRAPH Asia 2025)**
- What it does: Automates creation of 2D sewing patterns AND converts them to simulation-ready 3D garments. Uses a novel "Garmage" representation that bridges the gap between 2D structural patterns and 3D garment geometries
- Why it matters: The most advanced version of what GarmentOS is building — pattern to 3D garment pipeline
- PDF: wanghmin.github.io/publication/li-2025-gn/Li-2025-GN.pdf
- Code: github.com/Style3D/garmagenet-impl
- Dataset: huggingface.co/datasets/Style3D-AI/GarmageSet (14,801 professionally designed garments)
- This dataset alone is extraordinarily valuable for GarmentOS training data

**3. Learning-Based Bending Stiffness Parameter Estimation by a Drape Tester (SIGGRAPH Asia 2022)**
- What it does: Estimates fabric bending stiffness from drape observations using machine learning — a drape tester approach that does not require expensive KES equipment
- Why it matters: This is the solution to measuring East African fabric properties without a KES machine. A simple drape test + this algorithm = fabric property database
- PDF: wanghmin.github.io/publication/feng-2022-lbb/Feng-2022-LBB.pdf
- Code: github.com/DrapeTester/ClothDrapeTester
- This is how GarmentOS builds its East African fabric database affordably — drape test + ML estimation instead of KES machine

**4. Rule-Free Sewing Pattern Adjustment with Precision and Efficiency (SIGGRAPH 2018)**
- What it does: Algorithms for adjusting sewing patterns precisely and efficiently — not rule-based, adapts to the actual geometry
- Why it matters: The pattern editing tools in GarmentOS — dart manipulation, slash and spread, seam adjustment — are exactly this problem
- PDF: wanghmin.github.io/publication/wang-2018-rfs/Wang-2018-RFS.pdf
- Dataset: wanghmin.github.io/publication/wang-2018-rfs/Wang-2018-RFS.zip
- Read this before building Stage 3 pattern tools

**5. Data-Driven Elastic Models for Cloth: Modeling and Measurement (SIGGRAPH 2011)**
- What it does: Proposes a piecewise linear elastic model that approximates nonlinear, anisotropic stretching and bending of various materials. Develops new measurement techniques for studying elastic deformations in real cloth samples
- Why it matters: The foundational paper for how fabric properties translate to simulation parameters. The measurement techniques are simpler than KES
- PDF: wanghmin.github.io/publication/wang-2011-dde/Wang-2011-DDE.pdf
- Dataset: graphics.berkeley.edu/papers/Wang-DDE-2011-08/index.html
- Read this before building Stage 8 fabric physics

**6. Design2GarmentCode: Turning Design Concepts to Tangible Garments Through Program Synthesis (CVPR 2025)**
- What it does: Uses Large Multimodal Models to generate parametric pattern-making programs from multi-modal design concepts (sketches, text, images)
- Why it matters: Future AI layer for GarmentOS — designer sketches a silhouette, GarmentOS generates the pattern code
- PDF: wanghmin.github.io/publication/zhou-2025-dgc/Zhou-2025-DGC.pdf
- Code: github.com/Style3D/SXDGarmentCode
- This is Stage 11+ — long game, but the code is free now

---

### TIER 2 — Relevant for specific later stages

**7. High-performance CPU Cloth Simulation Using Domain-decomposed Projective Dynamics (SIGGRAPH 2025)**
- What it does: CPU-based (not GPU) high-performance cloth simulation
- Why it matters: GarmentOS runs server-side cloth simulation. Many servers don't have high-end GPUs. This approach works on CPU — directly applicable to the Blender/Railway hosting setup
- PDF: wanghmin.github.io/publication/lu-2025-hpc/Lu-2025-HPC.pdf

**8. Progressive Outfit Assembly and Instantaneous Pose Transfer (SIGGRAPH Asia 2025)**
- What it does: Assembles multiple garment pieces onto a body progressively
- Why it matters: How GarmentOS layers a trouser + shirt on the mannequin simultaneously
- Code: github.com/Style3D/OutfitAssembly

**9. Stable Discrete Bending by Analytic Eigensystem and Adaptive Orthotropic Geometric Stiffness (SIGGRAPH Asia 2023)**
- What it does: Makes bending simulation stable and accurate — the key challenge in cloth simulation
- Why it matters: Core algorithm for Stage 8 fabric physics — makes the bending simulation not blow up
- PDF: wanghmin.github.io/publication/wang-2023-sdb/Wang-2023-SDB.pdf

**10. Modeling Friction and Air Effects between Cloth and Deformable Bodies (SIGGRAPH 2013)**
- What it does: Models how cloth interacts with the body surface — friction, air pockets, contact
- Why it matters: How fabric sits on the mannequin body — the difference between a realistic drape and fabric floating
- PDF: wanghmin.github.io/publication/chen-2013-mfa/Chen-2013-MFA.pdf

**11. Subspace-Preconditioned GPU Projective Dynamics with Contact for Cloth Simulation (SIGGRAPH Asia 2023)**
- What it does: Efficient GPU cloth simulation combining subspace integration and iterative relaxation
- Why it matters: The core algorithm behind Style3D's speed — if GarmentOS ever runs GPU simulation
- PDF: wanghmin.github.io/publication/li-2023-spg/Li-2023-SPG.pdf

---

### THE DRAPE TESTER — EAST AFRICAN FABRIC DATA BREAKTHROUGH

Paper 3 above (Learning-Based Bending Stiffness Estimation) is the most practically significant for GarmentOS's immediate situation.

The problem: KES equipment costs tens of thousands of dollars. No budget for it. No local lab confirmed to have it.

The solution from this paper: Build a simple mechanical drape tester (a fabric sample hanging over a rod under gravity), photograph the drape shape, run the photograph through the ML model from github.com/DrapeTester/ClothDrapeTester, and get the bending stiffness value.

The setup needed: A phone camera, a rod, some fabric samples from Nairobi market. That is it.

This means GarmentOS can build its East African fabric properties database with a phone and a rod rather than a KES machine. Kitenge drape test → ML estimation → fabric property value → stored in GarmentOS fabric library.

This changes the East African fabric database from a years-away research project into something Benson can start this week.

---

*The complete publication list is at wanghmin.github.io/publication/*
*All PDFs are freely available at the links above*
*GitHub code repositories are linked for each paper that has them*
