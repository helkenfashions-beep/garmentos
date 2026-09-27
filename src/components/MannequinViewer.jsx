import { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createAvatarModel, bodyForDrape } from '../lib/avatar/avatar';
import { requestAvatarMesh } from '../lib/avatar/meshClient';
import { drapePattern, solvePatternPoint } from '../lib/drape/drape';
import { simulateCloth } from '../lib/cloth/clothClient';
import { CLOTH_MESH } from '../lib/cloth/pbd';

// ─── Body geometry ────────────────────────────────────────────────────────────
//
// The mannequin is the parametric avatar (lib/avatar): one signed-distance
// body, calibrated to the measurements, meshed off the main thread. The drape
// collides with the same field, so what you see is what the fabric touches.

const BODY_SPACING = 12;      // mm between mesh samples
const BODY_DEBOUNCE = 90;     // ms — coalesce fast measurement edits

function buildBodyMesh({ positions, normals, indices }) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geo.setIndex(new THREE.BufferAttribute(indices, 1));
  geo.computeBoundingSphere();
  const mat = new THREE.MeshStandardMaterial({ color: 0xd0c4b8, roughness: 0.72, metalness: 0.0 });
  const mesh = new THREE.Mesh(geo, mat);
  // casts onto the floor; no self-shadowing (the shadow map is too coarse
  // for the crotch and armpits and would draw ragged dark patches there)
  mesh.castShadow = true;
  mesh.receiveShadow = false;
  const grp = new THREE.Group();
  grp.name = 'body';
  grp.add(mesh);
  return grp;
}

// ─── Garment (draped pattern) ────────────────────────────────────────────────

const PANEL_COLORS = { front: 0x3e6a93, back: 0x355d82, free: 0x7a5a9a };
const HANDLE_COLOR = 0xf0883e;
const HANDLE_ACTIVE = 0xffd166;

/**
 * Meshes for draped instances. `geos[k]` is instance k's geometry (so the cloth
 * solver can stream new positions into it). The solver's garment is built
 * without seam lines or drag handles: both belong to the geometric drape.
 */
function buildGarment(instances, fabricColor, { seams = true, handles: withHandles = true } = {}) {
  const grp = new THREE.Group();
  grp.name = 'garment';
  const handleGeo = new THREE.SphereGeometry(7, 12, 10);
  const handles = [];
  const geos = [];

  for (let idx = 0; idx < instances.length; idx++) {
    const inst = instances[idx];
    if (inst.indices.length) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(inst.positions, 3));
      geo.setIndex(new THREE.BufferAttribute(inst.indices, 1));
      geo.computeVertexNormals();
      const base = new THREE.Color(fabricColor ?? PANEL_COLORS[inst.panel] ?? PANEL_COLORS.free);
      if (fabricColor && inst.panel === 'back') base.multiplyScalar(0.88);
      const mat = new THREE.MeshStandardMaterial({
        color: base, roughness: 0.9, metalness: 0, side: THREE.DoubleSide,
        // fabric sits millimetres off the skin: bias it toward the camera so the
        // body can never z-fight through it at normal viewing distance
        polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -8,
      });
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = true;
      m.userData.fabric = true;
      grp.add(m);
      geos[idx] = geo;
    }
    if (seams && inst.seams.length) {
      const sg = new THREE.BufferGeometry();
      sg.setAttribute('position', new THREE.BufferAttribute(inst.seams, 3));
      grp.add(new THREE.LineSegments(sg, new THREE.LineBasicMaterial({ color: 0xe6edf3 })));
    }
    for (const h of withHandles ? inst.handles : []) {
      const hm = new THREE.Mesh(handleGeo, new THREE.MeshBasicMaterial({ color: HANDLE_COLOR }));
      hm.position.set(h.pos[0], h.pos[1], h.pos[2]);
      hm.userData.handle = { pointId: h.pointId, x: h.x, y: h.y, instance: idx };
      hm.renderOrder = 2;
      grp.add(hm);
      handles.push(hm);
    }
  }
  return { group: grp, handles, geos };
}

// ─── Dispose helper ───────────────────────────────────────────────────────────

function disposeObject(obj) {
  if (!obj) return;
  const geos = new Set(), mats = new Set();
  obj.traverse(o => {
    if (o.geometry) geos.add(o.geometry);
    if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => mats.add(m));
  });
  geos.forEach(g => g.dispose());
  mats.forEach(m => m.dispose());
}

// ─── Camera framing ───────────────────────────────────────────────────────────

/** Distance and target that fit the whole body in the panel, whatever its shape. */
function frameBody(camera, model) {
  const d = model.dims;
  const halfFov = (camera.fov * Math.PI / 180) / 2;
  const needH = d.H * 1.22;                 // full height + room for the camera buttons
  const needW = model.bounds.max[0] * 2 + 120;   // hands (A-pose) + margin
  const distH = (needH / 2) / Math.tan(halfFov);
  const distW = (needW / 2) / (Math.tan(halfFov) * (camera.aspect || 1));
  return { dist: Math.max(distH, distW), ty: d.H * 0.47 };
}

// ─── Component ────────────────────────────────────────────────────────────────

const PRESETS = ['front', 'back', 'left', 'right'];

export default function MannequinViewer({
  measurements, patternState, bodyType = 'male_adult',
  onHandleDrag, fabricColor = null, compact = false,
}) {
  const mountRef    = useRef(null);
  const threeRef    = useRef(null);
  const bodyRef     = useRef(null);
  const garmentRef  = useRef(null);   // { group, handles }
  const instancesRef = useRef([]);
  const dragRef     = useRef(null);
  const onHandleDragRef = useRef(onHandleDrag);
  useEffect(() => { onHandleDragRef.current = onHandleDrag; }, [onHandleDrag]);

  const [showHandles, setShowHandles] = useState(true);
  const showHandlesRef = useRef(true);
  useEffect(() => {
    showHandlesRef.current = showHandles;
    garmentRef.current?.handles.forEach(h => { h.visible = showHandles; });
  }, [showHandles]);

  const [stats, setStats] = useState({ ms: 0, pieces: 0 });
  // Cloth simulation (on demand): idle → running → done. A new edit, a new
  // body or "reset" goes back to the live geometric drape.
  const [sim, setSim] = useState({ state: 'idle', frame: 0, ms: 0, reason: '' });
  const [drapeVersion, setDrapeVersion] = useState(0);
  const simRef = useRef(null);            // { run } of the running simulation
  const simStatsRef = useRef(null);
  const framedRef = useRef(false);      // true once the user has orbited/zoomed
  const lastBodyTypeRef = useRef(null);
  const bodyDimsRef = useRef(null);
  const setPresetRef = useRef(null);

  // calibrated body (fast, main thread) — shared by the drape and the framing
  const model = useMemo(
    () => (measurements ? createAvatarModel(measurements, bodyType) : null),
    [measurements, bodyType],
  );
  const drapeBody = useMemo(() => (model ? bodyForDrape(model) : null), [model]);
  const [bodyInfo, setBodyInfo] = useState({ ready: false, ms: 0 });

  // ── Scene setup (once) ──────────────────────────────────────────────────
  useEffect(() => {
    const mount = mountRef.current;
    const { width: W, height: H } = mount.getBoundingClientRect();

    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(W || 400, H || 700);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x0d1117);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.style.touchAction = 'none';
    renderer.domElement.style.display = 'block';
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    // sky/ground ambient: undersides (groin, under the arms) get a soft
    // bounce instead of flat darkness
    scene.add(new THREE.HemisphereLight(0xffffff, 0x6e6660, 0.75));
    const front = new THREE.DirectionalLight(0xffffff, 0.30);
    front.position.set(0, 300, 2000);
    scene.add(front);
    const key = new THREE.DirectionalLight(0xfff8f0, 1.20);
    key.position.set(600, 2000, 1200);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xd0e8ff, 0.40);
    fill.position.set(-800, 800, -600);
    scene.add(fill);
    const rim = new THREE.DirectionalLight(0xffffff, 0.25);
    rim.position.set(0, -200, -1500);
    scene.add(rim);

    const ground = new THREE.Mesh(new THREE.CircleGeometry(600, 48), new THREE.MeshLambertMaterial({ color: 0x0d1117 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // near plane at 50 mm (not 1 mm) → ~50× better depth precision on the body
    const camera = new THREE.PerspectiveCamera(28, (W || 400) / (H || 700), 50, 30000);
    const defH = 1780;
    camera.position.set(0, defH * 0.52, defH * 2.5);
    camera.lookAt(0, defH * 0.52, 0);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, defH * 0.52, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 250;
    controls.maxDistance = 12000;
    controls.update();

    let animId;
    const animate = () => {
      animId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    threeRef.current = { renderer, scene, camera, controls };

    // ── Seam-point dragging (3D → 2D) ─────────────────────────────────────
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();

    function toNdc(e) {
      const r = renderer.domElement.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      return r;
    }

    /** Nearest visible handle within a finger/mouse radius, in screen space. */
    function pickHandle(e) {
      const g = garmentRef.current;
      if (!g || !showHandlesRef.current) return null;
      const r = toNdc(e);
      const radius = e.pointerType === 'touch' ? 30 : 14;
      let best = null, bestD = radius;
      const v = new THREE.Vector3();
      for (const h of g.handles) {
        v.copy(h.position).project(camera);
        if (v.z > 1) continue;
        const sx = (v.x + 1) / 2 * r.width, sy = (1 - v.y) / 2 * r.height;
        const d = Math.hypot(sx - (e.clientX - r.left), sy - (e.clientY - r.top));
        if (d < bestD) {
          // occlusion: is fabric/body in front of this handle?
          raycaster.set(camera.position, h.position.clone().sub(camera.position).normalize());
          const dist = camera.position.distanceTo(h.position);
          const blockers = [bodyRef.current, g.group].filter(Boolean);
          const hits = raycaster.intersectObjects(blockers, true)
            .filter(i => !i.object.userData.handle && i.object.type === 'Mesh');
          if (hits.length && hits[0].distance < dist - 12) continue;
          best = h; bestD = d;
        }
      }
      return best;
    }

    function onDown(e) {
      const h = pickHandle(e);
      if (!h) return;
      e.stopPropagation();
      e.preventDefault();
      controls.enabled = false;
      const inst = instancesRef.current[h.userData.handle.instance];
      const normal = new THREE.Vector3();
      camera.getWorldDirection(normal);
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, h.position);
      toNdc(e);
      raycaster.setFromCamera(ndc, camera);
      const hit0 = new THREE.Vector3();
      if (!raycaster.ray.intersectPlane(plane, hit0)) { controls.enabled = true; return; }
      h.material.color.setHex(HANDLE_ACTIVE);
      dragRef.current = {
        pointerId: e.pointerId, handle: h, plane, hit0, sx: inst.sx,
        pos0: h.position.clone(), map: inst.map,
        start: { x: h.userData.handle.x, y: h.userData.handle.y },
        pointId: h.userData.handle.pointId, last: null,
      };
      renderer.domElement.setPointerCapture?.(e.pointerId);
    }

    function onMove(e) {
      const ds = dragRef.current;
      if (!ds || e.pointerId !== ds.pointerId) return;
      e.stopPropagation();
      toNdc(e);
      raycaster.setFromCamera(ndc, camera);
      const hit = new THREE.Vector3();
      if (!raycaster.ray.intersectPlane(ds.plane, hit)) return;
      const target = ds.pos0.clone().add(hit.sub(ds.hit0));
      const sol = solvePatternPoint(ds.map, ds.start, [target.x, target.y, target.z]);
      ds.last = sol;
      ds.handle.position.copy(target);
      onHandleDragRef.current?.(ds.pointId, sol.x, sol.y, false);
    }

    function onUp(e) {
      const ds = dragRef.current;
      if (!ds || e.pointerId !== ds.pointerId) return;
      dragRef.current = null;
      controls.enabled = true;
      renderer.domElement.releasePointerCapture?.(e.pointerId);
      if (ds.last) onHandleDragRef.current?.(ds.pointId, ds.last.x, ds.last.y, true);
      else ds.handle.material.color.setHex(HANDLE_COLOR);
    }

    // capture phase so we win against OrbitControls' own pointerdown
    const el = renderer.domElement;
    el.addEventListener('pointerdown', onDown, { capture: true });
    el.addEventListener('pointermove', onMove, { capture: true });
    el.addEventListener('pointerup', onUp, { capture: true });
    el.addEventListener('pointercancel', onUp, { capture: true });

    // Automation hook (used by the end-to-end tests): screen position of a handle
    window.__garmentos3d = {
      handleScreen(pointId, sx = 1) {
        const g = garmentRef.current;
        if (!g) return null;
        const h = g.handles.find(q => q.userData.handle.pointId === pointId &&
          instancesRef.current[q.userData.handle.instance]?.sx === sx);
        if (!h) return null;
        const r = renderer.domElement.getBoundingClientRect();
        const v = h.position.clone().project(camera);
        return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height };
      },
      handleIds() { return garmentRef.current?.handles.map(h => h.userData.handle.pointId) ?? []; },
      instances() { return instancesRef.current.map(i => ({ key: i.key, sx: i.sx, tris: i.indices.length / 3 })); },
      preset(p) { setPresetRef.current?.(p); },
      look(pos, target) {
        controls.target.set(...target);
        camera.position.set(...pos);
        camera.lookAt(...target);
        controls.update();
        framedRef.current = true;
      },
      setBodyVisible(v) { if (bodyRef.current) bodyRef.current.visible = v; },
      cameraPos() { return camera.position.toArray(); },
      bodyBox() {
        if (!bodyRef.current) return null;
        const b = new THREE.Box3().setFromObject(bodyRef.current);
        return { min: b.min.toArray(), max: b.max.toArray() };
      },
      bodyReady() { return !!bodyRef.current; },
      simStats() { return simStatsRef.current; },
      /** Front-to-back depth of the body mesh at height y (arms don't affect it). */
      bodyDepthAt(y) {
        let lo = Infinity, hi = -Infinity;
        bodyRef.current?.traverse(o => {
          if (!o.isMesh) return;
          const p = o.geometry.attributes.position.array;
          for (let i = 0; i < p.length; i += 3) if (Math.abs(p[i + 1] - y) < 8) { lo = Math.min(lo, p[i + 2]); hi = Math.max(hi, p[i + 2]); }
        });
        return hi - lo;
      },
      waistHeight() { return bodyDimsRef.current?.dims.waistH ?? null; },
      debugNormals(on) {
        bodyRef.current?.traverse(o => {
          if (!o.isMesh) return;
          if (on) { o.userData.mat = o.material; o.material = new THREE.MeshNormalMaterial(); }
          else if (o.userData.mat) o.material = o.userData.mat;
        });
      },
      setGarmentVisible(v) { if (garmentRef.current) garmentRef.current.group.visible = v; },
    };

    const ro = new ResizeObserver(() => {
      const W2 = mount.clientWidth, H2 = mount.clientHeight;
      if (!W2 || !H2) return;
      renderer.setSize(W2, H2);
      camera.aspect = W2 / H2;
      camera.updateProjectionMatrix();
      if (!framedRef.current && bodyDimsRef.current) {
        // until the user moves the camera, keep the body framed as the panel resizes
        const { dist, ty } = frameBody(camera, bodyDimsRef.current);
        const dir = camera.position.clone().sub(controls.target).normalize();
        controls.target.set(0, ty, 0);
        camera.position.copy(controls.target).addScaledVector(dir, dist);
        controls.update();
      }
    });
    controls.addEventListener('start', () => { framedRef.current = true; });
    ro.observe(mount);

    return () => {
      cancelAnimationFrame(animId);
      ro.disconnect();
      el.removeEventListener('pointerdown', onDown, { capture: true });
      el.removeEventListener('pointermove', onMove, { capture: true });
      el.removeEventListener('pointerup', onUp, { capture: true });
      el.removeEventListener('pointercancel', onUp, { capture: true });
      controls.dispose();
      disposeObject(scene);
      renderer.dispose();
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
      simRef.current?.run.cancel();
      simRef.current = null;
      threeRef.current = null;
      bodyRef.current = null;
      garmentRef.current = null;
      delete window.__garmentos3d;
    };
  }, []);

  // ── Frame the camera for a new body ─────────────────────────────────────
  useEffect(() => {
    const t = threeRef.current;
    if (!t || !model) return;
    bodyDimsRef.current = model;
    // Reframe on first build or a new body type. While measurements are being
    // edited, keep the view the user turned the body to.
    const newType = lastBodyTypeRef.current !== bodyType;
    lastBodyTypeRef.current = bodyType;
    if (newType || !framedRef.current) {
      framedRef.current = false;
      const { dist, ty } = frameBody(t.camera, model);
      t.controls.target.set(0, ty, 0);
      t.camera.position.set(0, ty, dist);
      t.camera.lookAt(0, ty, 0);
      t.controls.update();
    }
  }, [model, bodyType]);

  // ── Mesh the body (worker, debounced) ───────────────────────────────────
  // The old mesh stays on screen until the new one arrives, so editing a
  // measurement never flashes an empty scene.
  useEffect(() => {
    if (!measurements) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const data = await requestAvatarMesh(measurements, bodyType, BODY_SPACING);
      const t = threeRef.current;
      if (cancelled || !t) return;
      if (bodyRef.current) { disposeObject(bodyRef.current); t.scene.remove(bodyRef.current); }
      const body = buildBodyMesh(data);
      t.scene.add(body);
      bodyRef.current = body;
      setBodyInfo({ ready: true, ms: data.ms });
    }, bodyRef.current ? BODY_DEBOUNCE : 0);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [measurements, bodyType]);

  // ── Drape the pattern onto the body (live sync) ──────────────────────────
  useEffect(() => {
    const t = threeRef.current;
    if (!t) return;
    // any edit ends a simulation: the live drape takes over again
    if (simRef.current) { simRef.current.run.cancel(); simRef.current = null; }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the drape is an external (Three.js) system
    setSim(s => (s.state === 'idle' ? s : { state: 'idle', frame: 0, ms: 0, reason: '' }));
    const prev = garmentRef.current;
    if (prev) {
      disposeObject(prev.group);
      t.scene.remove(prev.group);
      garmentRef.current = null;
    }
    const prevInstances = instancesRef.current;
    instancesRef.current = [];
    if (!patternState || !drapeBody) {
       
      setStats({ ms: 0, pieces: 0 });
      return;
    }

    const t0 = performance.now();
    let instances = [];
    try {
      instances = drapePattern(patternState, drapeBody);
    } catch (err) {
      console.warn('drape failed', err);
    }
    const garment = buildGarment(instances, fabricColor);
    garment.handles.forEach(h => { h.visible = showHandlesRef.current; });
    // keep the handle being dragged highlighted and under the finger across rebuilds
    const ds = dragRef.current;
    if (ds) {
      const again = garment.handles.find(h => h.userData.handle.pointId === ds.pointId &&
        instances[h.userData.handle.instance].sx === ds.sx);
      if (again) {
        again.material.color.setHex(HANDLE_ACTIVE);
        again.position.copy(ds.handle.position);
        ds.handle = again;
      }
    }
    void prevInstances;
    t.scene.add(garment.group);
    garmentRef.current = garment;
    instancesRef.current = instances;
    const ms = performance.now() - t0;
    setStats({ ms, pieces: new Set(instances.map(i => i.key)).size });
   
  }, [patternState, drapeBody, fabricColor, drapeVersion]);

  // ── Cloth simulation (on demand, off the main thread) ───────────────────
  const startSimulation = useCallback(() => {
    const t = threeRef.current;
    if (!t || !patternState || !drapeBody || !measurements || simRef.current) return;
    let simInstances;
    try {
      // the solver drapes at a coarser spacing (fewer particles, same shape)
      simInstances = drapePattern(patternState, drapeBody, CLOTH_MESH);
    } catch (err) {
      console.warn('drape failed', err);
      return;
    }
    const prev = garmentRef.current;
    if (prev) { disposeObject(prev.group); t.scene.remove(prev.group); }
    const garment = buildGarment(simInstances, fabricColor, { seams: false, handles: false });
    t.scene.add(garment.group);
    garmentRef.current = garment;
    instancesRef.current = [];
    simStatsRef.current = null;
    setSim({ state: 'running', frame: 0, ms: 0, reason: '' });

    const token = {};
    const live = () => simRef.current && simRef.current.token === token;
    const run = simulateCloth({
      measurements, bodyType, instances: simInstances,
      onFrame(positions, info) {
        if (!live()) return;
        info.offsets.forEach((off, k) => {
          const geo = garment.geos[k];
          if (!geo) return;
          const attr = geo.attributes.position;
          attr.array.set(positions.subarray(off * 3, off * 3 + attr.count * 3));
          attr.needsUpdate = true;
          geo.computeVertexNormals();
          geo.computeBoundingSphere();
        });
        setSim(s => ({ ...s, frame: info.frame }));
      },
      onDone(info) {
        if (!live()) return;
        simRef.current = null;
        simStatsRef.current = info;
        setSim({ state: 'done', frame: info.frame, ms: info.ms, reason: info.reason });
      },
    });
    simRef.current = { run, token };
  }, [patternState, drapeBody, measurements, bodyType, fabricColor]);

  const stopSimulation = useCallback(() => { simRef.current?.run.cancel(); }, []);
  const resetDrape = useCallback(() => setDrapeVersion(v => v + 1), []);

  // ── Camera presets ───────────────────────────────────────────────────────
  const setCameraPreset = useCallback((preset) => {
    const t = threeRef.current;
    if (!t || !model) return;
    const { dist, ty } = frameBody(t.camera, model);
    t.controls.target.set(0, ty, 0);
    switch (preset) {
      case 'front': t.camera.position.set(0,   ty,  dist); break;
      case 'back':  t.camera.position.set(0,   ty, -dist); break;
      case 'left':  t.camera.position.set(-dist, ty, 0);   break;
      case 'right': t.camera.position.set( dist, ty, 0);   break;
    }
    t.camera.lookAt(0, ty, 0);
    t.controls.update();
  }, [model]);
  useEffect(() => { setPresetRef.current = setCameraPreset; }, [setCameraPreset]);

  const pill = {
    padding: compact ? '7px 11px' : '3px 9px', fontSize: compact ? 11 : 10,
    fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.06em',
    backgroundColor: 'rgba(22,27,34,0.85)', color: 'var(--color-text-dim)',
    border: '1px solid var(--color-border)', borderRadius: 4, cursor: 'pointer',
    backdropFilter: 'blur(4px)',
  };

  return (
    <div
      data-testid="viewer3d"
      data-drape-ms={stats.ms.toFixed(1)}
      data-drape-pieces={stats.pieces}
      data-body-ready={bodyInfo.ready ? 'true' : 'false'}
      data-body-ms={bodyInfo.ms.toFixed(0)}
      data-sim-state={sim.state}
      data-sim-frame={sim.frame}
      style={{ position: 'relative', width: '100%', height: '100%' }}
    >
      <div ref={mountRef} style={{ width: '100%', height: '100%' }} />

      {stats.pieces > 0 && (
        <div style={{
          position: 'absolute', top: 8, left: 8, fontSize: 10, fontFamily: 'var(--font-mono)',
          color: 'var(--color-text-dim)', background: 'rgba(13,17,23,0.7)', padding: '3px 7px', borderRadius: 4,
          pointerEvents: 'none',
        }}>
          {sim.state === 'idle' && <>{stats.pieces} piece{stats.pieces === 1 ? '' : 's'} · drape {stats.ms.toFixed(0)} ms</>}
          {sim.state === 'running' && <>simulating · frame {sim.frame}</>}
          {sim.state === 'done' && <>{sim.reason === 'cancelled' ? 'stopped' : 'settled'} · {sim.frame} frames · {(sim.ms / 1000).toFixed(1)} s</>}
        </div>
      )}

      <div style={{
        position: 'absolute', bottom: 10, left: '50%', transform: 'translateX(-50%)',
        display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'center', width: 'max-content', maxWidth: '96%',
      }}>
        {PRESETS.map(p => (
          <button key={p} onClick={() => setCameraPreset(p)} style={pill}>{p}</button>
        ))}
        {sim.state === 'idle' && (
          <button
            data-testid="toggle-handles"
            onClick={() => setShowHandles(v => !v)}
            style={{ ...pill, color: showHandles ? 'var(--color-point)' : 'var(--color-text-dim)' }}
          >
            points
          </button>
        )}
        {stats.pieces > 0 && (
          <button
            data-testid="simulate"
            onClick={sim.state === 'idle' ? startSimulation : sim.state === 'running' ? stopSimulation : resetDrape}
            title={sim.state === 'idle' ? 'Let the fabric settle under gravity (cloth physics)'
              : sim.state === 'running' ? 'Stop the simulation here' : 'Back to the live drape'}
            style={{ ...pill, color: sim.state === 'running' ? 'var(--color-point)' : 'var(--color-accent, #58a6ff)' }}
          >
            {sim.state === 'idle' ? 'simulate' : sim.state === 'running' ? 'stop' : 'reset'}
          </button>
        )}
      </div>
    </div>
  );
}
