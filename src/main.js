import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import { WaterCycleSimulation } from './simulation/waterCycleModel.js';
import {
  createWaterNormalsTexture,
  createCloudPuffTexture,
  createPrecipitationTextures,
  createRiverFlowTexture,
} from './world/textures.js';
import { createTerrainSystem } from './world/terrain.js';
import { createWaterAndSkySystem } from './world/waterAndSky.js';
import { createWeatherEffectsSystem } from './world/weatherEffects.js';
import { createHudController } from './ui/hudController.js';

const CAMERA_PRESETS = {
  overview: {
    pos: new THREE.Vector3(6, 42, 134),
    target: new THREE.Vector3(-4, 13, -3),
  },
  evaporation: {
    pos: new THREE.Vector3(68, 22, 72),
    target: new THREE.Vector3(40, 10, 2),
  },
  condensation: {
    pos: new THREE.Vector3(16, 46, 76),
    target: new THREE.Vector3(-28, 34, -3),
  },
  precipitation: {
    pos: new THREE.Vector3(-4, 34, 68),
    target: new THREE.Vector3(-36, 20, -2),
  },
  runoff: {
    pos: new THREE.Vector3(24, 24, 58),
    target: new THREE.Vector3(-16, 8.5, 0),
  },
};

function initApp() {
  const canvas = document.getElementById('webgl-canvas');

  // 1. WebGL Renderer with ACES Filmic Tone Mapping & Soft Shadows
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.02;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  // 2. Scene & Atmospheric Perspective Fog
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x6ea8d6, 0.0016);

  // 3. Perspective Camera & Smooth Damped OrbitControls
  const camera = new THREE.PerspectiveCamera(
    44,
    window.innerWidth / window.innerHeight,
    0.5,
    6000
  );
  camera.position.copy(CAMERA_PRESETS.overview.pos);

  const controls = new OrbitControls(camera, canvas);
  controls.target.copy(CAMERA_PRESETS.overview.target);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.minDistance = 26;
  controls.maxDistance = 230;
  controls.maxPolarAngle = Math.PI * 0.495; // Keep camera comfortably above base horizon
  controls.update();

  // Camera smooth transition controller
  let camTransition = null;
  function setCameraPreset(key) {
    const preset = CAMERA_PRESETS[key] || CAMERA_PRESETS.overview;
    camTransition = {
      destPos: preset.pos.clone(),
      destTarget: preset.target.clone(),
    };
  }

  // Yield camera transition immediately when student grabs/scrolls the 3D scene
  controls.addEventListener('start', () => {
    camTransition = null;
  });

  // 4. Synthesize Procedural PBR & Weather Textures
  const waterNormalsTex = createWaterNormalsTexture(512);
  const cloudPuffTex = createCloudPuffTexture(256);
  const { rainTex, snowTex, iceTex } = createPrecipitationTextures();
  const riverFlowTex = createRiverFlowTexture(256);

  const textures = {
    waterNormalsTex,
    cloudPuffTex,
    rainTex,
    snowTex,
    iceTex,
    riverFlowTex,
  };

  // 5. Build 3D World & Florida 5th Grade Hydrological Simulation
  const sim = new WaterCycleSimulation();
  const terrainSystem = createTerrainSystem(scene);
  const waterAndSky = createWaterAndSkySystem(scene, renderer, textures);
  const weatherEffects = createWeatherEffectsSystem(scene, textures);

  const hud = createHudController({
    sim,
    camera,
    setCameraPreset,
  });

  // 6. Responsive Viewport Resize
  window.addEventListener('resize', () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  });

  // 7. Main 60fps Animation Loop
  let prevTime = performance.now();
  let elapsed = 0;

  function animate(now) {
    requestAnimationFrame(animate);
    const dt = Math.min(0.05, Math.max(0.001, (now - prevTime) / 1000));
    prevTime = now;
    elapsed += dt;

    // Step scientific simulation
    sim.step(dt);

    // Smooth camera preset glide if active
    if (camTransition) {
      const alpha = 1 - Math.exp(-dt * 4.2);
      camera.position.lerp(camTransition.destPos, alpha);
      controls.target.lerp(camTransition.destTarget, alpha);
      if (
        camera.position.distanceTo(camTransition.destPos) < 0.25 &&
        controls.target.distanceTo(camTransition.destTarget) < 0.25
      ) {
        camTransition = null;
      }
    }

    controls.update();

    // Update 3D terrain, sky, planar reflective ocean, river, clouds, vapor, and precipitation
    terrainSystem.update(elapsed, sim);
    waterAndSky.update(dt, elapsed, sim);
    weatherEffects.update(dt, elapsed, sim);

    // Render 3D scene & sync HUD
    renderer.render(scene, camera);
    hud.update();
  }

  requestAnimationFrame(animate);
}

initApp();
