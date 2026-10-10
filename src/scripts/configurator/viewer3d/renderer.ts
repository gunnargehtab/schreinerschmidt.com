// Renderer adapter (docs/configurator.md §4.5): the only file that touches three's renderer API
// (WebGLRenderer, PMREMGenerator). No GLSL or TSL anywhere. The probed WebGL2 context is handed
// in (§4.9), so its attributes (antialias by DPR, alpha, no preserveDrawingBuffer) are the ones
// requested there; the canvas stays transparent, so the furniture sits on the sketchbook paper.
import {
  NeutralToneMapping,
  PMREMGenerator,
  WebGLRenderer,
  type Camera,
  type Object3D,
  type Scene,
  type Texture,
} from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export interface Backend {
  /** gl.RENDERER, for the quality tier (software rasterisers). */
  rendererName: string;
  setPixelRatio(dpr: number): void;
  /** CSS size; the canvas style is left to the stylesheet. */
  setSize(w: number, h: number): void;
  render(scene: Scene, camera: Camera): void;
  /** RoomEnvironment through PMREM (§4.6); the generator and the room are disposed afterwards. */
  environment(): Texture;
  /** Pre-compiles the materials of `scene` (or of a warm-up object within `target`). */
  compile(scene: Object3D, camera: Camera, target?: Scene): Promise<void>;
  /** Uploads a texture now (while idle), so the swap later costs nothing. */
  initTexture(t: Texture): void;
  /** Draws the current frame buffer onto a 2D context (snapshot). */
  drawTo(ctx: CanvasRenderingContext2D): void;
  dispose(): void;
}

export function createBackend(canvas: HTMLCanvasElement, gl: WebGL2RenderingContext, dpr: number): Backend {
  const r = new WebGLRenderer({
    canvas,
    context: gl,
    alpha: true,
    antialias: dpr < 2,
    premultipliedAlpha: true,
    preserveDrawingBuffer: false,
    powerPreference: 'default',
  });
  r.toneMapping = NeutralToneMapping;
  r.toneMappingExposure = 1;
  r.setPixelRatio(dpr);
  r.setClearAlpha(0);
  return {
    rendererName: String(gl.getParameter(gl.RENDERER) ?? ''),
    setPixelRatio: (d) => r.setPixelRatio(d),
    setSize: (w, h) => r.setSize(w, h, false),
    render: (scene, camera) => r.render(scene, camera),
    environment() {
      const pmrem = new PMREMGenerator(r);
      const room = new RoomEnvironment();
      const tex = pmrem.fromScene(room, 0.04).texture;
      room.dispose();
      pmrem.dispose();
      return tex;
    },
    compile: (scene, camera, target) => r.compileAsync(scene, camera, target ?? null).then(() => undefined),
    initTexture: (t) => r.initTexture(t),
    drawTo: (ctx) => ctx.drawImage(r.domElement, 0, 0, ctx.canvas.width, ctx.canvas.height),
    dispose() {
      r.dispose();
      // After a real loss the extension is gone and three would only warn.
      if (!gl.isContextLost()) r.forceContextLoss();
    },
  };
}
