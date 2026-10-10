// Snapshot (docs/configurator.md §4.12): the 3/4 preset rendered and copied onto a 2D canvas filled
// with the paper colour, all in the same task (preserveDrawingBuffer stays false), then the user's
// camera is restored and re-rendered. WebP at .85, PNG when the browser cannot encode WebP.
import type { Backend } from './renderer';

export interface SnapshotOpts {
  backend: Backend;
  canvas: HTMLCanvasElement;
  /** Background colour (CSS), the paper the furniture sits on. */
  paper: string;
  /** Moves the camera to the 3/4 preset and renders. */
  present(): void;
  /** Restores the user's camera and renders. */
  restore(): void;
}

export function takeSnapshot(o: SnapshotOpts): Promise<Blob | null> {
  const { width, height } = o.canvas;
  if (!width || !height) return Promise.resolve(null);
  const out = document.createElement('canvas');
  out.width = width;
  out.height = height;
  const ctx = out.getContext('2d');
  if (!ctx) return Promise.resolve(null);
  o.present();
  ctx.fillStyle = o.paper;
  ctx.fillRect(0, 0, width, height);
  o.backend.drawTo(ctx);
  o.restore();
  return new Promise((resolve) => {
    out.toBlob(
      (webp) => {
        if (webp && webp.type === 'image/webp') resolve(webp);
        else out.toBlob((png) => resolve(png), 'image/png');
      },
      'image/webp',
      0.85,
    );
  });
}
