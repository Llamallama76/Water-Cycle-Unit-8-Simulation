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
 * Shoreline Surf Waves, Alpine Glacial Lake, and Turquoise River + Waterfall Cascade.
 */
export function createWaterAndSkySystem(scene, renderer, textures) {
  const group = new THREE.Group();

  // 1. CUSTOM CINEMATIC RAYLEIGH / MIE ATMOSPHERIC SKY DOME (Rich cobalt-cerulean contrast!)
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

        // Rich clear-day atmospheric gradient
        vec3 dayZenith = vec3(0.05, 0.19, 0.42);
        vec3 dayMid    = vec3(0.16, 0.43, 0.74);
        vec3 dayHoriz  = vec3(0.58, 0.79, 0.94);

        // Twilight / Night gradient when student lowers Sunlight toward 0%
        vec3 nightZenith = vec3(0.015, 0.03, 0.08);
        vec3 nightMid    = vec3(0.04, 0.08, 0.17);
        vec3 nightHoriz  = vec3(0.11, 0.17, 0.27);

        // Brooding slate storm sky when Cloudiness / Storm Updrafts are high
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

        // Warm Mie solar scattering halo around the Sun
        float sunCos = max(0.0, dot(dir, normalize(uSunDir)));
        float mieHalo = pow(sunCos, 9.0) * 0.34 + pow(sunCos, 64.0) * 0.55;
        vec3 sunGlowCol = mix(vec3(1.0, 0.55, 0.22), vec3(1.0, 0.94, 0.80), uSunlight);
        skyCol += sunGlowCol * mieHalo * uSunlight * (1.0 - stormMix * 0.75);

        // Subtle stars when Sunlight < 25%
        if (uSunlight < 0.28 && y > 0.05) {
          vec3 grid = floor(dir * 260.0);
          float s = starHash(grid);
          if (s > 0.9965) {
            float nightFade = (0.28 - uSunlight) / 0.28 * (1.0 - uCloudiness * 0.85);
            skyCol += vec3(0.85, 0.92, 1.0) * nightFade * 0.85;
          }
        }

        // Smooth atmospheric horizon haze below eye-level so ocean meets a luminous sky horizon
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

  // Visible 3D Sun Orb & Soft Golden Corona positioned in the upper-right sky over the Ocean!
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

  // 2. BALANCED DIRECTIONAL SUNLIGHT & SKY/GROUND HEMISPHERE LIGHT
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

  // Subtle front fill directional light so cutaway strata & shaded cliffs retain rich detail
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

  // 6. ALPINE LAKE, WATERFALL CASCADE, AND TURQUOISE RIVER VALLEY
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

      // Place Sun in upper-right sky (+X, -Z, theta ~ 148°) directly above the ocean bay!
      const elevationDeg = 4 + sun01 * 21; // 4° (horizon twilight) to 25° (radiant sun in frame!)
      const azimuthDeg = 152 - sun01 * 8;  // +X, -Z quadrant over the ocean
      const phi = THREE.MathUtils.degToRad(90 - elevationDeg);
      const theta = THREE.MathUtils.degToRad(azimuthDeg);
      sunDirection.setFromSphericalCoords(1, phi, theta);

      skyUniforms.uSunDir.value.copy(sunDirection);
      skyUniforms.uSunlight.value = sun01;
      skyUniforms.uCloudiness.value = cloud01 + (isStorm ? 0.2 : 0);

      // Update visible Sun orb
      sunGroup.position.copy(sunDirection).multiplyScalar(360);
      const sunVis = Math.max(0.06, sun01 * (1.0 - cloud01 * 0.58));
      sunCoronaMat.opacity = sunVis * 0.85;
      const coronaScale = 38 + sun01 * 42;
      sunCorona.scale.set(coronaScale, coronaScale, 1);
      sunCore.scale.setScalar(0.5 + sun01 * 0.55);

      // Lighting intensity & color temperature
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

      // Advance Ocean Waves
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

function buildRiverAndWaterfall(textures) {
  const group = new THREE.Group();

  // 1. High Alpine Glacial Tarn aligned precisely with basin at (-40.5, 15.72, getRiverCenterZ(-38))
  const lakeGeo = new THREE.CircleGeometry(9.2, 40);
  lakeGeo.rotateX(-Math.PI / 2);
  lakeGeo.scale(1.06, 1, 0.94);
  const lakeMat = new THREE.MeshPhysicalMaterial({
    color: 0x0e7ca3,
    emissive: new THREE.Color(0x042838),
    emissiveIntensity: 0.35,
    roughness: 0.12,
    metalness: 0.08,
    transparent: true,
    opacity: 0.92,
  });
  const lakeMesh = new THREE.Mesh(lakeGeo, lakeMat);
  lakeMesh.position.set(-40.5, 15.72, getRiverCenterZ(-38));
  group.add(lakeMesh);

  // 2. Wide, Shimmering Turquoise River & Cascading Waterfall Ribbon (-36 to +19.5)
  const riverSegs = 140;
  const positions = [];
  const uvs = [];
  const rapidsAttr = [];
  const indices = [];

  for (let i = 0; i <= riverSegs; i++) {
    const t = i / riverSegs;
    const x = -36.0 + t * (19.5 - -36.0);
    const cz = getRiverCenterZ(x);
    const wy = getRiverProfileY(x) + 0.18;

    const dx = 0.5;
    const dz = getRiverCenterZ(x + dx) - cz;
    const len = Math.hypot(dx, dz);
    const nx = -dz / len;
    const nz = dx / len;

    const halfW = x < -21 ? 2.7 : 3.0 + Math.pow(Math.max(0, (x + 21) / 40.5), 1.1) * 5.2;
    const isWaterfall = x > -32.5 && x < -20.5 ? 1.0 : 0.28;

    positions.push(x - nx * halfW, wy, cz - nz * halfW);
    positions.push(x + nx * halfW, wy, cz + nz * halfW);

    uvs.push(0, t * 14);
    uvs.push(1, t * 14);
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
    uRunoffNorm: { value: 0.5 },
  };

  const riverMat = new THREE.ShaderMaterial({
    uniforms: riverUniforms,
    transparent: true,
    depthWrite: false,
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
      varying vec2 vUv;
      varying float vRapids;
      void main() {
        vec2 uv1 = vec2(vUv.x, vUv.y - uFlowOffset);
        vec2 uv2 = vec2(vUv.x * 1.5 + 0.35, vUv.y * 1.35 - uFlowOffset * 1.5);
        vec4 t1 = texture2D(uFlowTex, uv1);
        vec4 t2 = texture2D(uFlowTex, uv2);

        float foam = (t1.r * 0.55 + t2.r * 0.45);
        float bankSoft = sin(clamp(vUv.x, 0.0, 1.0) * 3.14159);
        float whitewater = smoothstep(0.38 - vRapids * 0.24 - uRunoffNorm * 0.14, 0.85, foam);

        vec3 turquoiseRiver = mix(vec3(0.06, 0.46, 0.66), vec3(0.14, 0.64, 0.82), uRunoffNorm);
        vec3 foamCol = vec3(0.95, 0.99, 1.0);
        vec3 finalCol = mix(turquoiseRiver, foamCol, clamp(whitewater * (0.48 + vRapids * 0.52), 0.0, 1.0));

        float alpha = clamp((0.82 + uRunoffNorm * 0.18) * pow(bankSoft, 0.35), 0.0, 0.98);
        gl_FragColor = vec4(finalCol, alpha);
      }
    `,
  });

  const riverMesh = new THREE.Mesh(riverGeo, riverMat);
  group.add(riverMesh);

  // 3. Mountain Runoff Feeder Streams
  const tributaries = buildMountainRunoffStreams(textures);
  group.add(tributaries.group);

  // 4. Waterfall Cascade Spray Plume
  const mistCount = 36;
  const mistSprites = [];
  for (let i = 0; i < mistCount; i++) {
    const smat = new THREE.SpriteMaterial({
      map: textures.cloudPuffTex,
      color: 0xeef9ff,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
    });
    const sp = new THREE.Sprite(smat);
    const x = -31.5 + (i / mistCount) * 10.5;
    const z = getRiverCenterZ(x) + Math.sin(i * 7.3) * 2.0;
    const baseY = getRiverProfileY(x) + 0.7;
    sp.position.set(x, baseY, z);
    const sc = 3.2 + (i % 4) * 1.0;
    sp.scale.set(sc, sc * 0.8, 1);
    sp.userData = { baseX: x, baseY, baseZ: z, phase: i * 0.63, baseScale: sc };
    group.add(sp);
    mistSprites.push(sp);
  }

  let flowAccum = 0;

  return {
    group,
    update(dt, elapsed, sim) {
      const speedScale = sim.params.timeScale === 0 ? 0 : sim.params.timeScale;
      const flowSpeed = (0.5 + sim.runoffNorm * 1.9) * speedScale;
      flowAccum += dt * flowSpeed;

      riverUniforms.uFlowOffset.value = flowAccum;
      riverUniforms.uRunoffNorm.value = sim.runoffNorm;

      riverMesh.position.y = (sim.runoffNorm - 0.4) * 0.22;

      for (const sp of mistSprites) {
        const u = sp.userData;
        const cycle = ((elapsed * (0.6 + sim.runoffNorm * 0.85) + u.phase) % 2.0) / 2.0;
        sp.position.y = u.baseY + cycle * 2.4;
        sp.position.x = u.baseX + cycle * 1.1;
        const alpha = Math.sin(cycle * Math.PI) * (0.15 + sim.runoffNorm * 0.36);
        sp.material.opacity = alpha;
        const s = u.baseScale * (0.85 + cycle * 0.65);
        sp.scale.set(s, s * 0.8, 1);
      }

      tributaries.update(flowAccum, sim.runoffNorm);
    },
  };
}

function buildMountainRunoffStreams(textures) {
  const group = new THREE.Group();
  const lakeZ = getRiverCenterZ(-38);
  const paths = [
    [
      [-56, -23],
      [-51, -17],
      [-46, -12],
      [-41, lakeZ - 2],
    ],
    [
      [-51, 22],
      [-44, 13],
      [-37, 4],
      [-31, getRiverCenterZ(-31)],
    ],
    [
      [-24, -34],
      [-18, -22],
      [-13, -11],
      [-8, getRiverCenterZ(-8)],
    ],
  ];

  const uniforms = {
    uFlowTex: { value: textures.riverFlowTex },
    uFlowOffset: { value: 0 },
    uIntensity: { value: 0.5 },
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
      uniform sampler2D uFlowTex;
      uniform float uFlowOffset;
      uniform float uIntensity;
      varying vec2 vUv;
      void main() {
        vec4 tex = texture2D(uFlowTex, vec2(vUv.x, vUv.y - uFlowOffset * 1.4));
        float edge = sin(clamp(vUv.x, 0.0, 1.0) * 3.14159);
        float endFade = sin(clamp(vUv.y / 6.0, 0.0, 1.0) * 3.14159);
        vec3 col = mix(vec3(0.16, 0.64, 0.85), vec3(0.95, 0.99, 1.0), tex.r * 0.72);
        float alpha = edge * (0.22 + uIntensity * 0.72) * (0.45 + endFade * 0.55);
        gl_FragColor = vec4(col, clamp(alpha, 0.0, 0.90));
      }
    `,
  });

  for (const pts of paths) {
    const curvePts = pts.map(([x, z]) => new THREE.Vector3(x, getTerrainHeight(x, z) + 0.24, z));
    const curve = new THREE.CatmullRomCurve3(curvePts);
    const segs = 42;
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
      const hw = 0.65 + t * 0.75;

      const lx = p.x - (nx / len) * hw;
      const lz = p.z - (nz / len) * hw;
      const rx = p.x + (nx / len) * hw;
      const rz = p.z + (nz / len) * hw;

      pos.push(lx, getTerrainHeight(lx, lz) + 0.20, lz);
      pos.push(rx, getTerrainHeight(rx, rz) + 0.20, rz);
      uvs.push(0, t * 6);
      uvs.push(1, t * 6);

      if (i < segs) {
        const a = i * 2;
        idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    }

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex(idx);
    group.add(new THREE.Mesh(g, mat));
  }

  return {
    group,
    update(flowOffset, runoffNorm) {
      uniforms.uFlowOffset.value = flowOffset;
      uniforms.uIntensity.value = runoffNorm;
    },
  };
}
