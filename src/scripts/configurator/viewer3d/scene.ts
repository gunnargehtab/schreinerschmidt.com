// Scene and camera (docs/configurator.md §4.6): a transparent scene lit by the RoomEnvironment
// PMREM (no lights, no shadows in Phase B) and a 30° perspective camera. The environment texture is
// disposed with the scene.
import { PerspectiveCamera, Scene } from 'three';
import type { Backend } from './renderer';

export interface SceneRig {
  scene: Scene;
  camera: PerspectiveCamera;
  dispose(): void;
}

export function createScene(backend: Backend): SceneRig {
  const scene = new Scene();
  const env = backend.environment();
  scene.environment = env;
  const camera = new PerspectiveCamera(30, 4 / 3, 0.01, 100);
  return {
    scene,
    camera,
    dispose() {
      env.dispose();
      scene.environment = null;
      scene.clear();
    },
  };
}
