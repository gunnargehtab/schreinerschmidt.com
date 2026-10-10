// Camera tween (docs/configurator.md §4.6): position and target move together over `ms` with an
// ease-out; under prefers-reduced-motion the move is a jump (ms = 0). `tick()` returns true while
// the tween is running, so the frame loop keeps requesting frames only until it settles.
import { Vector3 } from 'three';

export interface Tween {
  /** Starts a move; an unfinished tween is replaced from its current state. */
  to(pos: Vector3, target: Vector3, ms: number): void;
  tick(now: number): boolean;
  active(): boolean;
}

const easeOut = (t: number) => 1 - (1 - t) ** 3;

export function createTween(pos: Vector3, target: Vector3): Tween {
  const p0 = new Vector3();
  const t0 = new Vector3();
  const p1 = new Vector3();
  const t1 = new Vector3();
  let start = -1;
  let dur = 0;
  return {
    to(p, t, ms) {
      if (!(ms > 0)) {
        pos.copy(p);
        target.copy(t);
        start = -1;
        return;
      }
      p0.copy(pos);
      t0.copy(target);
      p1.copy(p);
      t1.copy(t);
      dur = ms;
      start = -2; // starts on the next tick
    },
    tick(now) {
      if (start === -1) return false;
      if (start === -2) start = now;
      const k = easeOut(Math.min(1, (now - start) / dur));
      pos.lerpVectors(p0, p1, k);
      target.lerpVectors(t0, t1, k);
      if (k >= 1) start = -1;
      return true;
    },
    active: () => start !== -1,
  };
}
