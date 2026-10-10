// 3D viewer entry (docs/configurator.md §4.5–§4.13): import()ed by preview/load3d.ts only, so
// three.js never reaches another chunk. Everything that touches the renderer API lives in
// ./renderer.ts; this module composes scene, rig, materials, textures, controls, overlay and
// lifecycle.
//
// API
//   createViewer(init) → Promise<Viewer>   (types.ts)
//     Resolves after the first lit frame. Init phases are separated by yieldToMain(): renderer →
//     environment (PMREM) → meshes → compileAsync (incl. the Physical variant) → first frame.
//     The first frame uses the flat species colours; textures stream in afterwards (textures.ts).
//   Viewer.update(build)   diffed by part id (rig.ts); the contact shadow and the label follow;
//                          a refit is checked 250 ms after the last change (hysteresis, camera.ts).
//   Viewer.view/rotate/zoom/reset   the view buttons (also wired to `init.controls` clicks).
//   Viewer.snapshot()      §4.12, see snapshot.ts.
//   Viewer.dispose()       cancels the frame, aborts every listener, disconnects the observers,
//                          disposes controls, geometries, materials, textures, PMREM and the shadow,
//                          then renderer.dispose() + forceContextLoss() and removes the canvas.
//
// DOM contract (inside `[data-viewer]`, created here)
//   <canvas role="img" aria-label="3D-Vorschau: …">   label = init.label + ': ' + describe(build),
//                                                     debounced 500 ms after a change.
//   <svg class="preview__overlay" aria-hidden="true"> dimension overlay (overlay.ts).
//   `[data-viewer-note]` (init.note) is unhidden for Kernbuche („Holzbild beispielhaft“).
//   `[data-view="oben"]` in the controls is unhidden for tables only.
//   `[data-viewer]` gets data-viewer-az: the camera azimuth in whole degrees, written on the frame in
//   which the camera settled (never per drag frame): the test hook for the per-kind orbit limits.
//
// Behaviour
// - Render on demand: a frame runs only after invalidate() (controls change, texture ready, resize,
//   back on screen, build change) and keeps running only while the controls damp or a tween runs.
//   Idle = 0 requestAnimationFrame calls.
// - OrbitControls: no pan, damping .12 (off under reduced motion), polar 0.12…π/2−.03, azimuth
//   ±60° (niche) / ±120° (carcass) / free (table), distance 0.4–2.5 × fit. No listenToKeyEvents; the
//   buttons are the keyboard path. The stylesheet forces `touch-action: pan-y` on the canvas.
// - Camera tweens take 350 ms and jump under prefers-reduced-motion. No auto-rotate.
// - Hover or focus on a species swatch (input[name=moebel_holz]) prefetches its textures.
// - A lost WebGL context calls init.onLost(); the caller disposes and falls back to the drawing.
import { Box3, BoxGeometry, MathUtils, Mesh, Vector3 } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { Build, Species } from '../../../lib/configurator/furniture/types';
import { POLAR, PRESETS, azimuthLimit, clampAzimuth, directionOf, fitDistance, needsRefit } from './camera';
import { createContactShadow } from './contact-shadow';
import { createMaterials } from './materials';
import { createOverlay } from './overlay';
import { selectQuality } from './quality';
import { createBackend } from './renderer';
import { createRig } from './rig';
import { createScene } from './scene';
import { takeSnapshot } from './snapshot';
import { createTextureStore } from './textures';
import { createTween } from './tween';
import type { ViewPreset, Viewer, ViewerInit } from './types';

/** aria-label debounce (§4.11). */
const LABEL_DELAY = 500;
/** Refit check after the last change (§4.6). */
const REFIT_DELAY = 250;
const TWEEN_MS = 350;
/** Rotate button step in degrees (§4.6). */
const STEP = 15;
const ZOOM_IN = 0.8;
const ZOOM_OUT = 1.25;

/** scheduler.yield() where it exists, else a macrotask. */
const yieldToMain = (): Promise<void> => {
  const s = (globalThis as { scheduler?: { yield?: () => Promise<void> } }).scheduler;
  return s?.yield ? s.yield() : new Promise((r) => setTimeout(r, 0));
};

interface NavigatorExtras {
  connection?: { saveData?: boolean };
  deviceMemory?: number;
}

export async function createViewer(init: ViewerInit): Promise<Viewer> {
  const { canvas, host } = init;
  const ac = new AbortController();
  const { signal } = ac;
  const nav = navigator as Navigator & NavigatorExtras;
  let build = init.build;

  // Phase 1: renderer and quality tier.
  const probeDpr = Math.min(devicePixelRatio || 1, 2);
  const backend = createBackend(canvas, init.gl, probeDpr);
  const quality = selectQuality({
    saveData: !!nav.connection?.saveData,
    deviceMemory: nav.deviceMemory,
    renderer: backend.rendererName,
    dpr: probeDpr,
  });
  backend.setPixelRatio(quality.dpr);
  await yieldToMain();

  // Phases 2–5 register their disposers; a failure (lost context, shader error) frees everything
  // created so far, including the renderer and its context, before it rejects.
  const cleanup: (() => void)[] = [];
  try {
    // Phase 2: environment lighting.
    const { scene, camera, dispose: disposeScene } = createScene(backend);
    cleanup.push(disposeScene);
    await yieldToMain();

    // Phase 3: materials, meshes, contact shadow.
    const textures = createTextureStore(quality, backend, (s, f, set) => {
      materials.apply(s, f, set);
      invalidate();
    });
    const materials = createMaterials(quality, (s) => textures.avgColor(s) ?? init.colour(s));
    const rig = createRig(materials, (b) => textures.texMm(b.params.species));
    const shadow = createContactShadow();
    cleanup.push(textures.dispose, materials.dispose, rig.dispose, shadow.dispose);
    scene.add(rig.group, shadow.mesh);
    const strength = Number.parseFloat(getComputedStyle(host).getPropertyValue('--shadow-strength')) || 0.8;
    rig.apply(build);
    shadow.update(build, strength);
    await yieldToMain();

    // Phase 4: shaders, including the Physical (lacquer) variant, so a finish switch never compiles.
    await backend.compile(scene, camera);
    const warm = new Mesh(new BoxGeometry(0.001, 0.001, 0.001), materials.warm);
    await backend.compile(warm, camera, scene);
    warm.geometry.dispose();
    await yieldToMain();

    // Phase 5: DOM, controls, overlay, observers, first frame.
    const label = (b: Build) => `${init.label}: ${init.describe(b)}`;
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', label(build));
    host.append(canvas);
    const overlay = createOverlay(host);
    cleanup.push(overlay.dispose);
    const reduce = matchMedia('(prefers-reduced-motion: reduce)');
    const ms = () => (reduce.matches ? 0 : TWEEN_MS);

    const controls = new OrbitControls(camera, canvas);
    controls.enablePan = false;
    controls.enableDamping = !reduce.matches;
    controls.dampingFactor = 0.12;
    controls.minPolarAngle = POLAR.min;
    controls.maxPolarAngle = POLAR.max;
    cleanup.push(() => controls.dispose());
    let kind = build.params.kind;
    let azLimit = azimuthLimit(kind);
    const tween = createTween(camera.position, controls.target);

    const box = new Box3();
    const centre = new Vector3();
    const dir = new Vector3();
    const fwd = new Vector3();
    const pos = new Vector3();
    let fit = 1;
    let raf = 0;
    let dirty = false;
    let visible = true;
    let inFrame = false;
    let settle = true;
    let labelTimer = 0;
    let refitTimer = 0;
    let sized = false;

    const boxOf = (b: Build) => {
      box.min.fromArray(b.bounds.min).divideScalar(1000);
      box.max.fromArray(b.bounds.max).divideScalar(1000);
      return box;
    };
    const clampAz = (az: number) => clampAzimuth(az, kind);
    const applyAzimuth = () => {
      const a = MathUtils.degToRad(azLimit);
      controls.minAzimuthAngle = -a;
      controls.maxAzimuthAngle = a;
    };

    const invalidate = () => {
      dirty = true;
      if (!raf && visible) raf = requestAnimationFrame(frame);
    };
    function frame(now: number) {
      raf = 0;
      inFrame = true;
      const animating = tween.tick(now);
      const moving = controls.update();
      if (dirty || moving || animating) {
        backend.render(scene, camera);
        overlay.draw(build.dims, camera, host.clientWidth, host.clientHeight);
        dirty = false;
      }
      inFrame = false;
      if (moving || animating) {
        settle = true;
        raf = requestAnimationFrame(frame);
      } else if (settle) {
        // Test hook: the azimuth (whole degrees) on the first quiet frame after a move (or the first frame).
        settle = false;
        host.dataset['viewerAz'] = String(Math.round(spherical().az));
      }
    }
    // OrbitControls dispatches 'change' from its own update() too; a frame never queues another.
    controls.addEventListener('change', () => inFrame || invalidate());

    /** Places the camera at the fit distance along `d` (from the target) and updates the limits. */
    const place = (d: Vector3, duration: number) => {
      boxOf(build).getCenter(centre);
      fit = fitDistance(box, fwd.copy(d).negate(), camera);
      camera.near = fit / 100;
      camera.far = fit * 10;
      camera.updateProjectionMatrix();
      controls.minDistance = 0.4 * fit;
      controls.maxDistance = 2.5 * fit;
      applyAzimuth();
      tween.to(pos.copy(centre).addScaledVector(d, fit), centre, duration);
      invalidate();
    };
    const preset = (p: ViewPreset, duration: number) => {
      const { az, el } = PRESETS[p];
      place(directionOf(clampAz(az), el, dir), duration);
    };
    /** Current azimuth/elevation (°) and distance of the camera around the target. */
    const spherical = () => {
      dir.subVectors(camera.position, controls.target);
      const r = dir.length();
      return { az: MathUtils.radToDeg(Math.atan2(dir.x, dir.z)), el: MathUtils.radToDeg(Math.asin(dir.y / r)), r };
    };

    /** Sizes the buffer to the host; false while the host has no size (its step is hidden). */
    const size = () => {
      const w = host.clientWidth;
      const h = host.clientHeight;
      if (!w || !h) return false;
      backend.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      overlay.el.setAttribute('viewBox', `0 0 ${w} ${h}`);
      return true;
    };
    const ro = new ResizeObserver(() => {
      const was = sized;
      sized = size() || sized;
      // Loaded while its step was hidden: the fit was computed without an aspect, so place again.
      if (sized && !was) preset('dreiviertel', 0);
      invalidate();
    });
    ro.observe(host);
    const io = new IntersectionObserver(([e]) => {
      visible = !!e?.isIntersecting;
      if (visible) invalidate();
    });
    io.observe(host);
    cleanup.push(
      () => ro.disconnect(),
      () => io.disconnect(),
    );

    const refit = () => {
      boxOf(build);
      camera.updateMatrixWorld();
      if (needsRefit(box, camera)) place(dir.subVectors(camera.position, controls.target).normalize(), ms());
    };

    const oben = init.controls?.querySelector<HTMLElement>('[data-view="oben"]') ?? null;
    const update = (b: Build) => {
      build = b;
      const changed = rig.apply(b);
      if (changed) shadow.update(b, strength);
      if (b.params.kind !== kind) {
        // Regal → Einbauschrank narrows to ±60° at once; a table frees the azimuth.
        kind = b.params.kind;
        azLimit = azimuthLimit(kind);
        applyAzimuth();
        if (Math.abs(spherical().az) > azLimit) rotate(0);
      }
      textures.request(b.params.species, b.params.finish);
      if (init.note) init.note.hidden = b.params.species !== 'kernbuche';
      if (oben) oben.hidden = b.params.kind !== 'esstisch';
      clearTimeout(labelTimer);
      labelTimer = window.setTimeout(() => canvas.setAttribute('aria-label', label(b)), LABEL_DELAY);
      if (changed) {
        clearTimeout(refitTimer);
        refitTimer = window.setTimeout(refit, REFIT_DELAY);
      }
      invalidate();
    };

    const view = (p: ViewPreset) => preset(p, ms());
    const rotate = (steps: number) => {
      const s = spherical();
      boxOf(build).getCenter(centre);
      directionOf(clampAz(s.az + steps * STEP), s.el, dir);
      tween.to(pos.copy(centre).addScaledVector(dir, s.r), centre, ms());
      invalidate();
    };
    const zoom = (factor: number) => {
      const s = spherical();
      const r = Math.max(controls.minDistance, Math.min(controls.maxDistance, s.r * factor));
      tween.to(pos.copy(controls.target).addScaledVector(dir.normalize(), r), controls.target, ms());
      invalidate();
    };
    const reset = () => view('dreiviertel');

    init.controls?.addEventListener(
      'click',
      (e) => {
        const b = (e.target as Element).closest<HTMLElement>('button');
        if (!b) return;
        const v = b.dataset['view'];
        if (v) view(v as ViewPreset);
        else if (b.dataset['rotate']) rotate(Number(b.dataset['rotate']));
        else if (b.dataset['zoom']) zoom(Number(b.dataset['zoom']) > 0 ? ZOOM_IN : ZOOM_OUT);
        else if (b.dataset['action'] === 'reset-view') reset();
      },
      { signal },
    );

    // Swatch hover/focus warms the texture cache of that species.
    const form = host.closest('form');
    const swatch = (e: Event) => {
      const input = (e.target as Element)
        .closest('label')
        ?.querySelector<HTMLInputElement>('input[name="moebel_holz"]');
      if (input) textures.prefetch(input.value as Species);
    };
    form?.addEventListener('pointerover', swatch, { signal, passive: true });
    form?.addEventListener('focusin', swatch, { signal });

    canvas.addEventListener('webglcontextlost', () => init.onLost(), { signal });

    // First frame: 3/4 view, no tween, rendered now.
    sized = size();
    update(build);
    preset('dreiviertel', 0);
    frame(performance.now());

    return {
      update,
      view,
      rotate,
      zoom,
      reset,
      snapshot() {
        const savedPos = camera.position.clone();
        const savedTarget = controls.target.clone();
        const paper = getComputedStyle(host.parentElement ?? host).backgroundColor;
        const render = () => {
          inFrame = true;
          controls.update();
          backend.render(scene, camera);
          inFrame = false;
        };
        return takeSnapshot({
          backend,
          canvas,
          paper,
          present() {
            boxOf(build).getCenter(centre);
            const { az, el } = PRESETS.dreiviertel;
            directionOf(clampAz(az), el, dir);
            const d = fitDistance(box, pos.copy(dir).negate(), camera);
            camera.position.copy(centre).addScaledVector(dir, d);
            controls.target.copy(centre);
            render();
          },
          restore() {
            camera.position.copy(savedPos);
            controls.target.copy(savedTarget);
            render();
            invalidate();
          },
        });
      },
      dispose() {
        ac.abort();
        cancelAnimationFrame(raf);
        raf = 0;
        clearTimeout(labelTimer);
        clearTimeout(refitTimer);
        ro.disconnect();
        io.disconnect();
        controls.dispose();
        overlay.dispose();
        rig.dispose();
        shadow.dispose();
        textures.dispose();
        materials.dispose();
        disposeScene();
        backend.dispose();
        canvas.remove();
      },
    };
  } catch (e) {
    for (const f of cleanup.reverse()) f();
    backend.dispose();
    canvas.remove();
    throw e;
  }
}
