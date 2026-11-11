import * as THREE from 'three';
import { getTerrainHeight, getRiverCenterZ, getRiverProfileY } from './terrain.js';

/**
 * Builds all dynamic 3D Water Cycle atmospheric & hydrological visualizers:
 * 1. Rising Ocean Evaporation Vapor Plumes (drifting inland with onshore wind)
 * 2. Volumetric-style 3D Cumulus / Cumulonimbus Cloud Banks + Storm Lightning
 * 3. Multi-Phase 3D Precipitation (Rain, Snow, Sleet, and bouncing Hail - SC.5.E.7.4)
 * 4. Toggleable 3D Animated Cycle Flow Ribbons (connecting all 4 stages visually)
 */
export function createWeatherEffectsSystem(scene, textures) {
  const root = new THREE.Group();
  scene.add(root);

  const evapSystem = buildEvaporationPlumes(textures);
  const cloudSystem = buildVolumetricClouds(textures);
  const precipSystem = buildPrecipitationParticles(textures);
  const flowArrows = buildCycleFlowArrows();

  root.add(evapSystem.group, cloudSystem.group, precipSystem.group, flowArrows.group);

  return {
    update(dt, elapsed, sim) {
      evapSystem.update(dt, elapsed, sim);
      cloudSystem.update(dt, elapsed, sim);
      precipSystem.update(dt, elapsed, sim);
      flowArrows.update(dt, elapsed, sim);
    },
  };
}

/**
 * 1. RISING OCEAN EVAPORATION VAPOR PLUMES (Liquid Ocean -> Invisible/Misty Water Vapor Gas)
 */
function buildEvaporationPlumes(textures) {
  const group = new THREE.Group();
  const count = 240;

  const positions = new Float32Array(count * 3);
  const alphas = new Float32Array(count);
  const sizes = new Float32Array(count);
  const particleMeta = [];

  for (let i = 0; i < count; i++) {
    const startX = 20 + Math.random() * 54; // Over the Ocean reservoir
    const startZ = (Math.random() - 0.5) * 96;
    const progress = Math.random();

    particleMeta.push({
      startX,
      startZ,
      progress,
      speedOffset: 0.75 + Math.random() * 0.55,
      swirlPhase: Math.random() * Math.PI * 2,
      baseSize: 19.0 + Math.random() * 17.0,
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

  return {
    group,
    update(dt, elapsed, sim) {
      const evap = sim.evaporationNorm; // 0..1
      const wind01 = sim.params.windSpeed / 45;
      const sun01 = sim.params.sunlight / 100;
      const activeDt = sim.params.timeScale === 0 ? 0 : dt * sim.params.timeScale;

      // Warm golden-white shimmer in bright sun, cool pale mist in low sun
      uniforms.uTint.value.setRGB(
        0.88 + sun01 * 0.12,
        0.94 + sun01 * 0.05,
        0.99
      );

      const posArr = geo.attributes.position.array;
      const alphaArr = geo.attributes.aAlpha.array;
      const sizeArr = geo.attributes.aSize.array;

      const riseRate = 0.05 + evap * 0.22;

      for (let i = 0; i < count; i++) {
        const m = particleMeta[i];
        m.progress += activeDt * riseRate * m.speedOffset;
        if (m.progress >= 1.0) {
          m.progress -= 1.0;
          m.startX = 19 + Math.random() * 55;
          m.startZ = (Math.random() - 0.5) * 96;
        }

        const p = m.progress;
        // Rise from ocean surface (y=0.4) up to cloud base (y=34), drifting inland (-X) with wind!
        const driftInland = Math.pow(p, 1.25) * (8 + wind01 * 56);
        const swirl = Math.sin(elapsed * 0.9 + m.swirlPhase + p * 4.0) * 2.2;

        posArr[i * 3] = m.startX - driftInland;
        posArr[i * 3 + 1] = 0.5 + p * 34.5;
        posArr[i * 3 + 2] = m.startZ + swirl;

        // Soft volumetric sea-mist veil rising smoothly into coastal air
        const envelope = Math.sin(p * Math.PI);
        const activeMask = i / count <= 0.18 + evap * 0.82 ? 1.0 : 0.0;
        alphaArr[i] = envelope * (0.015 + evap * 0.075) * activeMask;
        sizeArr[i] = m.baseSize * (0.75 + p * 1.15);
      }

      geo.attributes.position.needsUpdate = true;
      geo.attributes.aAlpha.needsUpdate = true;
      geo.attributes.aSize.needsUpdate = true;
    },
  };
}

/**
 * 2. VOLUMETRIC-STYLE 3D CLOUD BANKS (Orographic Condensation + Cumulonimbus Anvil + Lightning)
 */
function buildVolumetricClouds(textures) {
  const group = new THREE.Group();

  // Define 11 cloud clusters spanning from coastal sea-breeze cumulus (-5..+14) to mountain peaks (-60..-20)
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

  // Storm Lightning PointLight inside heavy mountain cumulonimbus clouds
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

      // Darken underbellies as moisture builds into rain/storm clouds
      const darkness = Math.max(0, (cloud01 - 0.35) / 0.65) * (updrafts ? 1.15 : 0.92);
      const sunDim = 0.48 + sun01 * 0.52;

      // Occasional dramatic lightning flash during heavy rain (>75% clouds) or Thunderstorm Hail!
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

        // Gentle wind billow & towering vertical growth during strong thunderstorm updrafts
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
 * 3. MULTI-PHASE PRECIPITATION SYSTEM: Rain (Liquid), Snow, Sleet, and bouncing Hail (Solid)
 */
function buildPrecipitationParticles(textures) {
  const group = new THREE.Group();
  const maxParticles = 2000;

  const positions = new Float32Array(maxParticles * 3);
  const sizes = new Float32Array(maxParticles);
  const alphas = new Float32Array(maxParticles);
  const meta = [];

  for (let i = 0; i < maxParticles; i++) {
    // Concentrate precipitation beneath the mountain & coastal valley clouds (-64 to +16)
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
    uTex: { value: textures.rainTex },
    uStretchY: { value: 2.6 },
    uWindTilt: { value: 0.15 },
    uColor: { value: new THREE.Color(0xd8f0ff) },
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
        // Apply wind tilt rotation for realistic slanted rain/sleet streaks
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

      if (pType === 'None' || pNorm < 0.04) {
        points.visible = false;
        return;
      }
      points.visible = true;

      // Select realistic sprite, fall speed, size, and slant per Florida SC.5.E.7.4 precipitation form!
      let fallSpeed = 34;
      let baseSize = 3.2;
      let activeRatio = Math.min(1.0, pNorm * 1.15);

      if (pType === 'Rain') {
        uniforms.uTex.value = textures.rainTex;
        uniforms.uStretchY.value = 2.8;
        uniforms.uWindTilt.value = -wind01 * 0.34;
        uniforms.uColor.value.setHex(0xd4eeff);
        fallSpeed = 38 + pNorm * 14;
        baseSize = 3.4;
      } else if (pType === 'Snow') {
        uniforms.uTex.value = textures.snowTex;
        uniforms.uStretchY.value = 1.0;
        uniforms.uWindTilt.value = elapsed * 0.4;
        uniforms.uColor.value.setHex(0xffffff);
        fallSpeed = 7.5 + wind01 * 3.0;
        baseSize = 2.5;
      } else if (pType === 'Sleet') {
        uniforms.uTex.value = textures.iceTex;
        uniforms.uStretchY.value = 1.65;
        uniforms.uWindTilt.value = -wind01 * 0.28;
        uniforms.uColor.value.setHex(0xe0f4ff);
        fallSpeed = 29;
        baseSize = 1.95;
      } else if (pType === 'Hail') {
        uniforms.uTex.value = textures.iceTex;
        uniforms.uStretchY.value = 1.0;
        uniforms.uWindTilt.value = 0.0;
        uniforms.uColor.value.setHex(0xf4fbff);
        fallSpeed = 44;
        baseSize = 2.85;
        activeRatio = Math.min(0.75, pNorm * 0.9);
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
            // Brief hailstone bounce upward then arc down!
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
              // Hailstones bounce visibly off rocky slopes!
              m.bounced = true;
              y = groundY + 0.4;
              m.vy = 6 + Math.random() * 6;
              m.bounceVx = (Math.random() - 0.5) * 8;
            } else {
              // Respawn under active cloud deck
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
        alphaArr[i] = pType === 'Rain' ? 0.52 + pNorm * 0.34 : 0.88;
      }

      geo.attributes.position.needsUpdate = true;
      geo.attributes.aSize.needsUpdate = true;
      geo.attributes.aAlpha.needsUpdate = true;
    },
  };
}

/**
 * 4. TOGGLEABLE 3D WATER CYCLE DIRECTIONAL FLOW RIBBONS
 * Bridges classic coastal water cycle diagrams with our hyper-realistic 3D scene!
 */
function buildCycleFlowArrows() {
  const group = new THREE.Group();
  const ribbons = [];

  function makeFlowRibbon(points, colorHex, radius = 0.42) {
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
          // Traveling luminous pulse beads along the 3D cycle curve
          float wave = fract(vUv.x * 3.0 - uPulse);
          float head = smoothstep(0.55, 0.96, wave) * (1.0 - smoothstep(0.96, 1.0, wave));
          float baseLine = 0.16;
          float endFade = sin(clamp(vUv.x, 0.0, 1.0) * 3.14159);
          float alpha = (baseLine + head * 0.78) * endFade * uStrength;
          vec3 col = mix(uColor, vec3(1.0), head * 0.45);
          gl_FragColor = vec4(col, clamp(alpha, 0.0, 0.88));
        }
      `,
    });

    const mesh = new THREE.Mesh(tubeGeo, mat);

    // Sleek 3D Arrowhead Cone at 88% along the curve
    const tipPos = curve.getPoint(0.90);
    const tipTan = curve.getTangent(0.90).normalize();
    const coneGeo = new THREE.ConeGeometry(radius * 2.8, radius * 6.2, 12);
    const coneMat = new THREE.MeshBasicMaterial({
      color: colorHex,
      transparent: true,
      opacity: 0.78,
      depthWrite: false,
    });
    const cone = new THREE.Mesh(coneGeo, coneMat);
    cone.position.copy(tipPos);
    cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tipTan);

    group.add(mesh, cone);
    ribbons.push({ uniforms, coneMat });
    return { uniforms, coneMat };
  }

  // 1. Evaporation upward arrows over the Ocean (Warm Solar Amber)
  const evap1 = makeFlowRibbon(
    [
      [48, 2.0, 14],
      [46, 12.0, 12],
      [41, 22.5, 9],
      [33, 31.0, 5],
    ],
    0xf59e0b,
    0.42
  );
  const evap2 = makeFlowRibbon(
    [
      [56, 2.0, -14],
      [53, 12.5, -13],
      [47, 23.0, -10],
      [38, 31.5, -7],
    ],
    0xf59e0b,
    0.38
  );

  // 2. Moist Wind Transport & Condensation arc into Mountain Clouds (Sky Mist Blue)
  const cond1 = makeFlowRibbon(
    [
      [30, 32.5, 0],
      [10, 35.5, -1],
      [-12, 37.5, -2],
      [-34, 38.0, -3],
    ],
    0x7dd3fc,
    0.45
  );

  // 3. Precipitation downward arrows beneath Mountain Clouds (Oceanic Cyan)
  const prec1 = makeFlowRibbon(
    [
      [-40, 33.5, -4],
      [-40, 27.0, -4],
      [-40, 20.0, -4],
    ],
    0x38bdf8,
    0.40
  );
  const prec2 = makeFlowRibbon(
    [
      [-22, 33.0, 8],
      [-22, 24.5, 8],
      [-22, 15.5, 8],
    ],
    0x38bdf8,
    0.36
  );

  // 4. Surface Runoff arrow gliding down River Valley back into Ocean (Emerald Teal)
  const runPts = [];
  for (let x = -32; x <= 22; x += 9) {
    const z = getRiverCenterZ(x);
    const y = getRiverProfileY(x) + 3.0;
    runPts.push([x, y, z]);
  }
  const run1 = makeFlowRibbon(runPts, 0x2dd4bf, 0.44);

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
      pulseEvap += dt * ts * (0.35 + sim.evaporationNorm * 0.95);
      pulseCond += dt * ts * (0.30 + (sim.params.windSpeed / 45) * 0.95);
      pulsePrec += dt * ts * (0.45 + sim.precipNorm * 1.1);
      pulseRun += dt * ts * (0.35 + sim.runoffNorm * 1.0);

      const evapStr = 0.25 + sim.evaporationNorm * 0.75;
      evap1.uniforms.uPulse.value = pulseEvap;
      evap2.uniforms.uPulse.value = pulseEvap + 0.4;
      evap1.uniforms.uStrength.value = evapStr;
      evap2.uniforms.uStrength.value = evapStr;
      evap1.coneMat.opacity = evapStr * 0.85;
      evap2.coneMat.opacity = evapStr * 0.85;

      const condStr = 0.30 + (sim.metrics.cloudCoverPercent / 100) * 0.70;
      cond1.uniforms.uPulse.value = pulseCond;
      cond1.uniforms.uStrength.value = condStr;
      cond1.coneMat.opacity = condStr * 0.85;

      const precStr = sim.metrics.precipitationType === 'None' ? 0.12 : 0.35 + sim.precipNorm * 0.65;
      prec1.uniforms.uPulse.value = pulsePrec;
      prec2.uniforms.uPulse.value = pulsePrec + 0.5;
      prec1.uniforms.uStrength.value = precStr;
      prec2.uniforms.uStrength.value = precStr;
      prec1.coneMat.opacity = precStr * 0.85;
      prec2.coneMat.opacity = precStr * 0.85;

      const runStr = 0.30 + sim.runoffNorm * 0.70;
      run1.uniforms.uPulse.value = pulseRun;
      run1.uniforms.uStrength.value = runStr;
      run1.coneMat.opacity = runStr * 0.85;
    },
  };
}
