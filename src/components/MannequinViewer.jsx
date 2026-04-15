import { useEffect, useRef, useCallback, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader }    from 'three/addons/loaders/GLTFLoader.js';

// ─── Config ──────────────────────────────────────────────────────────────────

const MODEL_PATHS = {
  male:   '/models/Soldier.glb',
  female: '/models/Michelle.glb',
};

const BODY_TYPES = {
  male_adult:   { gender: 'male',   defaultH: 1.80 },
  female_adult: { gender: 'female', defaultH: 1.65 },
  male_child:   { gender: 'male',   defaultH: 1.15 },
  female_child: { gender: 'female', defaultH: 1.10 },
};

// Dress-form material — strips clothing textures, gives clean smooth mannequin look
const MANNEQUIN_MAT = new THREE.MeshStandardMaterial({
  color:     0xcdc0b4,   // warm light beige — classic tailor's dummy tone
  roughness: 0.75,
  metalness: 0.0,
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function disposeObject(obj) {
  if (!obj) return;
  obj.traverse(o => {
    if (o.geometry) o.geometry.dispose();
    // We use shared MANNEQUIN_MAT — don't dispose it
  });
}

function buildPatternLines(patternState, waistY) {
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

  const S = 0.001; // mm → metres

  function p3(px, py) {
    return [(px - cx) * S, waistY + (cy - py) * S, 0.28];
  }

  const verts = [];
  for (const seg of Object.values(segments)) {
    const p1 = points[seg.p1], p2 = points[seg.p2];
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

const loader = new GLTFLoader();
const modelCache = {}; // cache loaded GLTF scenes by gender

const PRESETS = ['front', 'back', 'left', 'right'];

export default function MannequinViewer({ measurements, patternState, bodyType = 'male_adult' }) {
  const mountRef   = useRef(null);
  const threeRef   = useRef(null);
  const bodyRef    = useRef(null);
  const patternRef = useRef(null);
  const waistYRef  = useRef(1.0);

  const [loading, setLoading] = useState(false);

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

    // Lighting for a clean dress-form appearance
    scene.add(new THREE.AmbientLight(0xffffff, 0.55));

    const key = new THREE.DirectionalLight(0xfff5e8, 1.4);
    key.position.set(1.5, 3, 2);
    key.castShadow = true;
    scene.add(key);

    const fill = new THREE.DirectionalLight(0xddeeff, 0.4);
    fill.position.set(-2, 1, -1);
    scene.add(fill);

    // Ground
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(3, 48),
      new THREE.MeshLambertMaterial({ color: 0x0d1117 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // Camera
    const camera = new THREE.PerspectiveCamera(28, W / H, 0.01, 100);
    camera.position.set(0, 1.0, 4.5);
    camera.lookAt(0, 1.0, 0);

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 1.0, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 0.3;
    controls.maxDistance = 12;
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
      MANNEQUIN_MAT.dispose();
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
      threeRef.current = null;
    };
  }, []);

  // ── Load / swap body when bodyType or height changes ─────────────────────
  useEffect(() => {
    const t = threeRef.current;
    if (!t) return;

    const cfg     = BODY_TYPES[bodyType] || BODY_TYPES.male_adult;
    const targetH = measurements?.height ? measurements.height / 1000 : cfg.defaultH;
    const path    = MODEL_PATHS[cfg.gender];

    function applyModel(gltf) {
      // Remove old body
      if (bodyRef.current) {
        disposeObject(bodyRef.current);
        t.scene.remove(bodyRef.current);
        bodyRef.current = null;
      }

      // Clone so we don't mutate the cache
      const model = gltf.scene.clone(true);

      // Strip all original materials — apply clean dress-form material
      model.traverse(node => {
        if (node.isMesh) {
          node.material  = MANNEQUIN_MAT;
          node.castShadow = true;
          node.receiveShadow = true;
        }
      });

      // Scale to target height
      const box    = new THREE.Box3().setFromObject(model);
      const modelH = box.max.y - box.min.y;
      const scale  = targetH / modelH;
      model.scale.setScalar(scale);

      // Recompute box after scale, lift feet to y=0
      box.setFromObject(model);
      model.position.y = -box.min.y;

      t.scene.add(model);
      bodyRef.current = model;

      // Record waist Y for pattern overlay (61.5% of height)
      waistYRef.current = targetH * 0.615;

      // Recentre camera orbit
      const midY = targetH * 0.52;
      t.controls.target.set(0, midY, 0);
      t.camera.position.set(0, midY, targetH * 2.6);
      t.camera.lookAt(0, midY, 0);
      t.controls.update();

      setLoading(false);
    }

    // Use cache if available
    if (modelCache[cfg.gender]) {
      applyModel(modelCache[cfg.gender]);
      return;
    }

    setLoading(true);
    loader.load(
      path,
      (gltf) => {
        modelCache[cfg.gender] = gltf;
        applyModel(gltf);
      },
      undefined,
      (err) => {
        console.error('Model load error:', err);
        setLoading(false);
      }
    );
  }, [bodyType, measurements?.height]);

  // ── Pattern overlay ───────────────────────────────────────────────────────
  useEffect(() => {
    const t = threeRef.current;
    if (!t) return;

    if (patternRef.current) {
      patternRef.current.geometry?.dispose();
      t.scene.remove(patternRef.current);
      patternRef.current = null;
    }

    if (patternState) {
      const lines = buildPatternLines(patternState, waistYRef.current);
      if (lines) { t.scene.add(lines); patternRef.current = lines; }
    }
  }, [patternState]);

  // ── Camera presets ────────────────────────────────────────────────────────
  const setCameraPreset = useCallback((preset) => {
    const t = threeRef.current;
    if (!t) return;
    const h  = measurements?.height ? measurements.height / 1000 : 1.8;
    const ty = h * 0.52;
    const d  = h * 2.6;
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

      {/* Loading indicator */}
      {loading && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--color-text-dim)', fontSize: 12,
          fontFamily: 'var(--font-mono)', pointerEvents: 'none',
        }}>
          Loading body…
        </div>
      )}

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
          onMouseEnter={e => { e.currentTarget.style.color='var(--color-text)'; e.currentTarget.style.borderColor='var(--color-accent)'; }}
          onMouseLeave={e => { e.currentTarget.style.color='var(--color-text-dim)'; e.currentTarget.style.borderColor='var(--color-border)'; }}
          >{p}</button>
        ))}
      </div>
    </div>
  );
}
