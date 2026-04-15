import { useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Male }   from '../lib/mannequin/bodies/Male.js';
import { Female } from '../lib/mannequin/bodies/Female.js';
import { Child }  from '../lib/mannequin/bodies/Child.js';

// ─── Body type config ────────────────────────────────────────────────────────
// mannequin.js uses height in metres (default Male 1.8, Female 1.7, Child 1.15)

const BODY_TYPES = {
  male_adult:   { label: 'Male',         Factory: Male,   defaultH: 1.8  },
  female_adult: { label: 'Female',       Factory: Female, defaultH: 1.7  },
  male_child:   { label: 'Boy',          Factory: Child,  defaultH: 1.15 },
  female_child: { label: 'Girl',         Factory: Child,  defaultH: 1.10 },
};

// mannequin.js internal units: ~1 unit ≈ 80mm at height=1.8
// The mannequin stands so its feet touch y = GROUND_LEVEL (-0.7)
// We keep all Three.js work in mannequin.js native units here
// Pattern state arrives in mm — we scale for the overlay separately

// ─── Dispose helper ──────────────────────────────────────────────────────────
function disposeObject(obj) {
  if (!obj) return;
  obj.traverse(o => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      if (Array.isArray(o.material)) o.material.forEach(m => m.dispose());
      else o.material.dispose();
    }
  });
}

// ─── Pattern overlay ─────────────────────────────────────────────────────────
// Draws pattern segments as blue lines centred in front of the body.
// Pattern mm → mannequin units: 1 mannequin unit ≈ 1800mm / 1.8 height = 1000mm/unit
// so 1mm = 0.001 mannequin units
function buildPatternLines(patternState) {
  const { points, segments } = patternState;
  const ptArr = Object.values(points);
  if (ptArr.length === 0) return null;

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of ptArr) {
    if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
  }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;

  const SCALE = 0.001;       // mm → mannequin units
  const zPos  = 1.2;         // in front of body
  const yBase = 1.2;         // approx waist height in mannequin units

  function p3(px, py) {
    return [(px - cx) * SCALE, yBase + (cy - py) * SCALE, zPos];
  }

  const verts = [];
  for (const seg of Object.values(segments)) {
    const p1 = points[seg.p1];
    const p2 = points[seg.p2];
    if (!p1 || !p2) continue;

    if (seg.type === 'line') {
      verts.push(...p3(p1.x, p1.y), ...p3(p2.x, p2.y));
    } else if (seg.type === 'bezier') {
      const c1 = seg.c1, c2 = seg.c2;
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
  return new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0x58a6ff }));
}

// ─── Component ───────────────────────────────────────────────────────────────

const PRESETS = ['front', 'back', 'left', 'right'];

export default function MannequinViewer({ measurements, patternState, bodyType = 'male_adult' }) {
  const mountRef   = useRef(null);
  const threeRef   = useRef(null);
  const bodyRef    = useRef(null);
  const patternRef = useRef(null);

  // ── Scene setup (once) ────────────────────────────────────────────────────
  useEffect(() => {
    const mount = mountRef.current;
    const rect  = mount.getBoundingClientRect();
    const W = rect.width  || 480;
    const H = rect.height || 720;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x0d1117);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();

    // Lighting — matching mannequin.js's own setup for best visual
    const ambient = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambient);
    const sun = new THREE.DirectionalLight(0xffffff, 2.75);
    sun.decay = 0;
    sun.position.set(0, 4, 2).setLength(15);
    sun.castShadow = true;
    scene.add(sun);

    // Ground shadow disc
    const groundGeo = new THREE.CircleGeometry(3, 40);
    const groundMat = new THREE.MeshLambertMaterial({ color: 0x161b22 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.7; // GROUND_LEVEL
    ground.receiveShadow = true;
    scene.add(ground);

    // Camera
    const camera = new THREE.PerspectiveCamera(30, W / H, 0.01, 200);
    camera.position.set(0, 1.2, 5);
    camera.lookAt(0, 1.2, 0);

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 1.2, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 0.5;
    controls.maxDistance = 20;
    controls.update();

    let animId;
    function animate() {
      animId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    }
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

  // ── Rebuild body when bodyType or measurements change ─────────────────────
  useEffect(() => {
    const t = threeRef.current;
    if (!t) return;

    if (bodyRef.current) {
      disposeObject(bodyRef.current);
      t.scene.remove(bodyRef.current);
      bodyRef.current = null;
    }

    const cfg = BODY_TYPES[bodyType] || BODY_TYPES.male_adult;

    // Height from measurements (mm → metres)
    const heightM = measurements?.height
      ? measurements.height / 1000
      : cfg.defaultH;

    const mannequin = new cfg.Factory(heightM);
    // mannequin is a THREE.Group — add to our scene
    t.scene.add(mannequin);
    bodyRef.current = mannequin;

    // Centre orbit on body midpoint
    t.controls.target.set(0, heightM * 0.55, 0);
    t.camera.position.set(0, heightM * 0.55, heightM * 3);
    t.camera.lookAt(0, heightM * 0.55, 0);
    t.controls.update();

  }, [bodyType, measurements?.height]);

  // ── Update pattern lines ──────────────────────────────────────────────────
  useEffect(() => {
    const t = threeRef.current;
    if (!t) return;

    if (patternRef.current) {
      disposeObject(patternRef.current);
      t.scene.remove(patternRef.current);
      patternRef.current = null;
    }

    if (patternState) {
      const lines = buildPatternLines(patternState);
      if (lines) { t.scene.add(lines); patternRef.current = lines; }
    }
  }, [patternState]);

  // ── Camera presets ────────────────────────────────────────────────────────
  const setCameraPreset = useCallback((preset) => {
    const t = threeRef.current;
    if (!t) return;
    const h = measurements?.height ? measurements.height / 1000 : 1.8;
    const ty = h * 0.55;
    const d  = h * 2.8;
    t.controls.target.set(0, ty, 0);
    switch (preset) {
      case 'front': t.camera.position.set(0,  ty,  d); break;
      case 'back':  t.camera.position.set(0,  ty, -d); break;
      case 'left':  t.camera.position.set(-d, ty,  0); break;
      case 'right': t.camera.position.set( d, ty,  0); break;
    }
    t.camera.lookAt(0, ty, 0);
    t.controls.update();
  }, [measurements?.height]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={mountRef} style={{ width: '100%', height: '100%' }} />

      {/* Camera presets */}
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
