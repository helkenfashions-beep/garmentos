import { useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// ─── Body geometry helpers ───────────────────────────────────────────────────

const TAU = 2 * Math.PI;

/**
 * Derive all body heights and radii from measurement inputs.
 * All values in mm — matching the canvas coordinate system.
 */
function deriveBodyDims(m) {
  const H = m.height;

  // Radii from girths (circumference = 2πr)
  const neckR      = m.neckGirth      / TAU;
  const chestR     = m.chest          / TAU;
  const waistR     = m.waist          / TAU;
  const hipR       = m.hip            / TAU;
  const seatR      = m.seat           / TAU;
  const thighR     = m.upperThighGirth / TAU;
  const kneeR      = m.kneeGirth      / TAU;
  const calfR      = m.calfGirth      / TAU;
  const upperArmR  = m.upperArmGirth  / TAU;
  const wristR     = m.wristGirth     / TAU;

  // Heights from floor (mm)
  const headR      = H * 0.065;                         // ~116mm
  const headCtrH   = H - headR;                         // head centre Y
  const waistH     = H * 0.615;                         // natural waist ~61.5% of height
  const crotchH    = waistH - m.bodyRise;               // floor to crotch
  const hipH       = waistH - 200;                      // hip fullest ~20cm below waist
  const seatH      = hipH - 60;                         // seat slightly below hip
  const shoulderH  = waistH + m.backWaistLength;        // base of neck
  const neckTopH   = shoulderH + H * 0.04;              // neck top
  const kneeH      = crotchH * 0.62;                    // knee ~62% of inseam
  const ankleH     = 70;                                // fixed ankle height

  // Approximate elbow at hip level, wrist below that
  const elbowH     = hipH + 20;
  const wristH_    = elbowH - (shoulderH - elbowH) * 1.15;

  // Spacing from body centreline
  const legSpacing = hipR * 0.38;
  const armSpacing = m.shoulderWidth / 2;

  return {
    H, headR, headCtrH,
    neckR, neckTopH, shoulderH,
    chestR, waistR, hipR, seatR,
    thighR, kneeR, calfR, upperArmR, wristR,
    waistH, crotchH, hipH, seatH,
    kneeH, ankleH, elbowH, wristH: wristH_,
    legSpacing, armSpacing,
  };
}

/**
 * Dispose all geometry and materials in a THREE.Object3D tree.
 */
function disposeObject(obj) {
  obj.traverse(o => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      if (Array.isArray(o.material)) o.material.forEach(m => m.dispose());
      else o.material.dispose();
    }
  });
}

/**
 * Build the parametric mannequin as a THREE.Group.
 * All coordinates in mm.
 */
function buildMannequinGroup(measurements) {
  const d   = deriveBodyDims(measurements);
  const grp = new THREE.Group();

  const mat = new THREE.MeshStandardMaterial({
    color:     0x8e9ba8,   // neutral blue-grey — reads on dark background
    roughness: 0.82,
    metalness: 0.02,
  });

  // ── Torso — LatheGeometry (profile revolved around Y axis) ──────────────────
  // Points ordered bottom to top so normals face outward
  const torsoProfile = [
    new THREE.Vector2(d.thighR * 0.65,        d.crotchH),
    new THREE.Vector2(d.seatR,                d.seatH),
    new THREE.Vector2(d.hipR,                 d.hipH),
    new THREE.Vector2(d.hipR * 0.91,          (d.hipH + d.waistH) / 2),
    new THREE.Vector2(d.waistR,               d.waistH),
    new THREE.Vector2(d.waistR * 1.05,        (d.waistH + d.shoulderH - d.backWaistLength * 0.4) / 2),
    new THREE.Vector2(d.chestR,               d.shoulderH - measurements.backWaistLength * 0.4),
    new THREE.Vector2(d.armSpacing * 0.82,    d.shoulderH),
    new THREE.Vector2(d.neckR * 1.6,          d.neckTopH - 30),
    new THREE.Vector2(d.neckR,                d.neckTopH + 40),
  ];
  grp.add(new THREE.Mesh(new THREE.LatheGeometry(torsoProfile, 36), mat));

  // ── Head ────────────────────────────────────────────────────────────────────
  const head = new THREE.Mesh(new THREE.SphereGeometry(d.headR, 28, 22), mat);
  head.position.set(0, d.headCtrH, 0);
  grp.add(head);

  // ── Helper: tapered cylinder (frustum) ─────────────────────────────────────
  function addCylinder(topR, botR, topY, botY, x, z) {
    const h   = Math.abs(topY - botY);
    const midY = (topY + botY) / 2;
    const cyl = new THREE.Mesh(new THREE.CylinderGeometry(topR, botR, h, 16), mat);
    cyl.position.set(x, midY, z);
    grp.add(cyl);
  }

  // ── Shoulder cap spheres (fill shoulder junction gap) ──────────────────────
  function addSphere(r, x, y, z) {
    const s = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 12), mat);
    s.position.set(x, y, z);
    grp.add(s);
  }

  // ── Legs ────────────────────────────────────────────────────────────────────
  const ls = d.legSpacing;
  // Upper leg (crotch → knee)
  addCylinder(d.thighR, d.kneeR,  d.crotchH, d.kneeH, -ls, 0);
  addCylinder(d.thighR, d.kneeR,  d.crotchH, d.kneeH,  ls, 0);
  // Lower leg (knee → ankle + 20mm)
  addCylinder(d.kneeR, d.calfR,   d.kneeH,   d.ankleH + 20, -ls, 0);
  addCylinder(d.kneeR, d.calfR,   d.kneeH,   d.ankleH + 20,  ls, 0);
  // Foot stub
  addCylinder(d.calfR * 0.75, d.calfR * 0.6, d.ankleH + 20, 0, -ls, 20);
  addCylinder(d.calfR * 0.75, d.calfR * 0.6, d.ankleH + 20, 0,  ls, 20);

  // ── Arms ────────────────────────────────────────────────────────────────────
  const as = d.armSpacing;
  const shoulderCapR = Math.min(d.upperArmR * 1.2, 55);
  addSphere(shoulderCapR, -as, d.shoulderH, 0);
  addSphere(shoulderCapR,  as, d.shoulderH, 0);
  // Upper arm (shoulder → elbow)
  addCylinder(d.upperArmR, d.upperArmR * 0.88, d.shoulderH, d.elbowH, -as, 0);
  addCylinder(d.upperArmR, d.upperArmR * 0.88, d.shoulderH, d.elbowH,  as, 0);
  // Forearm (elbow → wrist)
  addCylinder(d.upperArmR * 0.82, d.wristR, d.elbowH, d.wristH, -as, 0);
  addCylinder(d.upperArmR * 0.82, d.wristR, d.elbowH, d.wristH,  as, 0);

  return grp;
}

/**
 * Build THREE.LineSegments for the 2D pattern, displayed as a flat plane
 * centred at waist height in front of the mannequin.
 * Pattern Y is inverted (SVG Y-down → Three.js Y-up).
 */
function buildPatternLines(patternState, measurements) {
  const { points, segments } = patternState;
  const ptArr = Object.values(points);
  if (ptArr.length === 0) return null;

  // Bounding-box centre of the pattern (in mm, SVG coords)
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of ptArr) {
    if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
  }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;

  const d     = deriveBodyDims(measurements);
  const zPos  = -(d.chestR + 80);   // slightly in front of the mannequin

  // Convert a 2D pattern point to 3D world position
  function p3(px, py) {
    return [
      px - cx,                   // X: centred on body axis
      d.waistH + (cy - py),      // Y: flip SVG Y, centre at waist
      zPos,
    ];
  }

  const verts = [];

  for (const seg of Object.values(segments)) {
    const p1 = points[seg.p1];
    const p2 = points[seg.p2];
    if (!p1 || !p2) continue;

    if (seg.type === 'line') {
      verts.push(...p3(p1.x, p1.y), ...p3(p2.x, p2.y));
    } else if (seg.type === 'bezier') {
      const c1 = seg.c1; // { x, y }
      const c2 = seg.c2;
      let prev = p3(p1.x, p1.y);
      for (let i = 1; i <= 20; i++) {
        const t = i / 20, mt = 1 - t;
        const bx = mt*mt*mt*p1.x + 3*mt*mt*t*c1.x + 3*mt*t*t*c2.x + t*t*t*p2.x;
        const by = mt*mt*mt*p1.y + 3*mt*mt*t*c1.y + 3*mt*t*t*c2.y + t*t*t*p2.y;
        const curr = p3(bx, by);
        verts.push(...prev, ...curr);
        prev = curr;
      }
    }
  }

  if (verts.length === 0) return null;

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  const mat = new THREE.LineBasicMaterial({ color: 0x58a6ff });
  return new THREE.LineSegments(geo, mat);
}

// ─── Component ───────────────────────────────────────────────────────────────

const CAMERA_PRESETS = ['front', 'back', 'left', 'right'];

export default function MannequinViewer({ measurements, patternState }) {
  const mountRef   = useRef(null);
  const threeRef   = useRef(null);  // { renderer, scene, camera, controls, animId }
  const bodyRef    = useRef(null);  // current body THREE.Group in scene
  const patternRef = useRef(null);  // current pattern THREE.LineSegments in scene

  // ── Scene setup (once) ────────────────────────────────────────────────────
  useEffect(() => {
    const mount = mountRef.current;
    const rect  = mount.getBoundingClientRect();
    const W     = rect.width  || 400;
    const H     = rect.height || 600;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x0d1117);
    mount.appendChild(renderer.domElement);

    // Scene
    const scene = new THREE.Scene();

    // Camera
    const camera = new THREE.PerspectiveCamera(45, W / H, 1, 20000);
    const defH   = 1780 * 0.5;         // centre of default body
    camera.position.set(0, defH, 1780 * 1.6);
    camera.lookAt(0, defH, 0);

    // Lights
    scene.add(new THREE.AmbientLight(0xffffff, 0.45));
    const sun = new THREE.DirectionalLight(0xffffff, 0.75);
    sun.position.set(600, 1500, 1000);
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0x8899dd, 0.25);
    fill.position.set(-800, 400, -400);
    scene.add(fill);

    // OrbitControls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, defH, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance   = 100;
    controls.maxDistance   = 8000;
    controls.update();

    // Animation loop
    let animId;
    function animate() {
      animId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    }
    animate();

    threeRef.current = { renderer, scene, camera, controls, animId };

    // Resize observer
    const ro = new ResizeObserver(() => {
      const t = threeRef.current;
      if (!t) return;
      const W2 = mount.clientWidth;
      const H2 = mount.clientHeight;
      if (W2 === 0 || H2 === 0) return;
      t.renderer.setSize(W2, H2);
      t.camera.aspect = W2 / H2;
      t.camera.updateProjectionMatrix();
    });
    ro.observe(mount);

    return () => {
      cancelAnimationFrame(animId);
      ro.disconnect();
      controls.dispose();
      renderer.dispose();
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
      threeRef.current = null;
    };
  }, []);

  // ── Rebuild body when measurements change ─────────────────────────────────
  useEffect(() => {
    const t = threeRef.current;
    if (!t || !measurements) return;

    if (bodyRef.current) {
      disposeObject(bodyRef.current);
      t.scene.remove(bodyRef.current);
    }
    const body = buildMannequinGroup(measurements);
    t.scene.add(body);
    bodyRef.current = body;

    // Recentre orbit target at new waist height
    const d = deriveBodyDims(measurements);
    t.controls.target.set(0, d.waistH, 0);
    t.controls.update();
  }, [measurements]);

  // ── Rebuild pattern lines when patternState changes ───────────────────────
  useEffect(() => {
    const t = threeRef.current;
    if (!t) return;

    if (patternRef.current) {
      disposeObject(patternRef.current);
      t.scene.remove(patternRef.current);
      patternRef.current = null;
    }

    if (patternState && measurements) {
      const lines = buildPatternLines(patternState, measurements);
      if (lines) {
        t.scene.add(lines);
        patternRef.current = lines;
      }
    }
  }, [patternState, measurements]);

  // ── Camera presets ────────────────────────────────────────────────────────
  const setCameraPreset = useCallback((preset) => {
    const t = threeRef.current;
    if (!t) return;
    const d    = measurements ? deriveBodyDims(measurements) : { waistH: 890 };
    const dist = measurements ? measurements.height * 1.5 : 2670;
    const ty   = d.waistH;

    t.controls.target.set(0, ty, 0);
    switch (preset) {
      case 'front': t.camera.position.set(0,  ty,  dist); break;
      case 'back':  t.camera.position.set(0,  ty, -dist); break;
      case 'left':  t.camera.position.set(-dist, ty, 0);  break;
      case 'right': t.camera.position.set( dist, ty, 0);  break;
    }
    t.camera.lookAt(0, ty, 0);
    t.controls.update();
  }, [measurements]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {/* Three.js canvas mount */}
      <div ref={mountRef} style={{ width: '100%', height: '100%' }} />

      {/* Camera preset buttons */}
      <div style={{
        position: 'absolute',
        bottom: 10,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        gap: 4,
        pointerEvents: 'auto',
      }}>
        {CAMERA_PRESETS.map(p => (
          <button
            key={p}
            onClick={() => setCameraPreset(p)}
            style={{
              padding: '3px 9px',
              fontSize: 10,
              fontFamily: 'var(--font-mono)',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              backgroundColor: 'rgba(22,27,34,0.85)',
              color: 'var(--color-text-dim)',
              border: '1px solid var(--color-border)',
              borderRadius: 4,
              cursor: 'pointer',
              backdropFilter: 'blur(4px)',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.color = 'var(--color-text)';
              e.currentTarget.style.borderColor = 'var(--color-accent)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.color = 'var(--color-text-dim)';
              e.currentTarget.style.borderColor = 'var(--color-border)';
            }}
          >
            {p}
          </button>
        ))}
      </div>
    </div>
  );
}
