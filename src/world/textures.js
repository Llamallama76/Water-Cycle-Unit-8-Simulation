import * as THREE from 'three';

/**
 * Deterministic fast hash & tileable noise helpers for realistic procedural PBR & particle textures
 */
function hash2(x, y, seed = 1337) {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1442695041);
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function tileableValueNoise(x, y, period, seed) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);

  const x0 = ((xi % period) + period) % period;
  const x1 = (x0 + 1) % period;
  const y0 = ((yi % period) + period) % period;
  const y1 = (y0 + 1) % period;

  const a = hash2(x0, y0, seed);
  const b = hash2(x1, y0, seed);
  const c = hash2(x0, y1, seed);
  const d = hash2(x1, y1, seed);

  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}

function tileableFBM(u, v, basePeriod = 8, octaves = 5, seed = 42) {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  let period = basePeriod;
  for (let i = 0; i < octaves; i++) {
    sum += amp * tileableValueNoise(u * period, v * period, period, seed + i * 97);
    norm += amp;
    amp *= 0.5;
    period *= 2;
  }
  return sum / norm;
}

/**
 * Generates a seamless 512x512 tangent-space normal map for THREE.Water planar ocean reflections
 */
export function createWaterNormalsTexture(size = 512) {
  const heights = new Float32Array(size * size);
  const tau = Math.PI * 2;

  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      // Combine directional ocean swells + multi-octave capillary ripples (strictly periodic!)
      const swell1 = Math.sin((u * 3 + v * 2) * tau) * 0.24;
      const swell2 = Math.cos((u * 5 - v * 4) * tau + 1.1) * 0.16;
      const chop = Math.sin((u * 11 + v * 9) * tau) * 0.08;
      const fbm = tileableFBM(u, v, 8, 5, 101) * 0.65 + tileableFBM(u, v, 24, 4, 313) * 0.35;
      heights[y * size + x] = swell1 + swell2 + chop + fbm * 0.85;
    }
  }

  const data = new Uint8Array(size * size * 4);
  const strength = 5.2;

  for (let y = 0; y < size; y++) {
    const ym = (y - 1 + size) % size;
    const yp = (y + 1) % size;
    for (let x = 0; x < size; x++) {
      const xm = (x - 1 + size) % size;
      const xp = (x + 1) % size;

      const hL = heights[y * size + xm];
      const hR = heights[y * size + xp];
      const hD = heights[ym * size + x];
      const hU = heights[yp * size + x];

      const dx = (hL - hR) * strength;
      const dy = (hD - hU) * strength;
      const dz = 1.0;
      const invLen = 1.0 / Math.sqrt(dx * dx + dy * dy + dz * dz);

      const idx = (y * size + x) * 4;
      data[idx] = Math.round((dx * invLen * 0.5 + 0.5) * 255);
      data[idx + 1] = Math.round((dy * invLen * 0.5 + 0.5) * 255);
      data[idx + 2] = Math.round((dz * invLen * 0.5 + 0.5) * 255);
      data[idx + 3] = 255;
    }
  }

  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Generates a soft organic billowing cloud puff sprite for realistic 3D cloud banks & vapor mist
 */
export function createCloudPuffTexture(size = 256) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  const d = img.data;

  for (let y = 0; y < size; y++) {
    const ny = (y / (size - 1)) * 2 - 1;
    for (let x = 0; x < size; x++) {
      const nx = (x / (size - 1)) * 2 - 1;
      const r = Math.sqrt(nx * nx + ny * ny);
      if (r >= 1.0) continue;

      const u = x / size;
      const v = y / size;
      const billow = tileableFBM(u, v, 5, 4, 709);
      const radial = Math.pow(Math.max(0, 1 - r), 1.65);
      const alpha = Math.max(0, Math.min(1, radial * (0.58 + 0.62 * billow)));

      // Subtle sunlit top-bias luminance for realistic cloud self-shadowing
      const shade = 232 + Math.round((1 - (ny * 0.5 + 0.5)) * 23);

      const idx = (y * size + x) * 4;
      d[idx] = shade;
      d[idx + 1] = shade + 2 > 255 ? 255 : shade + 2;
      d[idx + 2] = 255;
      d[idx + 3] = Math.round(alpha * 255);
    }
  }

  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Generates crisp particle sprites for Rain streaks, Snow crystals, and Sleet/Hail ice pellets
 */
export function createPrecipitationTextures() {
  // 1. Rain streak
  const rainCanvas = document.createElement('canvas');
  rainCanvas.width = 64;
  rainCanvas.height = 128;
  const rctx = rainCanvas.getContext('2d');
  const rGrad = rctx.createLinearGradient(32, 4, 32, 124);
  rGrad.addColorStop(0, 'rgba(200, 235, 255, 0)');
  rGrad.addColorStop(0.35, 'rgba(215, 242, 255, 0.55)');
  rGrad.addColorStop(0.85, 'rgba(240, 250, 255, 0.95)');
  rGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
  rctx.fillStyle = rGrad;
  rctx.beginPath();
  rctx.ellipse(32, 64, 4.2, 56, 0, 0, Math.PI * 2);
  rctx.fill();
  const rainTex = new THREE.CanvasTexture(rainCanvas);

  // 2. Snowflake (6-pointed crystal)
  const snowCanvas = document.createElement('canvas');
  snowCanvas.width = 128;
  snowCanvas.height = 128;
  const sctx = snowCanvas.getContext('2d');
  const sGlow = sctx.createRadialGradient(64, 64, 2, 64, 64, 58);
  sGlow.addColorStop(0, 'rgba(255,255,255,0.95)');
  sGlow.addColorStop(0.45, 'rgba(230,245,255,0.55)');
  sGlow.addColorStop(1, 'rgba(210,235,255,0)');
  sctx.fillStyle = sGlow;
  sctx.fillRect(0, 0, 128, 128);

  sctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
  sctx.lineWidth = 4.5;
  sctx.lineCap = 'round';
  for (let i = 0; i < 6; i++) {
    const angle = (i * Math.PI) / 3;
    sctx.save();
    sctx.translate(64, 64);
    sctx.rotate(angle);
    sctx.beginPath();
    sctx.moveTo(0, 0);
    sctx.lineTo(0, -46);
    sctx.moveTo(0, -26);
    sctx.lineTo(-11, -36);
    sctx.moveTo(0, -26);
    sctx.lineTo(11, -36);
    sctx.stroke();
    sctx.restore();
  }
  const snowTex = new THREE.CanvasTexture(snowCanvas);

  // 3. Ice pellet / Hailstone (specular glossy ice sphere)
  const iceCanvas = document.createElement('canvas');
  iceCanvas.width = 96;
  iceCanvas.height = 96;
  const ictx = iceCanvas.getContext('2d');
  const iGrad = ictx.createRadialGradient(36, 34, 4, 48, 48, 42);
  iGrad.addColorStop(0, 'rgba(255, 255, 255, 1)');
  iGrad.addColorStop(0.35, 'rgba(225, 244, 255, 0.96)');
  iGrad.addColorStop(0.78, 'rgba(155, 205, 240, 0.85)');
  iGrad.addColorStop(1, 'rgba(120, 180, 225, 0)');
  ictx.fillStyle = iGrad;
  ictx.beginPath();
  ictx.arc(48, 48, 42, 0, Math.PI * 2);
  ictx.fill();
  const iceTex = new THREE.CanvasTexture(iceCanvas);

  return { rainTex, snowTex, iceTex };
}

/**
 * Generates a seamless scrolling river whitewater & ripple texture
 */
export function createRiverFlowTexture(size = 256) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  const d = img.data;

  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      // Stretched along V (flow direction) for natural rushing water streaks
      const streak = tileableFBM(u * 2.0, v * 0.5, 8, 4, 521);
      const foam = Math.pow(Math.max(0, streak - 0.36) / 0.64, 1.5);
      const idx = (y * size + x) * 4;
      d[idx] = Math.round(32 + foam * 215);
      d[idx + 1] = Math.round(115 + foam * 135);
      d[idx + 2] = Math.round(165 + foam * 90);
      d[idx + 3] = Math.round((0.72 + foam * 0.28) * 255);
    }
  }

  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}
