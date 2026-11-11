import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { getTerrainHeight, getRiverCenterZ, getRiverProfileY } from './terrain.js';

/**
 * Builds all dynamic 3D Water Cycle atmospheric & hydrological visualizers:
 * 1. Rising Ocean Evaporation Vapor Plumes + Adjustable Shimmering Vapor Columns
 * 2. Volumetric-style 3D Cumulus / Cumulonimbus Cloud Banks + Storm Lightning
 * 3. Prominent 3D Rain System (1,800 3D Cross-Blade Streaks + Rain Curtains + Splash Rings)
 * 4. Solid Precipitation System (Snow, Sleet, and bouncing Hail - SC.5.E.7.4)
 * 5. Toggleable 3D Animated Cycle Flow Ribbons
 */
export function createWeatherEffectsSystem(scene, textures) {
  const root = new THREE.Group();
  scene.add(root);

  const evapSystem = buildEvaporationPlumes(textures);
  const cloudSystem = buildVolumetricClouds(textures);
  const rainSystem = buildProminentRainSystem();
  const solidPrecipSystem = buildSolidPrecipitationParticles(textures);
  const flowArrows = buildCycleFlowArrows();

  root.add(
    evapSystem.group,
    cloudSystem.group,
    rainSystem.group,
    solidPrecipSystem.group,
    flowArrows.group
  );

  return {
    update(dt, elapsed, sim) {
      evapSystem.update(dt, elapsed, sim);
      cloudSystem.update(dt, elapsed, sim);
      rainSystem.update(dt, elapsed, sim);
      solidPrecipSystem.update(dt, elapsed, sim);
      flowArrows.update(dt, elapsed, sim);
    },
  };
}

/**
 * Helper to create a 2-plane crossed vertical ribbon geometry (visible from all 360° camera angles)
 */
function createCrossedBladeGeometry(width, height) {
  const p1 = new THREE.PlaneGeometry(width, height);
  const p2 = new THREE.PlaneGeometry(width, height);
  p2.rotateY(Math.PI / 2);
  return mergeGeometries([p1, p2]);
}

/**
 * 1. RISING OCEAN EVAPORATION VAPOR PLUMES + SHIMMERING RISING VAPOR WISPS
 * Scales cleanly with sim.params.evapVisibility so teachers can boost it live for students!
 */
function buildEvaporationPlumes(textures) {
  const group = new THREE.Group();

  // Layer A: Soft Volumetric Sea-Mist Veil
  const count = 260;
  const positions = new Float32Array(count * 3);
  const alphas = new Float32Array(count);
  const sizes = new Float32Array(count);
  const particleMeta = [];

  for (let i = 0; i < count; i++) {
    const startX = 19 + Math.random() * 56;
    const startZ = (Math.random() - 0.5) * 98;
    const progress = Math.random();

    particleMeta.push({
      startX,
      startZ,
      progress,
      speedOffset: 0.75 + Math.random() * 0.55,
      swirlPhase: Math.random() * Math.PI * 2,
      baseSize: 18.0 + Math.random() * 16.0,
    });

    positions[i * 3] = startX;
    positions[i * 3 + 1] = progress * 32;
    positions[i * 3 + 2] = startZ;
    alphas[i] = 0.08;
    sizes[i] = 24.0;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1));
  geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));

  const uniforms = {
    uTex: { value: textures.cloudPuffTex },
    uTint: { value: new THREE.Color(0xfff8eb) },
  };

  const mat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    vertexShader: `
      attribute float aAlpha;
      attribute float aSize;
      varying float vAlpha;
      void main() {
        vAlpha = aAlpha;
        vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aSize * (320.0 / max(10.0, -mvPos.z));
        gl_Position = projectionMatrix * mvPos;
      }
    `,
    fragmentShader: `
      uniform sampler2D uTex;
      uniform vec3 uTint;
      varying float vAlpha;
      void main() {
        vec4 c = texture2D(uTex, gl_PointCoord);
        if (c.a < 0.02) discard;
        gl_FragColor = vec4(uTint * c.rgb, c.a * vAlpha);
      }
    `,
  });

  const points = new THREE.Points(geo, mat);
  group.add(points);

  // Layer B: 85 Warm Sunlit Curling Steam Plumes (unmistakably distinct from falling blue raindrops!)
  const wispCount = 85;
  const wispGeo = createCrossedBladeGeometry(3.8, 8.2);
  const wispUniforms = {
    uTime: { value: 0 },
    uOpacity: { value: 0.30 },
  };

  const wispMat = new THREE.ShaderMaterial({
    uniforms: wispUniforms,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.NormalBlending,
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec4 instPos = instanceMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * modelViewMatrix * instPos;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uOpacity;
      varying vec2 vUv;
      void main() {
        // Soft S-curving rising vapor/steam wave (rises upward as uTime advances!)
        float wave1 = sin(vUv.y * 7.0 - uTime * 3.4) * 0.22;
        float wave2 = cos(vUv.y * 11.5 - uTime * 4.8) * 0.08;
        float distCenter = abs((vUv.x - 0.5) + wave1 + wave2) * 2.5;
        float horizFade = pow(max(0.0, 1.0 - distCenter), 2.1);
        float vertFade = sin(clamp(vUv.y, 0.0, 1.0) * 3.14159);
        // Subtle upward-moving vapor puffs along the ribbon
        float puffBand = 0.72 + 0.28 * sin(vUv.y * 12.0 - uTime * 4.2);
        float alpha = horizFade * vertFade * puffBand * uOpacity;
        if (alpha < 0.01) discard;

        // Warm sunlit golden-ivory steam palette (matches Stage 1 amber theme!)
        vec3 baseSteam = vec3(1.0, 0.96, 0.86);
        vec3 warmGold = vec3(1.0, 0.82, 0.46);
        vec3 col = mix(warmGold, baseSteam, 0.45 + vUv.y * 0.45);
        gl_FragColor = vec4(col, clamp(alpha, 0.0, 0.78));
      }
    `,
  });

  const wispMesh = new THREE.InstancedMesh(wispGeo, wispMat, wispCount);
  const wispMeta = [];
  for (let i = 0; i < wispCount; i++) {
    wispMeta.push({
      startX: 24 + Math.random() * 50,
      startZ: (Math.random() - 0.5) * 90,
      progress: Math.random(),
      speed: 0.72 + Math.random() * 0.48,
      scaleY: 0.80 + Math.random() * 0.65,
    });
  }
  group.add(wispMesh);

  const dummy = new THREE.Object3D();

  return {
    group,
    update(dt, elapsed, sim) {
      const evap = sim.evaporationNorm;
      const evapVis = (sim.params.evapVisibility ?? 100) / 100; // 0.25 .. 2.5
      const wind01 = sim.params.windSpeed / 45;
      const sun01 = sim.params.sunlight / 100;
      const activeDt = sim.params.timeScale === 0 ? 0 : dt * sim.params.timeScale;

      uniforms.uTint.value.setRGB(
        1.0,
        0.93 + sun01 * 0.05,
        0.78 + (1.0 - sun01) * 0.16
      );

      const posArr = geo.attributes.position.array;
      const alphaArr = geo.attributes.aAlpha.array;
      const sizeArr = geo.attributes.aSize.array;

      const riseRate = 0.06 + evap * 0.24;

      for (let i = 0; i < count; i++) {
        const m = particleMeta[i];
        m.progress += activeDt * riseRate * m.speedOffset;
        if (m.progress >= 1.0) {
          m.progress -= 1.0;
          m.startX = 21 + Math.random() * 54;
          m.startZ = (Math.random() - 0.5) * 96;
        }

        const p = m.progress;
        const driftInland = Math.pow(p, 1.25) * (8 + wind01 * 54);
        const swirl = Math.sin(elapsed * 0.9 + m.swirlPhase + p * 4.0) * 2.4;

        posArr[i * 3] = m.startX - driftInland;
        posArr[i * 3 + 1] = 0.6 + p * 34.0;
        posArr[i * 3 + 2] = m.startZ + swirl;

        const envelope = Math.sin(p * Math.PI);
        const activeMask = i / count <= Math.min(1.0, (0.25 + evap * 0.75) * Math.max(0.6, evapVis)) ? 1.0 : 0.0;
        alphaArr[i] = Math.min(0.52, envelope * (0.04 + evap * 0.13) * evapVis * activeMask);
        sizeArr[i] = m.baseSize * (0.80 + p * 1.18) * (0.85 + evapVis * 0.22);
      }

      geo.attributes.position.needsUpdate = true;
      geo.attributes.aAlpha.needsUpdate = true;
      geo.attributes.aSize.needsUpdate = true;

      // Update Rising Warm Steam Wisps
      wispUniforms.uTime.value = elapsed;
      wispUniforms.uOpacity.value = Math.min(0.75, (0.11 + evap * 0.24) * evapVis);

      const tiltAngle = 0.08 + wind01 * 0.42;
      const activeWisps = Math.min(wispCount, Math.floor(wispCount * Math.min(1.0, (0.28 + evap * 0.72) * evapVis)));

      for (let i = 0; i < wispCount; i++) {
        const w = wispMeta[i];
        w.progress += activeDt * riseRate * 1.18 * w.speed;
        if (w.progress >= 1.0) {
          w.progress -= 1.0;
          w.startX = 24 + Math.random() * 50;
          w.startZ = (Math.random() - 0.5) * 90;
        }
        if (i >= activeWisps) {
          dummy.scale.set(0, 0, 0);
          dummy.updateMatrix();
          wispMesh.setMatrixAt(i, dummy.matrix);
          continue;
        }
        const p = w.progress;
        const drift = Math.pow(p, 1.2) * (7 + wind01 * 46);
        dummy.position.set(w.startX - drift, 2.4 + p * 28.5, w.startZ);
        dummy.rotation.set(0, (i % 6) * 0.52, tiltAngle * p);
        const fadeScale = Math.sin(p * Math.PI);
        dummy.scale.set(
          (0.75 + evapVis * 0.32) * (0.65 + fadeScale * 0.55),
          w.scaleY * (0.75 + evapVis * 0.30) * (0.55 + fadeScale * 0.75),
          0.75 + evapVis * 0.32
        );
        dummy.updateMatrix();
        wispMesh.setMatrixAt(i, dummy.matrix);
      }
      wispMesh.instanceMatrix.needsUpdate = true;
    },
  };
}

/**
 * 2. VOLUMETRIC-STYLE 3D CLOUD BANKS (Orographic Condensation + Cumulonimbus Anvil + Lightning)
 */
function buildVolumetricClouds(textures) {
  const group = new THREE.Group();

  const clusterDefs = [
    { x: -50, y: 39.5, z: -18, threshold: 0.05, scale: 1.35, anvil: true },
    { x: -42, y: 38.0, z: -2, threshold: 0.08, scale: 1.45, anvil: true },
    { x: -48, y: 38.8, z: 18, threshold: 0.14, scale: 1.30, anvil: true },
    { x: -30, y: 37.2, z: -12, threshold: 0.20, scale: 1.25, anvil: true },
    { x: -28, y: 36.8, z: 10, threshold: 0.26, scale: 1.22, anvil: false },
    { x: -16, y: 36.2, z: -24, threshold: 0.35, scale: 1.12, anvil: false },
    { x: -14, y: 35.8, z: 2, threshold: 0.42, scale: 1.18, anvil: false },
    { x: -18, y: 36.0, z: 24, threshold: 0.50, scale: 1.08, anvil: false },
    { x: -2, y: 35.2, z: -10, threshold: 0.60, scale: 1.02, anvil: false },
    { x: 2, y: 35.0, z: 14, threshold: 0.70, scale: 0.96, anvil: false },
    { x: 14, y: 34.5, z: -2, threshold: 0.80, scale: 0.90, anvil: false },
  ];

  const puffs = [];

  clusterDefs.forEach((c, cIdx) => {
    const puffCount = 15;
    for (let p = 0; p < puffCount; p++) {
      const isTop = p >= 9;
      const angle = (p / puffCount) * Math.PI * 2 + cIdx * 1.3;
      const rad = isTop ? (p - 8) * 1.9 : 2.5 + (p % 5) * 2.4;
      const ox = Math.cos(angle) * rad * c.scale;
      const oz = Math.sin(angle) * rad * 0.85 * c.scale;
      const oy = isTop ? 2.6 + (p - 9) * 1.15 : ((p % 3) - 1) * 1.1;

      const mat = new THREE.SpriteMaterial({
        map: textures.cloudPuffTex,
        transparent: true,
        opacity: 0.75,
        depthWrite: false,
      });

      const sprite = new THREE.Sprite(mat);
      const baseSize = (isTop ? 13.5 : 16.5) * c.scale * (0.85 + (p % 4) * 0.1);
      sprite.position.set(c.x + ox, c.y + oy, c.z + oz);
      sprite.scale.set(baseSize * 1.25, baseSize * 0.82, 1);

      puffs.push({
        sprite,
        mat,
        baseX: c.x + ox,
        baseY: c.y + oy,
        baseZ: c.z + oz,
        baseSize,
        isTop,
        anvilCapable: c.anvil,
        threshold: c.threshold,
        driftPhase: cIdx * 0.9 + p * 0.4,
      });
      group.add(sprite);
    }
  });

  const lightningLight = new THREE.PointLight(0xdbeafe, 0, 140, 1.5);
  lightningLight.position.set(-36, 35, -2);
  group.add(lightningLight);

  let flashTimer = 2.5;
  let flashIntensity = 0;

  const topBright = new THREE.Color(0xffffff);
  const topStorm = new THREE.Color(0x9aa9bc);
  const bottomFair = new THREE.Color(0xdce6f2);
  const bottomStorm = new THREE.Color(0x394554);

  return {
    group,
    update(dt, elapsed, sim) {
      const cloud01 = sim.metrics.cloudCoverPercent / 100;
      const sun01 = sim.params.sunlight / 100;
      const wind01 = sim.params.windSpeed / 45;
      const updrafts = sim.params.stormUpdrafts;

      const darkness = Math.max(0, (cloud01 - 0.35) / 0.65) * (updrafts ? 1.15 : 0.92);
      const sunDim = 0.48 + sun01 * 0.52;

      if ((updrafts || cloud01 > 0.78) && sim.params.timeScale > 0) {
        flashTimer -= dt * sim.params.timeScale;
        if (flashTimer <= 0) {
          flashIntensity = 1.0;
          flashTimer = updrafts ? 1.8 + Math.random() * 2.8 : 3.5 + Math.random() * 4.5;
          lightningLight.position.set(
            -46 + Math.random() * 28,
            34 + Math.random() * 5,
            -16 + Math.random() * 32
          );
        }
      }
      flashIntensity = Math.max(0, flashIntensity - dt * 6.5);
      lightningLight.intensity = flashIntensity * 38;

      for (const p of puffs) {
        const presence = THREE.MathUtils.smoothstep(cloud01, p.threshold - 0.12, p.threshold + 0.18);
        if (presence <= 0.01) {
          p.sprite.visible = false;
          continue;
        }
        p.sprite.visible = true;

        const driftX = Math.sin(elapsed * (0.25 + wind01 * 0.45) + p.driftPhase) * 1.8;
        const anvilBoost = p.anvilCapable && p.isTop && updrafts ? 5.5 : 0;

        p.sprite.position.x = p.baseX + driftX;
        p.sprite.position.y = p.baseY + anvilBoost * presence;

        const swell = 0.55 + presence * 0.62 + (updrafts && p.anvilCapable ? 0.18 : 0);
        p.sprite.scale.set(p.baseSize * 1.28 * swell, p.baseSize * 0.84 * swell, 1);

        const col = p.isTop
          ? topBright.clone().lerp(topStorm, Math.min(1, darkness * 0.75))
          : bottomFair.clone().lerp(bottomStorm, Math.min(1, darkness));

        col.multiplyScalar(sunDim);
        if (flashIntensity > 0.05 && p.anvilCapable) {
          col.lerp(new THREE.Color(0xeef6ff), flashIntensity * 0.65);
        }

        p.mat.color.copy(col);
        p.mat.opacity = Math.min(0.92, presence * (0.52 + cloud01 * 0.40));
      }
    },
  };
}

/**
 * 3. PROMINENT CLASSROOM-VISIBLE 3D RAIN SYSTEM
 * - 1,800 3D Cross-Blade Slanted Raindrop Streaks (true 3D world-space thickness & length!)
 * - 8 Volumetric Rain-Shaft Curtains beneath the clouds
 * - 200 Animated Expanding Raindrop Splash Rings on lake, river, and mountain slopes
 * Scales dynamically with both weather precipitation AND sim.params.rainVisibility!
 */
function buildProminentRainSystem() {
  const group = new THREE.Group();

  // Layer A: 1,650 3D Crossed-Blade Rain Streaks
  const streakCount = 1650;
  const streakGeo = createCrossedBladeGeometry(0.17, 3.6);

  const streakUniforms = {
    uOpacity: { value: 0.82 },
    uBrightness: { value: 1.0 },
  };

  const streakMat = new THREE.ShaderMaterial({
    uniforms: streakUniforms,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec4 instPos = instanceMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * modelViewMatrix * instPos;
      }
    `,
    fragmentShader: `
      uniform float uOpacity;
      uniform float uBrightness;
      varying vec2 vUv;
      void main() {
        // Sharp teardrop bright bottom (vUv.y = 0) tapering to luminous sky-blue upper tail (vUv.y = 1)
        float center = 1.0 - abs(vUv.x - 0.5) * 2.0;
        center = pow(clamp(center, 0.0, 1.0), 1.45);
        float tip = smoothstep(1.0, 0.10, vUv.y) * smoothstep(0.0, 0.07, vUv.y);
        float headGlow = (1.0 - smoothstep(0.0, 0.32, vUv.y)) * 0.58;
        float alpha = center * tip * uOpacity;
        if (alpha < 0.02) discard;

        vec3 tailCol = vec3(0.32, 0.76, 1.0);
        vec3 headCol = vec3(0.94, 0.99, 1.0);
        vec3 col = mix(tailCol, headCol, clamp(headGlow + (1.0 - vUv.y) * 0.48, 0.0, 1.0)) * uBrightness;
        gl_FragColor = vec4(col, clamp(alpha, 0.0, 0.98));
      }
    `,
  });

  const streakMesh = new THREE.InstancedMesh(streakGeo, streakMat, streakCount);
  streakMesh.renderOrder = 5;

  const streakMeta = [];
  for (let i = 0; i < streakCount; i++) {
    const sx = -60 + Math.random() * 66; // Strictly under mountain & valley clouds (-60 to +6)
    const sz = (Math.random() - 0.5) * 84;
    const minGround = Math.max(0.5, getTerrainHeight(sx, sz) + 1.0);
    streakMeta.push({
      x: sx,
      y: minGround + Math.random() * Math.max(4.0, 35.5 - minGround),
      z: sz,
      speed: 38 + Math.random() * 16,
      lenScale: 0.78 + Math.random() * 0.62,
    });
  }
  group.add(streakMesh);

  // Layer B: Volumetric Rain-Shaft Curtains descending from Cloud Banks
  const curtainDefs = [
    { x: -46, z: -12, w: 26, h: 28, threshold: 0.08 },
    { x: -40, z: 4, w: 28, h: 28, threshold: 0.12 },
    { x: -46, z: 18, w: 24, h: 26, threshold: 0.18 },
    { x: -28, z: -6, w: 26, h: 30, threshold: 0.24 },
    { x: -26, z: 12, w: 25, h: 30, threshold: 0.30 },
    { x: -14, z: -4, w: 24, h: 33, threshold: 0.42 },
    { x: -14, z: 18, w: 22, h: 33, threshold: 0.52 },
    { x: -2, z: 4, w: 20, h: 34, threshold: 0.64 },
  ];

  const curtainUniforms = {
    uTime: { value: 0 },
    uWindTilt: { value: 0.15 },
    uStrength: { value: 0.5 },
  };

  const curtainMat = new THREE.ShaderMaterial({
    uniforms: curtainUniforms,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uWindTilt;
      uniform float uStrength;
      varying vec2 vUv;

      float rHash(float n) {
        return fract(sin(n) * 43758.5453123);
      }

      void main() {
        // Animated falling vertical rain-sheet bands inside soft atmospheric downpour shaft
        float slantedX = vUv.x + (1.0 - vUv.y) * uWindTilt;
        float colIdx = floor(slantedX * 28.0);
        float speed = 2.4 + rHash(colIdx) * 1.6;
        float streak = sin((vUv.y + uTime * speed + rHash(colIdx + 9.1)) * 18.0) * 0.5 + 0.5;
        float fineLines = pow(streak, 2.2) * (0.45 + 0.55 * rHash(colIdx * 3.7));

        float horizSoft = sin(clamp(vUv.x, 0.0, 1.0) * 3.14159);
        float vertSoft = smoothstep(0.0, 0.20, vUv.y) * smoothstep(1.0, 0.78, vUv.y);
        float alpha = horizSoft * vertSoft * (0.11 + fineLines * 0.24) * uStrength;
        if (alpha < 0.008) discard;

        vec3 rainShaftCol = vec3(0.64, 0.86, 1.0);
        gl_FragColor = vec4(rainShaftCol, clamp(alpha, 0.0, 0.56));
      }
    `,
  });

  const curtains = curtainDefs.map((cd, idx) => {
    const cGeo = createCrossedBladeGeometry(cd.w, cd.h);
    const mesh = new THREE.Mesh(cGeo, curtainMat);
    mesh.position.set(cd.x, 35.5 - cd.h * 0.45, cd.z);
    mesh.rotation.y = idx * 0.45;
    mesh.renderOrder = 1;
    group.add(mesh);
    return { mesh, ...cd };
  });

  // Layer C: 200 Expanding Raindrop Ground & Water Splash Rings
  const splashCount = 200;
  const splashGeo = new THREE.RingGeometry(0.18, 0.48, 16);
  splashGeo.rotateX(-Math.PI / 2);
  const splashMat = new THREE.MeshBasicMaterial({
    color: 0xdcf4ff,
    transparent: true,
    opacity: 0.65,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const splashMesh = new THREE.InstancedMesh(splashGeo, splashMat, splashCount);
  splashMesh.renderOrder = 4;

  const splashMeta = [];
  for (let i = 0; i < splashCount; i++) {
    const sx = -58 + Math.random() * 64;
    const sz = (Math.random() - 0.5) * 82;
    splashMeta.push({
      x: sx,
      z: sz,
      y: Math.max(0.08, getTerrainHeight(sx, sz) + 0.16),
      phase: Math.random(),
      speed: 1.6 + Math.random() * 1.4,
    });
  }
  group.add(splashMesh);

  const dummy = new THREE.Object3D();
  dummy.rotation.order = 'ZYX';

  return {
    group,
    update(dt, elapsed, sim) {
      const pType = sim.metrics.precipitationType;
      const pNorm = sim.precipNorm;
      if (pType !== 'Rain' || pNorm < 0.03) {
        group.visible = false;
        return;
      }
      group.visible = true;

      const rainVis = (sim.params.rainVisibility ?? 100) / 100; // 0.25 .. 2.5
      const wind01 = sim.params.windSpeed / 45;
      const activeDt = sim.params.timeScale === 0 ? 0 : dt * sim.params.timeScale;
      const cloud01 = sim.metrics.cloudCoverPercent / 100;
      const cloudSpanMaxX = Math.min(9.0, -14 + cloud01 * 24);

      // 1. Update 3D Rain Streaks (cohesive wind-slanted angle across all drops!)
      const activeRatio = Math.min(1.0, (0.34 + pNorm * 0.66) * Math.min(1.35, 0.55 + rainVis * 0.55));
      const activeStreaks = Math.floor(streakCount * activeRatio);
      const tiltZ = -(0.07 + wind01 * 0.28);

      streakUniforms.uOpacity.value = Math.min(0.98, (0.52 + pNorm * 0.36) * Math.min(1.5, 0.45 + rainVis * 0.65));
      streakUniforms.uBrightness.value = 0.95 + Math.max(0, rainVis - 1.0) * 0.35;

      const widthBoost = 0.85 + rainVis * 0.45;
      const lenBoost = 0.85 + rainVis * 0.38;

      for (let i = 0; i < streakCount; i++) {
        if (i >= activeStreaks) {
          dummy.scale.set(0, 0, 0);
          dummy.updateMatrix();
          streakMesh.setMatrixAt(i, dummy.matrix);
          continue;
        }

        const m = streakMeta[i];
        if (activeDt > 0) {
          m.y -= m.speed * (0.85 + pNorm * 0.35) * activeDt;
          m.x -= wind01 * 12.5 * activeDt;

          const groundY = Math.max(0, getTerrainHeight(m.x, m.z));
          if (m.y <= groundY + 0.8 || m.x > cloudSpanMaxX + 2.0) {
            m.x = -60 + Math.random() * (cloudSpanMaxX - -60);
            m.z = (Math.random() - 0.5) * 84;
            m.y = 33.5 + Math.random() * 5.0;
          }
        }

        dummy.position.set(m.x, m.y, m.z);
        dummy.rotation.set(0, (i % 5) * 0.62, tiltZ);
        dummy.scale.set(widthBoost, m.lenScale * lenBoost, widthBoost);
        dummy.updateMatrix();
        streakMesh.setMatrixAt(i, dummy.matrix);
      }
      streakMesh.instanceMatrix.needsUpdate = true;

      // 2. Update Volumetric Downpour Curtains
      if (activeDt > 0) {
        curtainUniforms.uTime.value += activeDt;
      }
      curtainUniforms.uWindTilt.value = wind01 * 0.28;
      curtainUniforms.uStrength.value = (0.35 + pNorm * 0.75) * rainVis;

      for (const c of curtains) {
        c.mesh.visible = cloud01 >= c.threshold;
      }

      // 3. Update Expanding Splash Rings
      const activeSplashes = Math.floor(splashCount * activeRatio);
      splashMat.opacity = Math.min(0.88, (0.35 + pNorm * 0.38) * Math.min(1.5, rainVis));

      for (let i = 0; i < splashCount; i++) {
        if (i >= activeSplashes) {
          dummy.scale.set(0, 0, 0);
          dummy.updateMatrix();
          splashMesh.setMatrixAt(i, dummy.matrix);
          continue;
        }
        const s = splashMeta[i];
        if (activeDt > 0) {
          s.phase += activeDt * s.speed;
          if (s.phase >= 1.0) {
            s.phase -= 1.0;
            s.x = -58 + Math.random() * (cloudSpanMaxX - -58);
            s.z = (Math.random() - 0.5) * 82;
            s.y = Math.max(0.08, getTerrainHeight(s.x, s.z) + 0.18);
          }
        }
        const sc = (0.4 + s.phase * 2.2) * (0.8 + rainVis * 0.35) * (1.0 - s.phase * 0.35);
        dummy.position.set(s.x, s.y, s.z);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(sc, 1, sc);
        dummy.updateMatrix();
        splashMesh.setMatrixAt(i, dummy.matrix);
      }
      splashMesh.instanceMatrix.needsUpdate = true;
    },
  };
}

/**
 * 4. SOLID PRECIPITATION SYSTEM: Snow, Sleet, and bouncing Hail (SC.5.E.7.4)
 */
function buildSolidPrecipitationParticles(textures) {
  const group = new THREE.Group();
  const maxParticles = 2000;

  const positions = new Float32Array(maxParticles * 3);
  const sizes = new Float32Array(maxParticles);
  const alphas = new Float32Array(maxParticles);
  const meta = [];

  for (let i = 0; i < maxParticles; i++) {
    const x = -64 + Math.random() * 82;
    const z = (Math.random() - 0.5) * 98;
    const y = Math.random() * 36;
    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;
    sizes[i] = 2.0;
    alphas[i] = 0.0;

    meta.push({
      vy: 24 + Math.random() * 10,
      phase: Math.random() * Math.PI * 2,
      bounced: false,
    });
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  geo.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1));

  const uniforms = {
    uTex: { value: textures.snowTex },
    uStretchY: { value: 1.0 },
    uWindTilt: { value: 0.15 },
    uColor: { value: new THREE.Color(0xffffff) },
  };

  const mat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    vertexShader: `
      attribute float aSize;
      attribute float aAlpha;
      varying float vAlpha;
      void main() {
        vAlpha = aAlpha;
        vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aSize * (260.0 / max(8.0, -mvPos.z));
        gl_Position = projectionMatrix * mvPos;
      }
    `,
    fragmentShader: `
      uniform sampler2D uTex;
      uniform float uStretchY;
      uniform float uWindTilt;
      uniform vec3 uColor;
      varying float vAlpha;
      void main() {
        if (vAlpha <= 0.01) discard;
        vec2 uv = gl_PointCoord - 0.5;
        float c = cos(uWindTilt);
        float s = sin(uWindTilt);
        vec2 ruv = vec2(uv.x * c - uv.y * s, uv.x * s + uv.y * c);
        ruv.x *= uStretchY;
        vec2 sampleUv = ruv + 0.5;
        if (sampleUv.x < 0.0 || sampleUv.x > 1.0 || sampleUv.y < 0.0 || sampleUv.y > 1.0) discard;
        vec4 texCol = texture2D(uTex, sampleUv);
        if (texCol.a < 0.04) discard;
        gl_FragColor = vec4(uColor * texCol.rgb, texCol.a * vAlpha);
      }
    `,
  });

  const points = new THREE.Points(geo, mat);
  group.add(points);

  return {
    group,
    update(dt, elapsed, sim) {
      const pType = sim.metrics.precipitationType;
      const pNorm = sim.precipNorm;
      const wind01 = sim.params.windSpeed / 45;
      const activeDt = sim.params.timeScale === 0 ? 0 : dt * sim.params.timeScale;

      if (pType === 'None' || pType === 'Rain' || pNorm < 0.04) {
        points.visible = false;
        return;
      }
      points.visible = true;

      const visBoost = Math.max(0.5, Math.min(1.8, (sim.params.rainVisibility ?? 100) / 100));
      let fallSpeed = 28;
      let baseSize = 2.5;
      let activeRatio = Math.min(1.0, pNorm * 1.15 * visBoost);

      if (pType === 'Snow') {
        uniforms.uTex.value = textures.snowTex;
        uniforms.uStretchY.value = 1.0;
        uniforms.uWindTilt.value = elapsed * 0.4;
        uniforms.uColor.value.setHex(0xffffff);
        fallSpeed = 7.5 + wind01 * 3.0;
        baseSize = 2.5 * Math.min(1.35, 0.8 + visBoost * 0.2);
      } else if (pType === 'Sleet') {
        uniforms.uTex.value = textures.iceTex;
        uniforms.uStretchY.value = 1.65;
        uniforms.uWindTilt.value = -wind01 * 0.28;
        uniforms.uColor.value.setHex(0xe0f4ff);
        fallSpeed = 29;
        baseSize = 2.1 * Math.min(1.4, 0.8 + visBoost * 0.25);
      } else if (pType === 'Hail') {
        uniforms.uTex.value = textures.iceTex;
        uniforms.uStretchY.value = 1.0;
        uniforms.uWindTilt.value = 0.0;
        uniforms.uColor.value.setHex(0xf4fbff);
        fallSpeed = 44;
        baseSize = 2.85 * Math.min(1.35, 0.85 + visBoost * 0.18);
        activeRatio = Math.min(0.82, pNorm * 0.92 * visBoost);
      }

      const activeCount = Math.floor(maxParticles * activeRatio);
      const posArr = geo.attributes.position.array;
      const sizeArr = geo.attributes.aSize.array;
      const alphaArr = geo.attributes.aAlpha.array;

      const cloudSpanMaxX = -10 + (sim.metrics.cloudCoverPercent / 100) * 32;

      for (let i = 0; i < maxParticles; i++) {
        if (i >= activeCount) {
          alphaArr[i] = 0;
          continue;
        }

        const m = meta[i];
        let x = posArr[i * 3];
        let y = posArr[i * 3 + 1];
        let z = posArr[i * 3 + 2];

        if (activeDt > 0) {
          if (m.bounced) {
            y += m.vy * activeDt;
            m.vy -= 42 * activeDt;
            x += (m.bounceVx || 2) * activeDt;
          } else {
            y -= fallSpeed * (0.85 + (i % 5) * 0.07) * activeDt;
            x -= wind01 * (pType === 'Snow' ? 9.5 : 12.0) * activeDt;
            if (pType === 'Snow') {
              x += Math.sin(elapsed * 2.1 + m.phase) * 2.6 * activeDt;
              z += Math.cos(elapsed * 1.7 + m.phase) * 2.6 * activeDt;
            }
          }

          const groundY = Math.max(0, getTerrainHeight(x, z));
          if (y <= groundY + 0.35) {
            if (pType === 'Hail' && !m.bounced && groundY > 0.5 && Math.random() < 0.65) {
              m.bounced = true;
              y = groundY + 0.4;
              m.vy = 6 + Math.random() * 6;
              m.bounceVx = (Math.random() - 0.5) * 8;
            } else {
              m.bounced = false;
              x = -62 + Math.random() * (cloudSpanMaxX - -62);
              z = (Math.random() - 0.5) * 94;
              y = 33.5 + Math.random() * 4.5;
            }
          }
        }

        posArr[i * 3] = x;
        posArr[i * 3 + 1] = y;
        posArr[i * 3 + 2] = z;
        sizeArr[i] = baseSize * (0.82 + (i % 4) * 0.14);
        alphaArr[i] = 0.90;
      }

      geo.attributes.position.needsUpdate = true;
      geo.attributes.aSize.needsUpdate = true;
      geo.attributes.aAlpha.needsUpdate = true;
    },
  };
}

/**
 * 5. TOGGLEABLE 3D WATER CYCLE DIRECTIONAL FLOW RIBBONS
 */
function buildCycleFlowArrows() {
  const group = new THREE.Group();

  function makeFlowRibbon(points, colorHex, radius = 0.44) {
    const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
    const tubeGeo = new THREE.TubeGeometry(curve, 64, radius, 10, false);

    const uniforms = {
      uColor: { value: new THREE.Color(colorHex) },
      uPulse: { value: 0 },
      uStrength: { value: 0.8 },
    };

    const mat = new THREE.ShaderMaterial({
      uniforms,
      transparent: true,
      depthWrite: false,
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uColor;
        uniform float uPulse;
        uniform float uStrength;
        varying vec2 vUv;
        void main() {
          float wave = fract(vUv.x * 3.0 - uPulse);
          float head = smoothstep(0.50, 0.96, wave) * (1.0 - smoothstep(0.96, 1.0, wave));
          float baseLine = 0.22;
          float endFade = sin(clamp(vUv.x, 0.0, 1.0) * 3.14159);
          float alpha = (baseLine + head * 0.78) * endFade * uStrength;
          vec3 col = mix(uColor, vec3(1.0), head * 0.5);
          gl_FragColor = vec4(col, clamp(alpha, 0.0, 0.95));
        }
      `,
    });

    const mesh = new THREE.Mesh(tubeGeo, mat);

    const tipPos = curve.getPoint(0.90);
    const tipTan = curve.getTangent(0.90).normalize();
    const coneGeo = new THREE.ConeGeometry(radius * 2.9, radius * 6.4, 12);
    const coneMat = new THREE.MeshBasicMaterial({
      color: colorHex,
      transparent: true,
      opacity: 0.82,
      depthWrite: false,
    });
    const cone = new THREE.Mesh(coneGeo, coneMat);
    cone.position.copy(tipPos);
    cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tipTan);

    group.add(mesh, cone);
    return { uniforms, coneMat };
  }

  const evap1 = makeFlowRibbon(
    [
      [48, 2.0, 14],
      [46, 12.0, 12],
      [41, 22.5, 9],
      [33, 31.0, 5],
    ],
    0xf59e0b,
    0.45
  );
  const evap2 = makeFlowRibbon(
    [
      [56, 2.0, -14],
      [53, 12.5, -13],
      [47, 23.0, -10],
      [38, 31.5, -7],
    ],
    0xf59e0b,
    0.40
  );

  const cond1 = makeFlowRibbon(
    [
      [30, 32.5, 0],
      [10, 35.5, -1],
      [-12, 37.5, -2],
      [-34, 38.0, -3],
    ],
    0x7dd3fc,
    0.46
  );

  const prec1 = makeFlowRibbon(
    [
      [-40, 33.5, -4],
      [-40, 26.0, -4],
      [-40, 18.5, -4],
    ],
    0x38bdf8,
    0.44
  );
  const prec2 = makeFlowRibbon(
    [
      [-22, 33.0, 8],
      [-22, 24.0, 8],
      [-22, 14.5, 8],
    ],
    0x38bdf8,
    0.40
  );

  const runPts = [];
  for (let x = -32; x <= 22; x += 9) {
    const z = getRiverCenterZ(x);
    const y = getRiverProfileY(x) + 3.2;
    runPts.push([x, y, z]);
  }
  const run1 = makeFlowRibbon(runPts, 0x2dd4bf, 0.48);

  let pulseEvap = 0;
  let pulseCond = 0;
  let pulsePrec = 0;
  let pulseRun = 0;

  return {
    group,
    update(dt, elapsed, sim) {
      group.visible = sim.params.showFlowArrows;
      if (!group.visible) return;

      const ts = sim.params.timeScale === 0 ? 0 : sim.params.timeScale;
      const evapVis = Math.min(1.5, (sim.params.evapVisibility ?? 100) / 100);
      const rainVis = Math.min(1.5, (sim.params.rainVisibility ?? 100) / 100);
      const runVis = Math.min(1.5, (sim.params.runoffVisibility ?? 100) / 100);

      pulseEvap += dt * ts * (0.35 + sim.evaporationNorm * 0.95);
      pulseCond += dt * ts * (0.30 + (sim.params.windSpeed / 45) * 0.95);
      pulsePrec += dt * ts * (0.45 + sim.precipNorm * 1.1);
      pulseRun += dt * ts * (0.40 + sim.runoffNorm * 1.05);

      const evapStr = Math.min(1.25, (0.30 + sim.evaporationNorm * 0.70) * evapVis);
      evap1.uniforms.uPulse.value = pulseEvap;
      evap2.uniforms.uPulse.value = pulseEvap + 0.4;
      evap1.uniforms.uStrength.value = evapStr;
      evap2.uniforms.uStrength.value = evapStr;
      evap1.coneMat.opacity = Math.min(0.95, evapStr * 0.85);
      evap2.coneMat.opacity = Math.min(0.95, evapStr * 0.85);

      const condStr = 0.35 + (sim.metrics.cloudCoverPercent / 100) * 0.65;
      cond1.uniforms.uPulse.value = pulseCond;
      cond1.uniforms.uStrength.value = condStr;
      cond1.coneMat.opacity = condStr * 0.85;

      const precStr =
        sim.metrics.precipitationType === 'None'
          ? 0.14
          : Math.min(1.25, (0.40 + sim.precipNorm * 0.60) * rainVis);
      prec1.uniforms.uPulse.value = pulsePrec;
      prec2.uniforms.uPulse.value = pulsePrec + 0.5;
      prec1.uniforms.uStrength.value = precStr;
      prec2.uniforms.uStrength.value = precStr;
      prec1.coneMat.opacity = Math.min(0.95, precStr * 0.85);
      prec2.coneMat.opacity = Math.min(0.95, precStr * 0.85);

      const runStr = Math.min(1.25, (0.38 + sim.runoffNorm * 0.62) * runVis);
      run1.uniforms.uPulse.value = pulseRun;
      run1.uniforms.uStrength.value = runStr;
      run1.coneMat.opacity = Math.min(0.95, runStr * 0.85);
    },
  };
}
