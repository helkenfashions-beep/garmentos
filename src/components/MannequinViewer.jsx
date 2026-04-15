import { useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// ─── Body geometry ────────────────────────────────────────────────────────────
//
// All dimensions in mm.  Every body section uses LatheGeometry (surface of
// revolution) — no cylinders, no flat caps, no ball joints.
// Limb pieces are offset to x = ±spacing so they blend into the torso at
// junction points (matching radii create seamless visual transitions).

const TAU = 2 * Math.PI;

function V(r, y) { return new THREE.Vector2(r, y); }

function deriveBodyDims(m) {
  const H = m.height;

  // Radii from girth measurements (girth = 2πr)
  const neckR     = m.neckGirth      / TAU;
  const chestR    = m.chest          / TAU;
  const waistR    = m.waist          / TAU;
  const hipR      = m.hip            / TAU;
  const seatR     = m.seat           / TAU;
  const thighR    = m.upperThighGirth / TAU;
  const kneeR     = m.kneeGirth      / TAU;
  const calfR     = m.calfGirth      / TAU;
  const upperArmR = m.upperArmGirth  / TAU;
  const wristR    = m.wristGirth     / TAU;
  const ankleR    = calfR * 0.66;

  // Heights from floor — tuned for a clean dress-form silhouette
  const headR     = H * 0.065;
  const headCtrH  = H - headR;                   // head sphere centre
  const neckTopH  = H - headR * 1.85;            // top of neck / bottom of head
  const shoulderH = H * 0.844;                   // arm attachment height
  const chestH    = H * 0.756;
  const waistH    = H * 0.615;
  const hipH      = waistH - 190;
  const seatH     = hipH  - 50;
  const crotchH   = waistH - m.bodyRise;
  const kneeH     = H * 0.286;
  const calfH     = H * 0.18;
  const ankleH    = H * 0.054;
  const elbowH    = H * 0.630;
  const wristH    = H * 0.420;

  const legSpacing = hipR * 0.40;
  const armSpacing = m.shoulderWidth / 2;

  return {
    H, headR, headCtrH, neckTopH, shoulderH, chestH,
    waistH, hipH, seatH, crotchH, kneeH, calfH, ankleH, elbowH, wristH,
    neckR, chestR, waistR, hipR, seatR, thighR, kneeR, calfR, ankleR,
    upperArmR, wristR, legSpacing, armSpacing,
  };
}

function lerp(a, b, t) { return a + (b - a) * t; }

function buildSmoothBody(measurements) {
  const d   = deriveBodyDims(measurements);
  const grp = new THREE.Group();

  const mat = new THREE.MeshStandardMaterial({
    color:     0xd0c4b8,   // warm cream — tailor's dress form
    roughness: 0.72,
    metalness: 0.0,
  });

  function mesh(geo, x = 0, y = 0, z = 0) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    grp.add(m);
    return m;
  }

  function lathe(pts, segs = 40) {
    return new THREE.LatheGeometry(pts, segs);
  }

  // ── TORSO (neck to crotch) ────────────────────────────────────────────────
  // Profile: bottom → top (LatheGeometry needs monotonic-y for outward normals)
  const torsoProfile = [
    V(d.thighR * 0.70,           d.crotchH),
    V(d.seatR,                   d.seatH),
    V(d.hipR,                    d.hipH),
    V(lerp(d.hipR, d.waistR, 0.35), lerp(d.hipH, d.waistH, 0.35)),
    V(d.waistR,                  d.waistH),
    V(lerp(d.waistR, d.chestR, 0.30), lerp(d.waistH, d.chestH, 0.30)),
    V(lerp(d.waistR, d.chestR, 0.65), lerp(d.waistH, d.chestH, 0.65)),
    V(d.chestR,                  d.chestH),
    V(lerp(d.chestR, d.armSpacing * 0.82, 0.5), lerp(d.chestH, d.shoulderH, 0.5)),
    V(d.armSpacing * 0.82,       d.shoulderH),
    V(lerp(d.armSpacing * 0.82, d.neckR * 1.5, 0.5), lerp(d.shoulderH, d.neckTopH, 0.3)),
    V(d.neckR * 1.5,             lerp(d.shoulderH, d.neckTopH, 0.55)),
    V(d.neckR * 1.15,            lerp(d.shoulderH, d.neckTopH, 0.75)),
    V(d.neckR,                   d.neckTopH),
  ];
  mesh(lathe(torsoProfile, 48));

  // ── HEAD ─────────────────────────────────────────────────────────────────
  const headMesh = mesh(
    new THREE.SphereGeometry(d.headR, 36, 28),
    0, d.headCtrH, 0
  );
  // Slightly flatten front-to-back for a more realistic head shape
  headMesh.scale.set(1.0, 1.08, 0.88);

  // ── LEGS ─────────────────────────────────────────────────────────────────
  // Profile: bottom (ankle) → top (crotch), offset to ±legSpacing on x-axis
  const legProfile = [
    V(d.ankleR * 0.90,           d.ankleH),
    V(d.ankleR * 1.18,           d.ankleH + 45),
    V(d.calfR  * 0.82,           lerp(d.ankleH, d.kneeH, 0.35)),
    V(d.calfR,                   d.calfH),
    V(d.calfR  * 0.86,           lerp(d.calfH, d.kneeH, 0.55)),
    V(d.kneeR  * 0.90,           d.kneeH - 35),
    V(d.kneeR  * 1.06,           d.kneeH),
    V(d.kneeR  * 0.94,           d.kneeH + 35),
    V(lerp(d.kneeR, d.thighR, 0.35), lerp(d.kneeH, d.crotchH, 0.35)),
    V(lerp(d.kneeR, d.thighR, 0.70), lerp(d.kneeH, d.crotchH, 0.70)),
    V(d.thighR * 1.02,           lerp(d.kneeH, d.crotchH, 0.86)),
    V(d.thighR,                  d.crotchH),
  ];
  mesh(lathe(legProfile, 36), -d.legSpacing);
  mesh(lathe(legProfile, 36),  d.legSpacing);

  // ── ARMS ─────────────────────────────────────────────────────────────────
  // Profile: bottom (wrist) → top (shoulder)
  const armProfile = [
    V(d.wristR,                  d.wristH),
    V(d.wristR * 1.18,           d.wristH + 35),
    V(lerp(d.wristR, d.upperArmR, 0.30), lerp(d.wristH, d.elbowH, 0.30)),
    V(lerp(d.wristR, d.upperArmR, 0.60), lerp(d.wristH, d.elbowH, 0.60)),
    V(d.upperArmR * 0.82,        d.elbowH - 28),
    V(d.upperArmR * 0.96,        d.elbowH),
    V(d.upperArmR * 0.88,        d.elbowH + 28),
    V(lerp(d.upperArmR, d.upperArmR * 1.18, 0.35), lerp(d.elbowH, d.shoulderH, 0.35)),
    V(lerp(d.upperArmR, d.upperArmR * 1.18, 0.70), lerp(d.elbowH, d.shoulderH, 0.70)),
    V(d.upperArmR * 1.18,        d.shoulderH),
  ];
  mesh(lathe(armProfile, 32), -d.armSpacing);
  mesh(lathe(armProfile, 32),  d.armSpacing);

  // ── FOOT STUBS ───────────────────────────────────────────────────────────
  const footGeo = new THREE.SphereGeometry(d.ankleR * 1.5, 20, 14);
  const fl = mesh(footGeo, -d.legSpacing, d.ankleH * 0.35, d.ankleR);
  const fr = mesh(footGeo,  d.legSpacing, d.ankleH * 0.35, d.ankleR);
  fl.scale.set(0.75, 0.42, 1.7);
  fr.scale.set(0.75, 0.42, 1.7);

  return grp;
}

// ─── Pattern overlay ──────────────────────────────────────────────────────────

function buildPatternLines(patternState, waistY) {
  const { points, segments } = patternState;
  const ptArr = Object.values(points);
  if (!ptArr.length) return null;

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of ptArr) {
    if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
  }
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const S  = 1.0; // 1 mm = 1 Three.js unit (our scene is in mm)

  function p3(px, py) {
    return [(px - cx) * S, waistY + (cy - py) * S, 300]; // 300mm in front
  }

  const verts = [];
  for (const seg of Object.values(segments)) {
    const p1 = points[seg.p1], p2 = points[seg.p2];
    if (!p1 || !p2) continue;
    if (seg.type === 'line') {
      verts.push(...p3(p1.x, p1.y), ...p3(p2.x, p2.y));
    } else if (seg.type === 'bezier') {
      const { c1, c2 } = seg;
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
  if (!verts.length) return null;

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  return new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0x58a6ff }));
}

// ─── Dispose helper ───────────────────────────────────────────────────────────

function disposeObject(obj) {
  if (!obj) return;
  obj.traverse(o => {
    o.geometry?.dispose();
    if (o.material && !Array.isArray(o.material)) o.material.dispose();
    else if (Array.isArray(o.material)) o.material.forEach(m => m.dispose());
  });
}

// ─── Component ────────────────────────────────────────────────────────────────

const PRESETS = ['front', 'back', 'left', 'right'];

export default function MannequinViewer({ measurements, patternState, bodyType = 'male_adult' }) {
  const mountRef   = useRef(null);
  const threeRef   = useRef(null);
  const bodyRef    = useRef(null);
  const patternRef = useRef(null);

  // ── Scene setup (once) ──────────────────────────────────────────────────
  useEffect(() => {
    const mount = mountRef.current;
    const { width: W, height: H } = mount.getBoundingClientRect();

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(W || 400, H || 700);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x0d1117);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();

    // Lighting — three-point setup for clean dress-form rendering
    scene.add(new THREE.AmbientLight(0xffffff, 0.50));

    const key = new THREE.DirectionalLight(0xfff8f0, 1.20);
    key.position.set(600, 2000, 1200);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    scene.add(key);

    const fill = new THREE.DirectionalLight(0xd0e8ff, 0.35);
    fill.position.set(-800, 800, -600);
    scene.add(fill);

    const rim = new THREE.DirectionalLight(0xffffff, 0.20);
    rim.position.set(0, -200, -1500);
    scene.add(rim);

    // Ground shadow disc
    const gGeo = new THREE.CircleGeometry(600, 48);
    const gMat = new THREE.MeshLambertMaterial({ color: 0x0d1117 });
    const ground = new THREE.Mesh(gGeo, gMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // Camera (mm-scale scene: body ~1780mm tall)
    const camera = new THREE.PerspectiveCamera(28, (W || 400) / (H || 700), 1, 50000);
    const defH = 1780;
    camera.position.set(0, defH * 0.52, defH * 2.5);
    camera.lookAt(0, defH * 0.52, 0);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, defH * 0.52, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 100;
    controls.maxDistance = 12000;
    controls.update();

    let animId;
    const animate = () => {
      animId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    threeRef.current = { renderer, scene, camera, controls, animId };

    const ro = new ResizeObserver(() => {
      const t = threeRef.current;
      if (!t) return;
      const W2 = mount.clientWidth, H2 = mount.clientHeight;
      if (!W2 || !H2) return;
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

  // ── Rebuild body when measurements / bodyType change ─────────────────────
  useEffect(() => {
    const t = threeRef.current;
    if (!t || !measurements) return;

    if (bodyRef.current) {
      disposeObject(bodyRef.current);
      t.scene.remove(bodyRef.current);
    }

    // Scale factor for children (child bodies use same proportions, just shorter)
    const isChild = bodyType?.includes('child');
    const measForBody = isChild
      ? { ...measurements, height: measurements.height * 0.64 }
      : measurements;

    const body = buildSmoothBody(measForBody);
    t.scene.add(body);
    bodyRef.current = body;

    // Recentre camera on new waist height
    const d = deriveBodyDims(measForBody);
    const target = d.waistH;
    t.controls.target.set(0, target, 0);
    t.camera.position.set(0, target, d.H * 2.5);
    t.camera.lookAt(0, target, 0);
    t.controls.update();

  }, [measurements, bodyType]);

  // ── Pattern overlay ──────────────────────────────────────────────────────
  useEffect(() => {
    const t = threeRef.current;
    if (!t) return;

    if (patternRef.current) {
      disposeObject(patternRef.current);
      t.scene.remove(patternRef.current);
      patternRef.current = null;
    }
    if (patternState && measurements) {
      const d = deriveBodyDims(measurements);
      const lines = buildPatternLines(patternState, d.waistH);
      if (lines) { t.scene.add(lines); patternRef.current = lines; }
    }
  }, [patternState, measurements]);

  // ── Camera presets ───────────────────────────────────────────────────────
  const setCameraPreset = useCallback((preset) => {
    const t = threeRef.current;
    if (!t || !measurements) return;
    const d  = deriveBodyDims(measurements);
    const ty = d.waistH;
    const dist = d.H * 2.5;
    t.controls.target.set(0, ty, 0);
    switch (preset) {
      case 'front': t.camera.position.set(0,   ty,  dist); break;
      case 'back':  t.camera.position.set(0,   ty, -dist); break;
      case 'left':  t.camera.position.set(-dist, ty, 0);   break;
      case 'right': t.camera.position.set( dist, ty, 0);   break;
    }
    t.camera.lookAt(0, ty, 0);
    t.controls.update();
  }, [measurements]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={mountRef} style={{ width: '100%', height: '100%' }} />

      <div style={{
        position: 'absolute', bottom: 10, left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex', gap: 4,
      }}>
        {PRESETS.map(p => (
          <button key={p} onClick={() => setCameraPreset(p)} style={{
            padding: '3px 9px', fontSize: 10,
            fontFamily: 'var(--font-mono)', textTransform: 'uppercase',
            letterSpacing: '0.06em',
            backgroundColor: 'rgba(22,27,34,0.85)',
            color: 'var(--color-text-dim)',
            border: '1px solid var(--color-border)',
            borderRadius: 4, cursor: 'pointer',
            backdropFilter: 'blur(4px)',
          }}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--color-text)'; e.currentTarget.style.borderColor = 'var(--color-accent)'; }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--color-text-dim)'; e.currentTarget.style.borderColor = 'var(--color-border)'; }}
          >{p}</button>
        ))}
      </div>
    </div>
  );
}
