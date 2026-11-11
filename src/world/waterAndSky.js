import * as THREE from 'three';
import { Water } from 'three/examples/jsm/objects/Water.js';
import {
  WORLD_WIDTH,
  WORLD_DEPTH,
  SEA_LEVEL,
  getTerrainHeight,
  getRiverCenterZ,
  getRiverProfileY,
} from './terrain.js';

/**
 * Creates a rich cinematic Atmospheric Scattering Sky Dome, Glowing 3D Sun,
 * Planar Reflective Ocean (THREE.Water), Translucent Deep Ocean Cutaway Volume,
 * Shoreline Surf Waves, Alpine Glacial Lake, Prominent Turquoise River + Waterfall Cascade,
 * 7 Mountainside Surface Runoff Channels, Ocean Delta Plume, and 3D Flowing Runoff Particles.
 */
export function createWaterAndSkySystem(scene, renderer, textures) {
  const group = new THREE.Group();

  // 1. CUSTOM CINEMATIC RAYLEIGH / MIE ATMOSPHERIC SKY DOME
  const skyGeo = new THREE.SphereGeometry(2800, 48, 32);
  const skyUniforms = {
    uSunDir: { value: new THREE.Vector3(0.5, 0.45, -0.3).normalize() },
    uSunlight: { value: 0.72 },
    uCloudiness: { value: 0.5 },
  };

  const skyMat = new THREE.ShaderMaterial({
    uniforms: skyUniforms,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    vertexShader: `
      varying vec3 vWorldDir;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldDir = normalize(wp.xyz);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      uniform vec3 uSunDir;
      uniform float uSunlight;
      uniform float uCloudiness;
      varying vec3 vWorldDir;

      float starHash(vec3 p) {
        return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
      }

      void main() {
        vec3 dir = normalize(vWorldDir);
        float y = clamp(dir.y, -0.15, 1.0);
        float horizonT = pow(1.0 - clamp(y, 0.0, 1.0), 3.2);

        vec3 dayZenith = vec3(0.05, 0.19, 0.42);
        vec3 dayMid    = vec3(0.16, 0.43, 0.74);
        vec3 dayHoriz  = vec3(0.58, 0.79, 0.94);

        vec3 nightZenith = vec3(0.015, 0.03, 0.08);
        vec3 nightMid    = vec3(0.04, 0.08, 0.17);
        vec3 nightHoriz  = vec3(0.11, 0.17, 0.27);

        vec3 stormZenith = vec3(0.09, 0.14, 0.22);
        vec3 stormHoriz  = vec3(0.28, 0.35, 0.43);

        vec3 zenith = mix(nightZenith, dayZenith, uSunlight);
        vec3 midCol = mix(nightMid, dayMid, uSunlight);
        vec3 horiz  = mix(nightHoriz, dayHoriz, uSunlight);

        float stormMix = smoothstep(0.35, 0.95, uCloudiness) * 0.72;
        zenith = mix(zenith, stormZenith, stormMix);
        midCol = mix(midCol, mix(stormZenith, stormHoriz, 0.5), stormMix);
        horiz  = mix(horiz, stormHoriz, stormMix);

        vec3 skyCol = mix(midCol, zenith, smoothstep(0.08, 0.72, max(0.0, y)));
        skyCol = mix(skyCol, horiz, horizonT);

        float sunCos = max(0.0, dot(dir, normalize(uSunDir)));
        float mieHalo = pow(sunCos, 9.0) * 0.34 + pow(sunCos, 64.0) * 0.55;
        vec3 sunGlowCol = mix(vec3(1.0, 0.55, 0.22), vec3(1.0, 0.94, 0.80), uSunlight);
        skyCol += sunGlowCol * mieHalo * uSunlight * (1.0 - stormMix * 0.75);

        if (uSunlight < 0.28 && y > 0.05) {
          vec3 grid = floor(dir * 260.0);
          float s = starHash(grid);
          if (s > 0.9965) {
            float nightFade = (0.28 - uSunlight) / 0.28 * (1.0 - uCloudiness * 0.85);
            skyCol += vec3(0.85, 0.92, 1.0) * nightFade * 0.85;
          }
        }

        if (y < 0.0) {
          vec3 seaMist = mix(vec3(0.05, 0.10, 0.18), vec3(0.24, 0.44, 0.64), uSunlight * (1.0 - stormMix * 0.6));
          skyCol = mix(horiz, seaMist, smoothstep(0.0, -0.28, y));
        }

        gl_FragColor = vec4(skyCol, 1.0);
      }
    `,
  });

  const sky = new THREE.Mesh(skyGeo, skyMat);
  scene.add(sky);

  const sunDirection = new THREE.Vector3();

  const sunGroup = new THREE.Group();
  const sunCoreGeo = new THREE.SphereGeometry(7.8, 24, 24);
  const sunCoreMat = new THREE.MeshBasicMaterial({ color: 0xfff9e2, fog: false });
  const sunCore = new THREE.Mesh(sunCoreGeo, sunCoreMat);

  const sunCoronaMat = new THREE.SpriteMaterial({
    map: textures.cloudPuffTex,
    color: 0xffc254,
    transparent: true,
    opacity: 0.82,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
  });
  const sunCorona = new THREE.Sprite(sunCoronaMat);
  sunCorona.scale.set(68, 68, 1);
  sunGroup.add(sunCore, sunCorona);
  scene.add(sunGroup);

  // 2. DIRECTIONAL SUNLIGHT & SKY/GROUND HEMISPHERE LIGHT
  const sunLight = new THREE.DirectionalLight(0xfff5e4, 2.5);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.width = 2048;
  sunLight.shadow.mapSize.height = 2048;
  sunLight.shadow.camera.near = 20;
  sunLight.shadow.camera.far = 340;
  const d = 100;
  sunLight.shadow.camera.left = -d;
  sunLight.shadow.camera.right = d;
  sunLight.shadow.camera.top = d;
  sunLight.shadow.camera.bottom = -d;
  sunLight.shadow.bias = -0.0005;
  scene.add(sunLight);

  const hemiLight = new THREE.HemisphereLight(0x8ec8f6, 0x3b4836, 1.05);
  scene.add(hemiLight);

  const fillLight = new THREE.DirectionalLight(0x9ec5e8, 0.55);
  fillLight.position.set(-30, 42, 110);
  scene.add(fillLight);

  // 3. HYPER-REALISTIC PLANAR REFLECTIVE OCEAN (THREE.Water)
  const oceanWidth = 78;
  const oceanGeo = new THREE.PlaneGeometry(oceanWidth, WORLD_DEPTH, 1, 1);
  const ocean = new Water(oceanGeo, {
    textureWidth: 512,
    textureHeight: 512,
    waterNormals: textures.waterNormalsTex,
    sunDirection: new THREE.Vector3(),
    sunColor: 0xffe9b8,
    waterColor: 0x034462,
    distortionScale: 2.2,
    fog: scene.fog !== undefined,
  });
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.set(WORLD_WIDTH / 2 - oceanWidth / 2, SEA_LEVEL, 0);
  ocean.material.uniforms.size.value = 3.8;
  group.add(ocean);

  // 4. TRANSLUCENT DEEP OCEAN CUTAWAY VOLUME WALLS
  const cutawayWalls = buildOceanCutawayWalls();
  group.add(cutawayWalls);

  // 5. ANIMATED SHORELINE BREAKING SURF FOAM
  const surf = buildShorelineSurf();
  group.add(surf.mesh);

  // 6. PROMINENT ALPINE LAKE, WATERFALL CASCADE, RIVER, 7 RUNOFF CHANNELS & FLOW SURGES
  const riverSystem = buildRiverAndWaterfall(textures);
  group.add(riverSystem.group);

  scene.add(group);

  let currentWaveTime = 0;

  return {
    sky,
    ocean,
    sunLight,
    hemiLight,
    sunDirection,
    update(dt, elapsed, sim) {
      const sun01 = sim.params.sunlight / 100;
      const cloud01 = sim.metrics.cloudCoverPercent / 100;
      const wind01 = sim.params.windSpeed / 45;
      const isStorm = sim.params.stormUpdrafts || sim.precipNorm > 0.68;

      const elevationDeg = 4 + sun01 * 21;
      const azimuthDeg = 152 - sun01 * 8;
      const phi = THREE.MathUtils.degToRad(90 - elevationDeg);
      const theta = THREE.MathUtils.degToRad(azimuthDeg);
      sunDirection.setFromSphericalCoords(1, phi, theta);

      skyUniforms.uSunDir.value.copy(sunDirection);
      skyUniforms.uSunlight.value = sun01;
      skyUniforms.uCloudiness.value = cloud01 + (isStorm ? 0.2 : 0);

      sunGroup.position.copy(sunDirection).multiplyScalar(360);
      const sunVis = Math.max(0.06, sun01 * (1.0 - cloud01 * 0.58));
      sunCoronaMat.opacity = sunVis * 0.85;
      const coronaScale = 38 + sun01 * 42;
      sunCorona.scale.set(coronaScale, coronaScale, 1);
      sunCore.scale.setScalar(0.5 + sun01 * 0.55);

      sunLight.position.copy(sunDirection).multiplyScalar(150);
      const cloudDim = 1.0 - cloud01 * 0.48 - (isStorm ? 0.16 : 0);
      sunLight.intensity = (0.20 + sun01 * 2.65) * Math.max(0.24, cloudDim);

      const sunHueColor = new THREE.Color().setHSL(
        0.08 + sun01 * 0.025,
        0.72 - sun01 * 0.35,
        0.58 + sun01 * 0.36
      );
      sunLight.color.copy(sunHueColor);

      hemiLight.intensity = 0.42 + sun01 * 0.68 - cloud01 * 0.14;

      if (scene.fog) {
        const dayFog = new THREE.Color(0x6ea8d6);
        const duskFog = new THREE.Color(0x142236);
        const stormFog = new THREE.Color(0x364556);
        const targetFog = duskFog.clone().lerp(dayFog, sun01).lerp(stormFog, cloud01 * 0.65);
        scene.fog.color.lerp(targetFog, 0.08);
      }

      const activeDt = sim.params.timeScale === 0 ? dt * 0.12 : dt * sim.params.timeScale;
      currentWaveTime += activeDt * (0.38 + wind01 * 0.95);
      ocean.material.uniforms['time'].value = currentWaveTime;
      ocean.material.uniforms['sunDirection'].value.copy(sunDirection).normalize();
      ocean.material.uniforms['distortionScale'].value = 1.0 + wind01 * 3.0;

      const deepOceanColor = new THREE.Color(0x033652);
      const sunnyOceanColor = new THREE.Color(0x055a7a);
      ocean.material.uniforms['waterColor'].value
        .copy(deepOceanColor)
        .lerp(sunnyOceanColor, sun01 * (1 - cloud01 * 0.45));

      surf.update(elapsed, wind01, sim.params.timeScale);
      riverSystem.update(dt, elapsed, sim);
    },
  };
}

function buildOceanCutawayWalls() {
  const positions = [];
  const normals = [];
  const halfW = WORLD_WIDTH / 2;
  const halfD = WORLD_DEPTH / 2;
  const steps = 96;

  function addWaterSlice(x0, z0, x1, z1, nx, nz) {
    const h0 = getTerrainHeight(x0, z0);
    const h1 = getTerrainHeight(x1, z1);
    if (h0 >= SEA_LEVEL && h1 >= SEA_LEVEL) return;

    const b0 = Math.min(SEA_LEVEL, h0);
    const b1 = Math.min(SEA_LEVEL, h1);
    const pts = [
      [x0, SEA_LEVEL, z0],
      [x0, b0, z0],
      [x1, SEA_LEVEL, z1],
      [x1, SEA_LEVEL, z1],
      [x0, b0, z0],
      [x1, b1, z1],
    ];
    for (const [px, py, pz] of pts) {
      positions.push(px, py, pz);
      normals.push(nx, 0, nz);
    }
  }

  for (let i = 0; i < steps; i++) {
    const x0 = (i / steps) * halfW;
    const x1 = ((i + 1) / steps) * halfW;
    addWaterSlice(x0, halfD + 0.05, x1, halfD + 0.05, 0, 1);
  }
  for (let i = 0; i < steps; i++) {
    const x0 = halfW - (i / steps) * halfW;
    const x1 = halfW - ((i + 1) / steps) * halfW;
    addWaterSlice(x0, -halfD - 0.05, x1, -halfD - 0.05, 0, -1);
  }
  for (let j = 0; j < steps; j++) {
    const z0 = halfD - (j / steps) * WORLD_DEPTH;
    const z1 = halfD - ((j + 1) / steps) * WORLD_DEPTH;
    addWaterSlice(halfW + 0.05, z0, halfW + 0.05, z1, 1, 0);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));

  const mat = new THREE.MeshPhysicalMaterial({
    color: 0x065c82,
    roughness: 0.1,
    metalness: 0.05,
    transmission: 0.3,
    transparent: true,
    opacity: 0.82,
    side: THREE.DoubleSide,
  });

  return new THREE.Mesh(geo, mat);
}

function buildShorelineSurf() {
  const segs = 120;
  const halfD = WORLD_DEPTH / 2 - 0.5;
  const positions = [];
  const uvs = [];
  const indices = [];

  for (let i = 0; i <= segs; i++) {
    const v = i / segs;
    const z = -halfD + v * (halfD * 2);
    let shoreX = 14.5;
    for (let sx = 4; sx <= 28; sx += 0.4) {
      if (getTerrainHeight(sx, z) <= 0.04) {
        shoreX = sx;
        break;
      }
    }
    positions.push(shoreX - 1.3, 0.09, z);
    positions.push(shoreX + 4.8, 0.05, z);
    uvs.push(0, v * 10);
    uvs.push(1, v * 10);

    if (i < segs) {
      const a = i * 2;
      const b = a + 1;
      const c = a + 2;
      const d = a + 3;
      indices.push(a, b, c, b, d, c);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();

  const uniforms = {
    uTime: { value: 0 },
    uWind: { value: 0.4 },
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
      uniform float uTime;
      uniform float uWind;
      varying vec2 vUv;
      void main() {
        float wave1 = sin(vUv.x * 16.0 + uTime * (2.2 + uWind * 2.0) + sin(vUv.y * 2.5) * 1.4);
        float wave2 = sin(vUv.x * 26.0 + uTime * 3.1 - vUv.y * 1.8);
        float foamLine = smoothstep(0.42, 0.94, wave1 * 0.65 + wave2 * 0.35);
        float edgeFade = sin(clamp(vUv.x, 0.0, 1.0) * 3.14159);
        float shoreBias = 1.0 - smoothstep(0.05, 0.85, vUv.x);
        float alpha = (foamLine * 0.58 + shoreBias * 0.28) * edgeFade * (0.48 + uWind * 0.45);
        gl_FragColor = vec4(0.94, 0.98, 1.0, clamp(alpha, 0.0, 0.82));
      }
    `,
  });

  const mesh = new THREE.Mesh(geo, mat);
  return {
    mesh,
    update(elapsed, wind01, timeScale) {
      if (timeScale > 0) {
        uniforms.uTime.value = elapsed * timeScale;
      }
      uniforms.uWind.value = wind01;
    },
  };
}

/**
 * Prominent Watershed Runoff System:
 * - High Alpine Tarn
 * - Wide, vibrant Turquoise-Cyan River & Whitewater Waterfall Cascade + Ocean Delta Plume
 * - 7 Bold Mountainside Runoff Tributary Channels with animated downhill current pulses
 * - 440 Glistening 3D Flowing Water Surge Particles racing from peaks -> river -> ocean!
 */
function buildRiverAndWaterfall(textures) {
  const group = new THREE.Group();

  // 1. High Alpine Glacial Tarn
  const lakeGeo = new THREE.CircleGeometry(9.8, 44);
  lakeGeo.rotateX(-Math.PI / 2);
  lakeGeo.scale(1.08, 1, 0.96);
  const lakeMat = new THREE.MeshPhysicalMaterial({
    color: 0x0ea5e9,
    emissive: new THREE.Color(0x064e6e),
    emissiveIntensity: 0.48,
    roughness: 0.10,
    metalness: 0.06,
    transparent: true,
    opacity: 0.95,
  });
  const lakeMesh = new THREE.Mesh(lakeGeo, lakeMat);
  lakeMesh.position.set(-40.5, 15.82, getRiverCenterZ(-38));
  group.add(lakeMesh);

  // 2. Wide, High-Contrast Rushing River + Waterfall + Coastal Estuary Fan (-36.5 to +27)
  const riverSegs = 160;
  const positions = [];
  const uvs = [];
  const rapidsAttr = [];
  const indices = [];

  for (let i = 0; i <= riverSegs; i++) {
    const t = i / riverSegs;
    const x = -36.5 + t * (27.0 - -36.5);
    const cz = getRiverCenterZ(x);
    // Slightly elevated clearance so banks never clip water ribbon, tapering smoothly into sea level
    const seaBlend = THREE.MathUtils.smoothstep(x, 14.0, 26.5);
    const wy = (getRiverProfileY(x) + 0.34) * (1 - seaBlend) + 0.14 * seaBlend;

    const dx = 0.5;
    const dz = getRiverCenterZ(x + dx) - cz;
    const len = Math.hypot(dx, dz);
    const nx = -dz / len;
    const nz = dx / len;

    // Generous, classroom-visible river width + dramatic estuarine fan into the ocean bay!
    let halfW = x < -21 ? 3.5 : 4.0 + Math.pow(Math.max(0, (x + 21) / 36.5), 1.0) * 5.5;
    if (x > 15.0) {
      halfW += Math.pow((x - 15.0) / 12.0, 1.3) * 8.5; // Freshwater runoff plume fanning into ocean!
    }
    const isWaterfall = x > -33.0 && x < -20.0 ? 1.0 : x > 15.5 ? 0.22 : 0.48;

    positions.push(x - nx * halfW, wy + 0.14, cz - nz * halfW);
    positions.push(x + nx * halfW, wy + 0.14, cz + nz * halfW);

    uvs.push(0, t * 16);
    uvs.push(1, t * 16);
    rapidsAttr.push(isWaterfall, isWaterfall);

    if (i < riverSegs) {
      const a = i * 2;
      const b = a + 1;
      const c = a + 2;
      const d = a + 3;
      indices.push(a, c, b, b, c, d);
    }
  }

  const riverGeo = new THREE.BufferGeometry();
  riverGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  riverGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  riverGeo.setAttribute('aRapids', new THREE.Float32BufferAttribute(rapidsAttr, 1));
  riverGeo.setIndex(indices);
  riverGeo.computeVertexNormals();

  const riverUniforms = {
    uFlowTex: { value: textures.riverFlowTex },
    uFlowOffset: { value: 0 },
    uRunoffNorm: { value: 0.6 },
    uRunoffVis: { value: 1.0 },
  };

  const riverMat = new THREE.ShaderMaterial({
    uniforms: riverUniforms,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -3,
    vertexShader: `
      attribute float aRapids;
      varying vec2 vUv;
      varying float vRapids;
      void main() {
        vUv = uv;
        vRapids = aRapids;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D uFlowTex;
      uniform float uFlowOffset;
      uniform float uRunoffNorm;
      uniform float uRunoffVis;
      varying vec2 vUv;
      varying float vRapids;
      void main() {
        vec2 uv1 = vec2(vUv.x, vUv.y - uFlowOffset * 1.35);
        vec2 uv2 = vec2(vUv.x * 1.6 + 0.35, vUv.y * 1.4 - uFlowOffset * 1.85);
        vec4 t1 = texture2D(uFlowTex, uv1);
        vec4 t2 = texture2D(uFlowTex, uv2);

        float foam = (t1.r * 0.55 + t2.r * 0.45);
        float bankSoft = sin(clamp(vUv.x, 0.0, 1.0) * 3.14159);

        // Directional V-shaped current chevrons moving downstream so flow direction is unmistakable!
        float centerDist = abs(vUv.x - 0.5) * 2.0;
        float chevronWave = sin((vUv.y * 3.2 - uFlowOffset * 3.8) + centerDist * 2.4) * 0.5 + 0.5;
        float surgeCrest = pow(chevronWave, 2.6) * (1.0 - centerDist * 0.50);

        float visBoost = clamp(uRunoffVis, 0.25, 2.6);
        float whitewater = smoothstep(0.40 - vRapids * 0.26 - uRunoffNorm * 0.16, 0.80, foam);
        float totalFoam = clamp(whitewater * (0.58 + vRapids * 0.5) + surgeCrest * 0.52 * min(1.8, visBoost), 0.0, 1.0);

        vec3 deepTurquoise = mix(vec3(0.03, 0.54, 0.80), vec3(0.12, 0.76, 0.96), clamp(uRunoffNorm * 0.7 + (visBoost - 1.0) * 0.35, 0.0, 1.0));
        vec3 foamCol = vec3(0.96, 0.995, 1.0);
        vec3 finalCol = mix(deepTurquoise, foamCol, totalFoam);

        // Gently feather out the ocean delta fan at the very end (vUv.y -> 16)
        float oceanDeltaFade = 1.0 - smoothstep(13.6, 16.0, vUv.y);
        float baseAlpha = (0.88 + uRunoffNorm * 0.12) * pow(bankSoft, 0.28) * oceanDeltaFade;
        float alpha = clamp(baseAlpha * min(1.35, 0.50 + visBoost * 0.65), 0.0, 0.98);
        gl_FragColor = vec4(finalCol, alpha);
      }
    `,
  });

  const riverMesh = new THREE.Mesh(riverGeo, riverMat);
  riverMesh.renderOrder = 2;
  group.add(riverMesh);

  // 3. Seven Prominent Mountainside Surface Runoff Feeder Channels
  const tributaries = buildMountainRunoffStreams(textures);
  group.add(tributaries.group);

  // 4. Animated 3D Flowing Water Droplets / Whitewater Surges along Gullies + River -> Ocean!
  const runoffParticles = buildRunoffFlowParticles(textures, tributaries.curves);
  group.add(runoffParticles.points);

  // 5. Waterfall Cascade Spray Plume
  const mistCount = 42;
  const mistSprites = [];
  for (let i = 0; i < mistCount; i++) {
    const smat = new THREE.SpriteMaterial({
      map: textures.cloudPuffTex,
      color: 0xf0faff,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
    });
    const sp = new THREE.Sprite(smat);
    const x = -32.0 + (i / mistCount) * 11.5;
    const z = getRiverCenterZ(x) + Math.sin(i * 7.3) * 2.2;
    const baseY = getRiverProfileY(x) + 0.85;
    sp.position.set(x, baseY, z);
    const sc = 3.5 + (i % 4) * 1.1;
    sp.scale.set(sc, sc * 0.82, 1);
    sp.userData = { baseX: x, baseY, baseZ: z, phase: i * 0.63, baseScale: sc };
    group.add(sp);
    mistSprites.push(sp);
  }

  let flowAccum = 0;

  return {
    group,
    update(dt, elapsed, sim) {
      const speedScale = sim.params.timeScale === 0 ? 0 : sim.params.timeScale;
      const runoffVis = (sim.params.runoffVisibility ?? 100) / 100;
      const flowSpeed = (0.65 + sim.runoffNorm * 2.1) * speedScale;
      flowAccum += dt * flowSpeed;

      riverUniforms.uFlowOffset.value = flowAccum;
      riverUniforms.uRunoffNorm.value = sim.runoffNorm;
      riverUniforms.uRunoffVis.value = runoffVis;

      lakeMat.emissiveIntensity = 0.35 + Math.min(0.65, runoffVis * 0.22);
      riverMesh.position.y = (sim.runoffNorm - 0.35) * 0.24;

      for (const sp of mistSprites) {
        const u = sp.userData;
        const cycle = ((elapsed * (0.65 + sim.runoffNorm * 0.9) + u.phase) % 2.0) / 2.0;
        sp.position.y = u.baseY + cycle * 2.6;
        sp.position.x = u.baseX + cycle * 1.2;
        const alpha = Math.sin(cycle * Math.PI) * (0.16 + sim.runoffNorm * 0.38) * Math.min(1.6, runoffVis);
        sp.material.opacity = Math.min(0.88, alpha);
        const s = u.baseScale * (0.85 + cycle * 0.7);
        sp.scale.set(s, s * 0.82, 1);
      }

      tributaries.update(flowAccum, sim.runoffNorm, runoffVis);
      runoffParticles.update(dt, elapsed, sim, runoffVis);
    },
  };
}

/**
 * Builds 7 bold, high-contrast mountainside surface runoff streams draining every slope into the river
 */
function buildMountainRunoffStreams(textures) {
  const group = new THREE.Group();
  const lakeZ = getRiverCenterZ(-38);

  // 7 runoff gullies placed prominently on front-facing & valley-facing mountain slopes!
  const paths = [
    // 1. North-West Summit front face -> Alpine Lake
    [
      [-58, -23],
      [-53, -18],
      [-47, -13],
      [-41, lakeZ - 1.5],
    ],
    // 2. Central High Spur -> Alpine Lake headwaters
    [
      [-64, -1],
      [-56, -3],
      [-49, -5],
      [-42, lakeZ],
    ],
    // 3. South-West Summit -> Waterfall rim
    [
      [-53, 24],
      [-46, 16],
      [-39, 7],
      [-31.5, getRiverCenterZ(-31.5)],
    ],
    // 4. Front-Left Foothill Slope -> Mid-Upper River (super visible from overview camera!)
    [
      [-44, 32],
      [-35, 24],
      [-26, 15],
      [-18, getRiverCenterZ(-18) + 1.5],
    ],
    // 5. Front Coastal Highland -> Lower River Valley
    [
      [-26, 35],
      [-18, 25],
      [-10, 15],
      [-3, getRiverCenterZ(-3) + 2.0],
    ],
    // 6. Back Northern Ridge -> Mid River Canyon
    [
      [-34, -36],
      [-28, -24],
      [-22, -13],
      [-16, getRiverCenterZ(-16) - 1.5],
    ],
    // 7. Eastern Coastal Ridge -> River Estuary
    [
      [-14, -34],
      [-8, -21],
      [-2, -9],
      [4, getRiverCenterZ(4) - 2.0],
    ],
  ];

  const uniforms = {
    uFlowTex: { value: textures.riverFlowTex },
    uFlowOffset: { value: 0 },
    uIntensity: { value: 0.65 },
    uRunoffVis: { value: 1.0 },
  };

  const mat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D uFlowTex;
      uniform float uFlowOffset;
      uniform float uIntensity;
      uniform float uRunoffVis;
      varying vec2 vUv;
      void main() {
        vec4 tex = texture2D(uFlowTex, vec2(vUv.x, vUv.y - uFlowOffset * 1.75));
        float edge = sin(clamp(vUv.x, 0.0, 1.0) * 3.14159);
        float endFade = smoothstep(0.0, 0.10, vUv.y / 8.0) * (1.0 - smoothstep(0.92, 1.0, vUv.y / 8.0));

        // Bright animated downhill water-pulse surges along every mountainside runoff stream!
        float pulse = pow(sin(vUv.y * 2.8 - uFlowOffset * 4.6) * 0.5 + 0.5, 2.2);
        float vis = clamp(uRunoffVis, 0.25, 2.6);

        vec3 streamBlue = mix(vec3(0.06, 0.64, 0.90), vec3(0.22, 0.84, 0.99), clamp((vis - 0.8) * 0.6, 0.0, 1.0));
        vec3 surgeWhite = vec3(0.96, 0.995, 1.0);
        vec3 col = mix(streamBlue, surgeWhite, clamp(tex.r * 0.55 + pulse * 0.58, 0.0, 1.0));

        float alpha = pow(edge, 0.36) * (0.52 + uIntensity * 0.46) * endFade * min(1.45, 0.42 + vis * 0.72);
        gl_FragColor = vec4(col, clamp(alpha, 0.0, 0.96));
      }
    `,
  });

  const curves = [];

  for (const pts of paths) {
    // Sample intermediate terrain heights densely so curves hug mountain ridges above triangles!
    const densePts = [];
    for (let k = 0; k < pts.length - 1; k++) {
      const [x0, z0] = pts[k];
      const [x1, z1] = pts[k + 1];
      const subSteps = 4;
      for (let s = 0; s < subSteps; s++) {
        const f = s / subSteps;
        const px = x0 + (x1 - x0) * f;
        const pz = z0 + (z1 - z0) * f;
        densePts.push(new THREE.Vector3(px, getTerrainHeight(px, pz) + 0.42, pz));
      }
    }
    const [lastX, lastZ] = pts[pts.length - 1];
    densePts.push(new THREE.Vector3(lastX, getTerrainHeight(lastX, lastZ) + 0.42, lastZ));

    const curve = new THREE.CatmullRomCurve3(densePts);
    curves.push(curve);

    const segs = 72;
    const pos = [];
    const uvs = [];
    const idx = [];

    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const p = curve.getPoint(t);
      const tan = curve.getTangent(t);
      const nx = -tan.z;
      const nz = tan.x;
      const len = Math.hypot(nx, nz) || 1;
      // Wider, unmistakable mountainside runoff channels (1.05 expanding to 2.15 units!)
      const hw = 0.95 + t * 1.15;

      const lx = p.x - (nx / len) * hw;
      const lz = p.z - (nz / len) * hw;
      const rx = p.x + (nx / len) * hw;
      const rz = p.z + (nz / len) * hw;

      const ly = Math.max(p.y, getTerrainHeight(lx, lz) + 0.36);
      const ry = Math.max(p.y, getTerrainHeight(rx, rz) + 0.36);

      pos.push(lx, ly, lz);
      pos.push(rx, ry, rz);
      uvs.push(0, t * 8);
      uvs.push(1, t * 8);

      if (i < segs) {
        const a = i * 2;
        idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    }

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex(idx);
    const streamMesh = new THREE.Mesh(g, mat);
    streamMesh.renderOrder = 3;
    group.add(streamMesh);
  }

  return {
    group,
    curves,
    update(flowOffset, runoffNorm, runoffVis) {
      uniforms.uFlowOffset.value = flowOffset;
      uniforms.uIntensity.value = runoffNorm;
      uniforms.uRunoffVis.value = runoffVis;
    },
  };
}

/**
 * 440 Glistening 3D Flowing Water Droplets / Whitewater Surges visibly racing downhill
 * along all 7 mountainside channels AND down the main waterfall + river into the ocean!
 */
function buildRunoffFlowParticles(textures, tributaryCurves) {
  // Build main river centerline curve from Alpine Lake (-38) to Ocean Delta (+26)
  const riverPts = [];
  for (let x = -38; x <= 26; x += 2.5) {
    const z = getRiverCenterZ(x);
    const seaBlend = THREE.MathUtils.smoothstep(x, 14.5, 26.0);
    const y = (getRiverProfileY(x) + 0.55) * (1 - seaBlend) + 0.35 * seaBlend;
    riverPts.push(new THREE.Vector3(x, y, z));
  }
  const mainRiverCurve = new THREE.CatmullRomCurve3(riverPts);

  const allPaths = [...tributaryCurves, mainRiverCurve];
  const mainIdx = allPaths.length - 1;

  const count = 440;
  const positions = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const alphas = new Float32Array(count);
  const meta = [];

  for (let i = 0; i < count; i++) {
    // 55% of flow tracers in the main waterfall/river/delta, 45% racing down the 7 mountain slopes!
    const pathIdx = i < 240 ? mainIdx : i % tributaryCurves.length;
    const isMain = pathIdx === mainIdx;
    meta.push({
      pathIdx,
      isMain,
      t: Math.random(),
      speed: (isMain ? 0.20 : 0.34) * (0.8 + Math.random() * 0.45),
      lateralOffset: (Math.random() - 0.5) * (isMain ? 4.8 : 1.2),
      baseSize: isMain ? 2.4 + Math.random() * 2.0 : 1.9 + Math.random() * 1.5,
    });
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  geo.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1));

  const uniforms = {
    uTex: { value: textures.iceTex },
    uColor: { value: new THREE.Color(0x9ae6ff) },
  };

  const mat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: `
      attribute float aSize;
      attribute float aAlpha;
      varying float vAlpha;
      void main() {
        vAlpha = aAlpha;
        vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aSize * (280.0 / max(10.0, -mvPos.z));
        gl_Position = projectionMatrix * mvPos;
      }
    `,
    fragmentShader: `
      uniform sampler2D uTex;
      uniform vec3 uColor;
      varying float vAlpha;
      void main() {
        if (vAlpha <= 0.01) discard;
        vec4 tex = texture2D(uTex, gl_PointCoord);
        if (tex.a < 0.05) discard;
        gl_FragColor = vec4(uColor * tex.rgb, tex.a * vAlpha);
      }
    `,
  });

  const points = new THREE.Points(geo, mat);
  points.renderOrder = 4;
  const tmpPt = new THREE.Vector3();
  const tmpTan = new THREE.Vector3();

  return {
    points,
    update(dt, elapsed, sim, runoffVis) {
      const ts = sim.params.timeScale === 0 ? 0 : sim.params.timeScale;
      const rateMult = (0.55 + sim.runoffNorm * 1.35) * ts;
      const vis = Math.max(0.25, Math.min(2.6, runoffVis));

      const posArr = geo.attributes.position.array;
      const sizeArr = geo.attributes.aSize.array;
      const alphaArr = geo.attributes.aAlpha.array;

      const activeRatio = Math.min(1.0, (0.45 + sim.runoffNorm * 0.55) * Math.min(1.3, 0.5 + vis * 0.6));
      const activeCount = Math.floor(count * activeRatio);

      for (let i = 0; i < count; i++) {
        if (i >= activeCount) {
          alphaArr[i] = 0;
          continue;
        }
        const m = meta[i];
        m.t += dt * m.speed * rateMult;
        if (m.t >= 1.0) m.t -= 1.0;

        const curve = allPaths[m.pathIdx];
        curve.getPointAt(m.t, tmpPt);
        curve.getTangentAt(m.t, tmpTan);

        const nx = -tmpTan.z;
        const nz = tmpTan.x;
        const nLen = Math.hypot(nx, nz) || 1;

        // Fan out wider as river empties into the ocean delta!
        const deltaSpread = m.isMain && m.t > 0.78 ? 1.0 + ((m.t - 0.78) / 0.22) * 2.4 : 1.0;
        const lat = m.lateralOffset * deltaSpread;

        posArr[i * 3] = tmpPt.x + (nx / nLen) * lat;
        posArr[i * 3 + 1] = tmpPt.y + Math.sin(elapsed * 5.0 + i) * 0.08;
        posArr[i * 3 + 2] = tmpPt.z + (nz / nLen) * lat;

        const fadeEnds = Math.sin(m.t * Math.PI);
        sizeArr[i] = m.baseSize * (0.75 + vis * 0.45);
        alphaArr[i] = Math.min(0.95, fadeEnds * (0.32 + sim.runoffNorm * 0.42) * vis);
      }

      geo.attributes.position.needsUpdate = true;
      geo.attributes.aSize.needsUpdate = true;
      geo.attributes.aAlpha.needsUpdate = true;
    },
  };
}
