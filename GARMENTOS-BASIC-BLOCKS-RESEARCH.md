# GarmentOS — Basic Block Research
## Trouser Block & Shirt Block Foundation
*Research compiled for GarmentOS canvas integration*

---

## 1. WHAT IS A BASIC BLOCK

A basic block (also called a sloper) is a foundational pattern with minimum ease, drafted directly from body measurements. It is not a finished garment pattern — it is the geometric base from which all garment variations are derived. Every style begins by tracing the block and manipulating it.

Key principle: **the block is the source of truth**. Once fit-tested, it can generate hundreds of garment styles without re-measuring the body.

A block contains:
- Bust/waist/hip lines
- Centre front and centre back lines
- Grain lines
- Fold lines
- Wearing ease (minimum movement allowance)
- No seam allowances (these are added at the garment stage)

Source: PatternLab London — uses 27 key body measurements to draft all blocks.

---

## 2. TROUSER BLOCK

### 2.1 Required Body Measurements

| Measurement | Description |
|---|---|
| Waist circumference (WC) | Natural waist |
| Hip circumference | Fullest part of hip |
| Waist-to-hip distance | Vertical drop from waist to hip |
| Body rise | Waist to seat when sitting (crotch depth) |
| Waist-to-knee | Vertical from waist to centre of knee |
| Waist-to-ankle | Full inseam reference |
| Upper thigh circumference | Thigh at crotch level — **critical for fit** |
| Knee circumference | For leg shaping |

**Important:** Most standard drafting methods calculate crotch extension as a proportion of hip measurement. This works for standard figures only. For accurate fit, upper thigh measurement should be used directly, not derived from hip. This is the most common source of trouser fit failure.

### 2.2 Key Construction Lines (vertical axis)
Drawn from top of paper downward on the crease line:

1. **Waist Line** — starting point
2. **Hip Line 1 (HC1)** — first hip reference
3. **Hip Line 2 (HC2)** — second hip reference
4. **Body Rise Line (BR)** — seat/crotch level
5. **Knee Line (KH)** — mid-leg
6. **Ankle Line** — trouser length

### 2.3 Trouser Front Panel Construction (step logic)

1. Draw vertical crease line (centre of leg)
2. Place waist, hip, rise, knee, ankle as horizontal lines off crease
3. At rise line: `5 from rise = 1/6 seat`, `6 from rise = 1/6 seat` — these establish crotch fork
4. Front waist width = `1/4 WC + 2cm` placed on waist line
5. Front hip width = `1/4 hip + ease` placed on hip line
6. Crotch extension = derived from upper thigh or `1/12 seat` outward from crease
7. Front fly curve: 45-degree angle from fork point through crotch, curving up to waist
8. Front dart: `10cm long, 2cm wide` at waist — positioned `1/16 WC` from centre
9. Knee width: `knee circumference + ease / 2`, split either side of crease
10. Hem width formula (metric): `0.125 × waist(cm) + 13cm`

### 2.4 Trouser Back Panel Construction (step logic)

1. Built on top of front panel with offset adjustments
2. Back waist width = `1/4 WC + 5cm`
3. Back seat = `1/4 seat + 5cm`
4. Back crotch extension is wider than front — provides room for seat curve
5. Back seat curve: shaped from seat angle point curving into rise, no more than 1.5cm from fly line
6. Back darts: two darts at waist
   - Dart 1: `12cm long, 2cm wide` at 1/3 distance across back waist
   - Dart 2: `10cm long` at 2/3 distance across back waist
7. Side seam connects waist through hip down to hem, shaped through all horizontal reference points

### 2.5 Ease Allowances by Garment Type

| Garment Type | Upper Thigh Ease |
|---|---|
| Trousers (formal) | 4 inches (10cm) or more |
| Slacks | ~2.5 inches (6.5cm) |
| Jeans | 1-2 inches (2.5-5cm) |

Ease is a **variable in GarmentOS** — user selects garment type and ease adjusts automatically.

### 2.6 Seam Allowances
Not included in block. Added at pattern stage. Standard: 1cm. Hem allowances wider. GarmentOS should store seam allowance as a separate user-defined layer.

### 2.7 Key Reference Systems
- **Winifred Aldrich** — Metric Pattern Cutting (most referenced academic system globally)
- **Müller & Sohn** — German technical system, precise for tailoring
- **Bunka** — Japanese system, excellent for East Asian body proportions

### 2.8 Men vs Women Trouser Block
Men's trouser block differs primarily in:
- No pronounced hip curve
- Wider seat extension at back
- Fly opening at centre front (not centre back)
- Less waist-to-hip differential
- Crotch shaping is less curved at front

---

## 3. SHIRT BLOCK (Men's)

### 3.1 Required Body Measurements

| Measurement | Description |
|---|---|
| Chest circumference | Fullest part of chest |
| Neck circumference | Base of neck |
| Shoulder width | Back, bone to bone |
| Back length (shoulder to waist) | Centre back, base of neck to waist |
| Shirt length | Shoulder to desired hem |
| Sleeve length | Shoulder point to wrist |
| Armscye depth | Shoulder to underarm |

### 3.2 Shirt Block Construction Lines (step logic)

**Back Panel:**
1. Point A — top left (centre back neck)
2. AB = armscye depth downward (vertical)
3. AE = back shoulder-to-waist length downward
4. AG = full shirt length downward
5. BC = `1/2 chest + 8cm` horizontal (armscye line)
6. CD upward same distance as AB
7. Connect AD as guideline (not in finished pattern)
8. EF = waist line (same width as BC)
9. GH = hem line (same width as BC)
10. Point I on armscye = `1/2 back measurement + 2.5cm` from B
11. IJ perpendicular up to AD — back shoulder reference
12. Point K = `1/3 chest + 1.5cm` from B along armscye
13. KL = 3.5cm upward — sleeve/armhole junction reference
14. Back neck curve: from A, `3/4 inch` depth standard, smooth curve to shoulder

**Front Panel:**
1. Mirror construction from back using same horizontal reference lines
2. Front neck depth = deeper than back (typically 8-9cm from shoulder)
3. Front armhole joins back armhole at shoulder seam
4. Button placket: `1cm` for placket + `2cm` fold = `3cm` total from centre front
5. Armscye construction: connect points U, Q, M, L, Y with smooth curve — curve stays within 1.25cm of straight line at sides, 1.75cm at midpoint, 3cm at crown

### 3.3 Sleeve Block Construction (derived from shirt block)

1. Measure armscye curve on completed shirt block (actual curve length, not straight line)
2. Sleeve crown height = `1/3 armscye measurement` upward from underarm point
3. Construction lines at crown, midpoint, and underarm establish sleeve shape
4. Pivot method: ruler pivots on crown point, intersecting construction lines at recorded distances
5. Sleeve length = vertical line from crown to desired length
6. Wrist width derived from wrist measurement + ease

### 3.4 Key Shirt Block Variables

| Variable | Standard Value | GarmentOS Behaviour |
|---|---|---|
| Chest ease | 8-10cm on block | User adjustable by fit type |
| Back width ease | 2.5cm | Fixed or adjustable |
| Armscye depth ease | 1cm | Fixed |
| Neck ease | Standard curves | Calculated from neck circumference |
| Shirt length | User measurement | Input field |

### 3.5 Fit Types from One Block

All derived by ease adjustment on the same geometric block:
- **Slim fit** — reduce chest ease to 4-6cm
- **Regular fit** — standard 8-10cm chest ease
- **Relaxed fit** — 12cm+ chest ease
- **Oversized** — 16cm+ chest ease

GarmentOS opportunity: user selects fit type, ease recalculates automatically, block redraws.

---

## 4. MATHEMATICAL RELATIONSHIPS SUMMARY

### Trouser key formulas
```
Front waist width = (WC / 4) + 2cm
Back waist width = (WC / 4) + 5cm
Front hip width = (Hip / 4) + ease
Back hip width = (Hip / 4) + 5cm
Crotch fork = seat / 6 (each side of crease)
Hem width = (0.125 × waist) + 13cm
Front dart = 10cm long, 2cm wide
Back dart 1 = 12cm long, 2cm wide
Back dart 2 = 10cm long, 2cm wide
```

### Shirt key formulas
```
Armscye line width = (chest / 2) + 8cm
Back width point = (back measurement / 2) + 2.5cm
Side seam point = (chest / 3) + 1.5cm from back
Armscye depth = measured or (chest / 4)
Sleeve crown = armscye curve / 3
```

---

## 5. DRAFTING SYSTEMS COMPARISON

| System | Origin | Strength | Relevance for GarmentOS |
|---|---|---|---|
| Winifred Aldrich | UK | Most widely taught, metric, clear formulas | Primary reference — most pattern makers in Kenya trained on this |
| Müller & Sohn | Germany | Industrial precision, tailoring focus | Good for structured garments |
| Bunka | Japan | Body-hugging fit, detailed ease tables | Reference for fitted styles |
| Helen Joseph Armstrong | USA | Fashion design education standard | Good for design variation techniques |

**Recommendation:** Build GarmentOS block geometry on Winifred Aldrich formulas as primary. Store system as a selectable parameter for future flexibility.

---

## 6. CANVAS INTEGRATION IMPLICATIONS

### What each measurement maps to in code
Every measurement input by the user must map to one or more geometric coordinates on the canvas. The block is essentially a coordinate system where:

- Body measurements → mathematical formulas → XY points on canvas
- Points connect via straight lines or bezier curves
- Curves (armscye, crotch, neck) require curve fitting between defined points
- The French curve in physical pattern making = bezier curve in canvas

### Construction sequence in GarmentOS
1. User inputs body measurements
2. System calculates all derived points using formula set
3. Canvas renders construction lines first (horizontal and vertical guides)
4. Points plotted at calculated positions
5. Lines and curves connect points
6. Block outline highlighted as final shape
7. User can drag points to adjust fit manually

### Curve handling
The three critical curves requiring bezier handling:
- **Crotch curve** — trouser fork, most complex curve in pattern making
- **Armscye** — shirt armhole, must match sleeve crown curve length exactly
- **Neck curve** — both front and back, different depths

---

## 7. VIDEO RESOURCES

### University of Fashion — Primary Video Reference
universityoffashion.com — the most structured professional video curriculum found for menswear blocks specifically. Paywalled but worth it. Their recommended watch sequence for GarmentOS research:

1. **How to Measure the Male Body** — 93 measurement points with downloadable charts. This is the measurement input spec for GarmentOS.
2. **Drafting a Men's Upper Body Block** — foundation torso block, prerequisite to shirt block
3. **Drafting a Men's Set-in Sleeve Sloper** — sleeve derived from upper body block
4. **Drafting a Men's Shirt Block** — uses upper body block + sleeve sloper as inputs
5. **Drafting a Men's Trouser Block** — standalone, measurement-based
6. **Drafting a Men's Pleated Trouser** — derived from trouser block, shows manipulation workflow

This sequence maps directly to GarmentOS build stages. Each video is a stage spec.

### Dresspatternmaking.com / YouTube Channel
youtube.com/channel/UCiWmFg4YtA0t30V5da3YUeA — Maria's channel. Three-part pants block series:

- **Part 1** — Introduction & Measurements. Key insight: upper thigh measurement must be used directly, not derived from hip. Covers ease differences between trousers, slacks, and jeans.
- **Part 2** — Front and back block drafting
- **Part 3** — Bottoms & Thighs. Covers exceptions for non-standard figures — critical for East African body diversity

Free. Highly detailed transcripts available on the website. Most technically rigorous free resource found.

### Other YouTube Channels Worth Watching
Search these terms on YouTube for additional perspectives:

- "men's trouser block drafting" — multiple African tailoring channels demonstrate practical construction methods relevant to Nairobi market
- "shirt block pattern drafting men" — BurdaStyle and Gedwood tutorials referenced by Open Source Stitches blog
- "Winifred Aldrich trouser block" — academic demonstrations of the primary reference system

### Key Observation from Video Research
The crotch curve and back seat angle are the two constructions that text alone cannot fully teach — they require watching a hand move through the curve in real time. The University of Fashion and Dresspatternmaking videos are the best sources for this specifically. Prioritise these two sequences before writing the bezier curve logic for the crotch in GarmentOS.

---

## 8. KEY BOOKS FOR DEEPER RESEARCH

- *Metric Pattern Cutting* — Winifred Aldrich (editions for men's, women's, children's)
- *Patternmaking for Fashion Design* — Helen Joseph Armstrong
- *Pattern Cutting and Making Up* — Martin Shoben & Janet Ward
- *Fundamentals of Pattern Making* — Injoo Kim & Mykyung Uh

---

## 9. NEXT RESEARCH PHASE

Once trouser and shirt blocks are integrated, the next block set to research:
1. Bodice block (women's) — bust dart system
2. Sleeve block (standalone)
3. Collar blocks — shirt collar, stand collar, mandarin
4. Jacket/blazer block — structured tailoring

---

*Document status: v1.0 — trouser and shirt blocks*
*Next: Begin Stage 1 canvas build using these formulas as the geometric engine*
