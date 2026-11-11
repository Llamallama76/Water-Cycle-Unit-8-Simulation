import * as THREE from 'three';

export const WORLD_WIDTH = 160;  // X: -80 (Mountains) to +80 (Ocean)
export const WORLD_DEPTH = 116;  // Z: -58 (Back ridge) to +58 (Front cutaway)
export const BASE_Y = -15.0;     // Bottom of geological diorama block
export const SEA_LEVEL = 0.0;

function fract(x) {
  return x - Math.floor(x);
}

function hash2D(x, z) {
  return fract(Math.sin(x * 127.1 + z * 311.7) * 43758.5453123);
}

function noise2D(x, z) {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  const xf = x - xi;
  const zf = z - zi;
  const u = xf * xf * (3 - 2 * xf);
  const v = zf * zf * (3 - 2 * zf);

  const a = hash2D(xi, zi);
  const b = hash2D(xi + 1, zi);
  const c = hash2D(xi, zi + 1);
  const d = hash2D(xi + 1, zi + 1);

  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}

function fbm2D(x, z, octaves = 5) {
  let val = 0;
  let amp = 0.5;
  let freq = 1.0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    val += amp * noise2D(x * freq, z * freq);
    norm += amp;
    amp *= 0.5;
    freq *= 2.03;
  }
  return val / norm;
}

function ridgedFbm(x, z, octaves = 5) {
  let val = 0;
  let amp = 0.5;
  let freq = 1.0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    const n = 1.0 - Math.abs(noise2D(x * freq, z * freq) * 2.0 - 1.0);
    val += amp * n * n;
    norm += amp;
    amp *= 0.5;
    freq *= 2.07;
  }
  return val / norm;
}

function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Exact meandering river centerline Z(x) angled gracefully toward the viewer so the
 * entire waterfall, river valley, and estuary delta are clearly visible from the front!
 */
export function getRiverCenterZ(x) {
  return (
    Math.sin((x + 30) * 0.088) * 10.5 +
    (x + 20) * 0.22 -
    2.0
  );
}

/**
 * Longitudinal river water surface profile Y(x)
 */
export function getRiverProfileY(x) {
  if (x <= -32) {
    return 15.8; // High alpine lake level
  }
  if (x < -21) {
    // Dramatic steep mountain waterfall cascade (-32 to -21)
    const t = smoothstep(-32, -21, x);
    return 15.8 * (1 - t) + 6.8 * t;
  }
  if (x < 15.5) {
    const t = (x - -21) / (15.5 - -21);
    const eased = Math.pow(Math.max(0, Math.min(1, t)), 0.85);
    return 6.8 * (1 - eased) + 0.06 * eased;
  }
  return 0.0;
}

/**
 * Master coastal mountain-to-ocean watershed elevation field
 */
export function getTerrainHeight(x, z) {
  const coastLineX =
    14.5 + Math.sin(z * 0.062) * 5.4 + (fbm2D(x * 0.03, z * 0.04, 3) - 0.5) * 5.5;
  const distFromCoast = coastLineX - x;

  let h = 0;

  if (distFromCoast >= 0) {
    const landProgress = Math.min(1.0, distFromCoast / 92.0);
    const foothillBase = Math.pow(landProgress, 1.38) * 18.5;

    const ridgeNoise = ridgedFbm(x * 0.028 + 3.1, z * 0.028 - 1.7, 5);
    const detailNoise = fbm2D(x * 0.08, z * 0.08, 4);

    // Grand North-West Alpine Summit
    const dPeak1 = Math.hypot((x - -56) * 0.85, (z - -24) * 0.92);
    const peak1 = Math.max(0, 1 - dPeak1 / 40) ** 1.65 * 26.5;

    // Dramatic South-West Summit
    const dPeak2 = Math.hypot((x - -52) * 0.9, (z - 25) * 0.92);
    const peak2 = Math.max(0, 1 - dPeak2 / 34) ** 1.75 * 21.0;

    // Central high ridge spur behind the alpine lake
    const dPeak3 = Math.hypot((x - -66) * 0.95, (z - 1) * 0.85);
    const peak3 = Math.max(0, 1 - dPeak3 / 32) ** 1.7 * 22.5;

    // Back northern ridge framing the coastal valley
    const backRidgeMask = smoothstep(-14, -52, z) * smoothstep(22, -25, x);
    const backRidge = backRidgeMask * (9.0 + ridgeNoise * 10.5);

    const mountainMask = smoothstep(4, 46, distFromCoast);
    h =
      distFromCoast * 0.11 +
      foothillBase +
      (peak1 + peak2 + peak3 * 0.75) * (0.68 + 0.56 * ridgeNoise) +
      backRidge +
      mountainMask * (ridgeNoise * 8.5 + (detailNoise - 0.5) * 3.0);

    const beachFlatten = smoothstep(0, 11, distFromCoast);
    h = h * (0.26 + 0.74 * beachFlatten);
  } else {
    const seaDist = -distFromCoast;
    const shelf = smoothstep(0, 46, seaDist) * -10.5 - Math.min(2.2, seaDist * 0.04);
    const sandbars = Math.sin(seaDist * 0.45 + z * 0.08) * 0.22 * (1 - smoothstep(0, 18, seaDist));
    const seaBedDetail = (fbm2D(x * 0.06, z * 0.06, 3) - 0.5) * 0.85;
    h = shelf + sandbars + seaBedDetail * smoothstep(0, 8, seaDist);
  }

  // Carve High Alpine Glacial Lake Basin around (-41, -7.5)
  const lakeCenterZ = getRiverCenterZ(-38);
  const lakeDx = (x - -40.5) / 10.0;
  const lakeDz = (z - lakeCenterZ) / 9.0;
  const lakeDist = Math.hypot(lakeDx, lakeDz);
  if (lakeDist < 1.38) {
    const basinBlend = 1.0 - smoothstep(0.55, 1.38, lakeDist);
    const lakeBedY = 13.8 + lakeDist * 1.1;
    h = h * (1 - basinBlend) + lakeBedY * basinBlend;
  }

  // Carve Wide, Crystal-Clear River Valley & Estuary Delta from x = -36 to x = +26
  if (x > -37 && x < 26) {
    const rz = getRiverCenterZ(x);
    const dzSigned = z - rz;
    const dz = Math.abs(dzSigned);
    const halfWidth = x < -21 ? 3.8 : 4.3 + smoothstep(-21, 16, x) * 6.0;
    // Open the front-facing (z > rz) valley slope slightly wider so the river is never hidden behind a ridge
    const bankSpan = dzSigned > 0 ? halfWidth * 3.4 : halfWidth * 2.7;

    if (dz < bankSpan) {
      const riverWaterY = getRiverProfileY(x);
      const bedY = riverWaterY - (1.05 + smoothstep(-20, 15, x) * 0.5);
      const channelBlend = 1.0 - smoothstep(halfWidth * 0.58, bankSpan, dz);
      const carved = Math.min(h, bedY + (1 - channelBlend) * 3.0);
      h = h * (1 - channelBlend) + carved * channelBlend;
    }
  }

  return Math.max(BASE_Y + 2.2, h);
}

/**
 * Builds the 3D terrain mesh with screen-space derivative rock/sand micro-bump normals,
 * illuminated geological strata plinth, coastal boulders, and sunlit multi-species forest
 */
export function createTerrainSystem(scene) {
  const group = new THREE.Group();
  const segX = 256;
  const segZ = 192;

  const topGeo = new THREE.PlaneGeometry(WORLD_WIDTH, WORLD_DEPTH, segX, segZ);
  topGeo.rotateX(-Math.PI / 2);

  const pos = topGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    pos.setY(i, getTerrainHeight(x, z));
  }
  topGeo.computeVertexNormals();

  const terrainUniforms = {
    uSnowLineY: { value: 26.5 },
    uWetness: { value: 0.45 },
    uTime: { value: 0 },
  };

  const terrainMat = new THREE.MeshStandardMaterial({
    roughness: 0.82,
    metalness: 0.03,
  });

  terrainMat.onBeforeCompile = (shader) => {
    shader.uniforms.uSnowLineY = terrainUniforms.uSnowLineY;
    shader.uniforms.uWetness = terrainUniforms.uWetness;
    shader.uniforms.uTime = terrainUniforms.uTime;

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vWorldPos;
        varying vec3 vTerrainNormal;`
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vTerrainNormal = normalize(mat3(modelMatrix) * objectNormal);`
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uSnowLineY;
        uniform float uWetness;
        uniform float uTime;
        varying vec3 vWorldPos;
        varying vec3 vTerrainNormal;

        float tHash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
        }
        float tNoise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(tHash(i + vec2(0.0, 0.0)), tHash(i + vec2(1.0, 0.0)), u.x),
            mix(tHash(i + vec2(0.0, 1.0)), tHash(i + vec2(1.0, 1.0)), u.x),
            u.y
          );
        }
        float tFbm(vec2 p) {
          float v = 0.0;
          float a = 0.5;
          for (int i = 0; i < 5; i++) {
            v += a * tNoise(p);
            p *= 2.11;
            a *= 0.5;
          }
          return v;
        }`
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        float h = vWorldPos.y;
        float slope = 1.0 - clamp(vTerrainNormal.y, 0.0, 1.0);

        float macroN = tFbm(vWorldPos.xz * 0.08);
        float detailN = tFbm(vWorldPos.xz * 0.48);
        float fineCrag = tFbm(vWorldPos.xz * 1.95 + vec2(h * 0.35));
        float strata = sin(h * 2.9 + macroN * 5.5) * 0.5 + 0.5;

        // Photorealistic coastal & alpine palette
        vec3 deepSeaBed = vec3(0.05, 0.17, 0.24) * (0.85 + 0.3 * detailN);
        vec3 shallowSand = vec3(0.56, 0.62, 0.52) * (0.90 + 0.2 * fineCrag);
        vec3 wetSand = vec3(0.38, 0.33, 0.26) * (0.92 + 0.16 * fineCrag);
        vec3 drySand = vec3(0.84, 0.77, 0.62) * (0.93 + 0.14 * detailN);

        vec3 lushValley = mix(vec3(0.18, 0.39, 0.16), vec3(0.29, 0.48, 0.21), macroN);
        vec3 highlandTundra = mix(vec3(0.28, 0.37, 0.19), vec3(0.41, 0.40, 0.25), detailN);
        vec3 vegetation = mix(lushValley, highlandTundra, smoothstep(6.0, 19.0, h));
        vegetation *= (0.88 + 0.24 * fineCrag);

        vec3 graniteWarm = vec3(0.49, 0.46, 0.42);
        vec3 slateCool = vec3(0.24, 0.26, 0.29);
        vec3 cliffRock = mix(slateCool, graniteWarm, strata * 0.62 + detailN * 0.38);
        cliffRock *= (0.80 + 0.38 * fineCrag);

        vec3 snowColor = mix(vec3(0.88, 0.93, 0.99), vec3(0.99, 0.995, 1.0), detailN);

        vec3 col = drySand;
        if (h < 0.0) {
          col = mix(shallowSand, deepSeaBed, smoothstep(-0.35, -7.0, h));
        } else {
          float wetBand = 1.0 - smoothstep(0.05, 0.95, h);
          vec3 shoreCol = mix(drySand, wetSand, wetBand);
          float vegBlend = smoothstep(1.45, 3.2, h + (macroN - 0.5) * 1.1);
          col = mix(shoreCol, vegetation, vegBlend);
        }

        // Crisp granite & slate cliffs on steep mountain faces and canyon walls
        float rockMask = smoothstep(0.21, 0.42, slope + smoothstep(15.5, 26.5, h) * 0.24);
        col = mix(col, cliffRock, rockMask);

        float rainDarken = 1.0 - uWetness * 0.14 * (1.0 - step(h, 0.0));
        col *= rainDarken;

        // Dynamic Mountain Snowpack & Glacial Cap
        float snowNoise = (macroN - 0.5) * 4.4 + (detailN - 0.5) * 1.8;
        float snowSlopeLimit = 1.0 - smoothstep(0.48, 0.78, slope);
        float snowMask = smoothstep(uSnowLineY - 2.2, uSnowLineY + 2.0, h + snowNoise) * snowSlopeLimit;
        col = mix(col, snowColor, clamp(snowMask, 0.0, 1.0));

        diffuseColor.rgb = col;`
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        // Screen-space derivative micro-relief bump for photorealistic rock crags & sand grain
        float bumpVal = tFbm(vWorldPos.xz * 2.1 + vec2(vWorldPos.y * 0.45));
        float bumpAmp = mix(0.22, 0.65, smoothstep(0.18, 0.45, 1.0 - clamp(vTerrainNormal.y, 0.0, 1.0)));
        vec3 dpdx = dFdx(vWorldPos);
        vec3 dpdy = dFdy(vWorldPos);
        float dbdx = dFdx(bumpVal);
        float dbdy = dFdy(bumpVal);
        vec3 r1 = cross(dpdy, normal);
        vec3 r2 = cross(normal, dpdx);
        float det = dot(dpdx, r1);
        if (abs(det) > 1e-6) {
          vec3 surfGrad = sign(det) * (dbdx * r1 + dbdy * r2);
          normal = normalize(abs(det) * normal - bumpAmp * surfGrad);
        }`
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        float wetShore = (1.0 - smoothstep(-0.2, 0.95, vWorldPos.y)) * step(-0.5, vWorldPos.y);
        float snowRough = smoothstep(uSnowLineY - 2.0, uSnowLineY + 2.0, vWorldPos.y);
        roughnessFactor = mix(0.86, 0.16, wetShore);
        roughnessFactor = mix(roughnessFactor, 0.38, snowRough * 0.75);
        roughnessFactor = clamp(roughnessFactor - uWetness * 0.16, 0.14, 0.94);`
      );
  };

  const terrainMesh = new THREE.Mesh(topGeo, terrainMat);
  terrainMesh.castShadow = true;
  terrainMesh.receiveShadow = true;
  group.add(terrainMesh);

  const skirtMesh = buildGeologicalSkirt(segX, segZ);
  group.add(skirtMesh);

  const plinthGeo = new THREE.BoxGeometry(WORLD_WIDTH + 1.8, 1.5, WORLD_DEPTH + 1.8);
  const plinthMat = new THREE.MeshStandardMaterial({
    color: 0x141d2b,
    roughness: 0.42,
    metalness: 0.25,
  });
  const plinth = new THREE.Mesh(plinthGeo, plinthMat);
  plinth.position.y = BASE_Y - 0.75;
  plinth.receiveShadow = true;
  group.add(plinth);

  const forest = buildInstancedForestAndRocks();
  group.add(forest.group);

  scene.add(group);

  return {
    group,
    terrainMesh,
    terrainUniforms,
    update(elapsed, sim) {
      terrainUniforms.uTime.value = elapsed;
      const targetSnowY = 33.0 - sim.snowpack * 26.0;
      terrainUniforms.uSnowLineY.value +=
        (targetSnowY - terrainUniforms.uSnowLineY.value) * 0.08;
      terrainUniforms.uWetness.value =
        sim.metrics.precipitationType === 'Rain' ? 0.25 + sim.precipNorm * 0.75 : 0.18;

      forest.update(elapsed, sim.params.windSpeed, sim.snowpack);
    },
  };
}

/**
 * Richly stratified geological cross-section cutaway around all 4 edges of the Earth block
 */
function buildGeologicalSkirt(segX, segZ) {
  const positions = [];
  const normals = [];
  const colors = [];

  const halfW = WORLD_WIDTH / 2;
  const halfD = WORLD_DEPTH / 2;

  function pushQuad(x0, z0, top0, x1, z1, top1, nx, nz) {
    const pts = [
      [x0, top0, z0],
      [x0, BASE_Y, z0],
      [x1, top1, z1],
      [x1, top1, z1],
      [x0, BASE_Y, z0],
      [x1, BASE_Y, z1],
    ];
    for (const [px, py, pz] of pts) {
      positions.push(px, py, pz);
      normals.push(nx, 0, nz);
      const depthT = Math.max(0, Math.min(1, (py - BASE_Y) / 34));
      const wave = Math.sin(py * 0.95 + Math.sin((px + pz) * 0.05) * 2.2) * 0.5 + 0.5;
      // Warm sedimentary sandstone/limestone over deeper slate bedrock
      const r = 0.22 + depthT * 0.26 + wave * 0.07;
      const g = 0.19 + depthT * 0.22 + wave * 0.06;
      const b = 0.18 + depthT * 0.17 + wave * 0.04;
      colors.push(r, g, b);
    }
  }

  for (let i = 0; i < segX; i++) {
    const x0 = -halfW + (i / segX) * WORLD_WIDTH;
    const x1 = -halfW + ((i + 1) / segX) * WORLD_WIDTH;
    pushQuad(x0, halfD, getTerrainHeight(x0, halfD), x1, halfD, getTerrainHeight(x1, halfD), 0, 1);
  }
  for (let i = 0; i < segX; i++) {
    const x0 = halfW - (i / segX) * WORLD_WIDTH;
    const x1 = halfW - ((i + 1) / segX) * WORLD_WIDTH;
    pushQuad(x0, -halfD, getTerrainHeight(x0, -halfD), x1, -halfD, getTerrainHeight(x1, -halfD), 0, -1);
  }
  for (let j = 0; j < segZ; j++) {
    const z0 = -halfD + (j / segZ) * WORLD_DEPTH;
    const z1 = -halfD + ((j + 1) / segZ) * WORLD_DEPTH;
    pushQuad(-halfW, z0, getTerrainHeight(-halfW, z0), -halfW, z1, getTerrainHeight(-halfW, z1), -1, 0);
  }
  for (let j = 0; j < segZ; j++) {
    const z0 = halfD - (j / segZ) * WORLD_DEPTH;
    const z1 = halfD - ((j + 1) / segZ) * WORLD_DEPTH;
    pushQuad(halfW, z0, getTerrainHeight(halfW, z0), halfW, z1, getTerrainHeight(halfW, z1), 1, 0);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.9,
    metalness: 0.04,
    emissive: new THREE.Color(0x141210),
    emissiveIntensity: 0.35,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * Scatters organic multi-tier trees + riverbank/coastal boulders while keeping the river corridor crystal-clear
 */
function buildInstancedForestAndRocks() {
  const group = new THREE.Group();
  const trees = [];
  const rocks = [];

  const halfW = WORLD_WIDTH / 2 - 4;
  const halfD = WORLD_DEPTH / 2 - 4;

  let seed = 918273;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967295;
  };

  for (let gx = -halfW; gx < 18; gx += 4.0) {
    for (let gz = -halfD; gz < halfD; gz += 4.0) {
      const x = gx + (rand() - 0.5) * 3.2;
      const z = gz + (rand() - 0.5) * 3.2;
      const y = getTerrainHeight(x, z);

      const rz = getRiverCenterZ(x);
      const riverDist = Math.abs(z - rz);

      // Scatter natural granite boulders along riverbanks & rocky waterfall rim
      if (x > -36 && x < 18 && riverDist > 3.6 && riverDist < 7.2 && rand() < 0.42 && y > 0.3) {
        rocks.push({ x, y, z, scale: 0.45 + rand() * 0.85, rot: rand() * 6.28 });
        continue;
      }

      if (y < 2.6 || y > 20.0) continue;
      // Keep generous open sightline around the river canyon & alpine lake!
      if (x > -39 && x < 22 && riverDist < 9.5) continue;
      if (Math.hypot(x - -40.5, z - getRiverCenterZ(-38)) < 14.0) continue;

      const hX = getTerrainHeight(x + 1.0, z);
      const hZ = getTerrainHeight(x, z + 1.0);
      if (Math.hypot(hX - y, hZ - y) > 0.62) continue;

      if (fbm2D(x * 0.09 + 11, z * 0.09 - 5, 3) < 0.44 && rand() > 0.3) continue;

      const scale = 0.62 + rand() * 0.65 * (1.0 - Math.max(0, (y - 12) / 16) * 0.35);
      trees.push({ x, y, z, scale, rot: rand() * Math.PI * 2, tint: rand() });
      if (trees.length >= 340) break;
    }
    if (trees.length >= 340) break;
  }

  // Smooth organic 3-tier pine & cypress silhouette (12 radial segments + warm botanical wrap tint)
  const count = trees.length;
  const trunkGeo = new THREE.CylinderGeometry(0.11, 0.20, 1.1, 8);
  trunkGeo.translate(0, 0.55, 0);

  const tier1Geo = new THREE.ConeGeometry(1.02, 1.9, 12);
  tier1Geo.translate(0, 1.65, 0);
  const tier2Geo = new THREE.ConeGeometry(0.80, 1.75, 12);
  tier2Geo.translate(0, 2.65, 0);
  const tier3Geo = new THREE.ConeGeometry(0.54, 1.45, 12);
  tier3Geo.translate(0, 3.55, 0);

  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3525, roughness: 0.92 });
  const crownMat = new THREE.MeshStandardMaterial({
    color: 0x356632,
    roughness: 0.78,
    emissive: new THREE.Color(0x0c1f0e),
    emissiveIntensity: 0.32, // Botanical needle subsurface ambient lift so shadows look lush, never pitch-black
  });

  const swayUniforms = {
    uTime: { value: 0 },
    uWind: { value: 0.4 },
    uSnow: { value: 0.2 },
  };

  crownMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = swayUniforms.uTime;
    shader.uniforms.uWind = swayUniforms.uWind;
    shader.uniforms.uSnow = swayUniforms.uSnow;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uTime;
        uniform float uWind;
        varying float vCrownLocalY;
        varying float vTreeWorldY;`
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vCrownLocalY = position.y;
        vec4 instWorld = instanceMatrix * vec4(transformed, 1.0);
        vTreeWorldY = instWorld.y;
        float swayFactor = max(0.0, (position.y - 0.9) * 0.10) * uWind;
        transformed.x += sin(uTime * 2.3 + instWorld.z * 0.25 + instWorld.x * 0.15) * swayFactor;`
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uSnow;
        varying float vCrownLocalY;
        varying float vTreeWorldY;`
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        float snowLine = 32.0 - uSnow * 25.5;
        float treeSnow = smoothstep(snowLine - 2.0, snowLine + 2.2, vTreeWorldY) * smoothstep(1.6, 3.6, vCrownLocalY);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.93, 0.97, 1.0), clamp(treeSnow * 0.88, 0.0, 0.9));`
      );
  };

  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, count);
  const crowns1 = new THREE.InstancedMesh(tier1Geo, crownMat, count);
  const crowns2 = new THREE.InstancedMesh(tier2Geo, crownMat, count);
  const crowns3 = new THREE.InstancedMesh(tier3Geo, crownMat, count);

  crowns1.castShadow = true;
  crowns2.castShadow = true;
  crowns3.castShadow = true;
  crowns1.receiveShadow = true;
  crowns2.receiveShadow = true;

  const dummy = new THREE.Object3D();
  const cColor = new THREE.Color();

  trees.forEach((t, i) => {
    dummy.position.set(t.x, t.y - 0.08, t.z);
    dummy.rotation.set(0, t.rot, 0);
    dummy.scale.setScalar(t.scale);
    dummy.updateMatrix();

    trunks.setMatrixAt(i, dummy.matrix);
    crowns1.setMatrixAt(i, dummy.matrix);
    crowns2.setMatrixAt(i, dummy.matrix);
    crowns3.setMatrixAt(i, dummy.matrix);

    cColor.setHSL(0.28 + t.tint * 0.07, 0.38 + t.tint * 0.14, 0.25 + t.tint * 0.10);
    crowns1.setColorAt(i, cColor);
    crowns2.setColorAt(i, cColor.clone().offsetHSL(0.01, 0.02, 0.03));
    crowns3.setColorAt(i, cColor.clone().offsetHSL(0.015, 0.03, 0.05));
  });

  group.add(trunks, crowns1, crowns2, crowns3);

  // Riverbank & shoreline granite boulders
  if (rocks.length > 0) {
    const rockGeo = new THREE.DodecahedronGeometry(0.65, 1);
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x6a6c6e, roughness: 0.88 });
    const rockMesh = new THREE.InstancedMesh(rockGeo, rockMat, rocks.length);
    rockMesh.castShadow = true;
    rockMesh.receiveShadow = true;
    rocks.forEach((r, idx) => {
      dummy.position.set(r.x, r.y + 0.12, r.z);
      dummy.rotation.set(r.rot * 0.4, r.rot, r.rot * 0.2);
      dummy.scale.set(r.scale * 1.2, r.scale * 0.72, r.scale);
      dummy.updateMatrix();
      rockMesh.setMatrixAt(idx, dummy.matrix);
    });
    group.add(rockMesh);
  }

  return {
    group,
    update(elapsed, windKmh, snowpack) {
      swayUniforms.uTime.value = elapsed;
      swayUniforms.uWind.value = 0.15 + (windKmh / 45) * 1.35;
      swayUniforms.uSnow.value = snowpack;
    },
  };
}
