/**
 * Florida 5th Grade Science Water Cycle Simulation Model
 * Aligned strictly to Next Generation Sunshine State Standards:
 * - SC.5.E.7.1: Create a model to explain the parts of the water cycle (gas, liquid, solid state changes).
 * - SC.5.E.7.2: Recognize that the ocean is an integral part of the water cycle (97% of Earth's water)
 *               connected to all reservoirs via evaporation and precipitation.
 * - SC.5.E.7.3: Air temperature, humidity, wind speed/direction, and precipitation determine weather.
 * - SC.5.E.7.4: Distinguish among forms of precipitation (rain, snow, sleet, and hail).
 *
 * Content Limits Respected:
 * - Excludes untested processes: transpiration, infiltration, percolation, sublimation.
 * - Excludes molecular/particle kinetic equations and advanced thermodynamic formulas.
 */

export const DEFAULT_PARAMS = Object.freeze({
  sunlight: 72,          // % Solar energy intensity (0 - 100)
  airTempC: 27,          // °C Air temperature (-6 to 38°C; 27°C ≈ 81°F Florida coast)
  windSpeed: 18,         // km/h Onshore sea breeze pushing ocean vapor toward mountains (0 - 45)
  stormUpdrafts: false,  // Strong thunderstorm updrafts (enables Hail formation per SC.5.E.7.4)
  timeScale: 1,          // 0 = Paused, 1 = 1x, 2 = 2x
  showFlowArrows: true,  // 3D Cycle diagram directional arrows
  showLabels: true,      // 3D Stage interactive labels
});

export const SCENARIO_PRESETS = {
  floridaSunny: {
    id: 'floridaSunny',
    name: 'Sunny Coast',
    subtitle: 'Warm sea breeze & afternoon rain',
    sunlight: 84,
    airTempC: 30,
    windSpeed: 22,
    stormUpdrafts: false,
  },
  cloudyCool: {
    id: 'cloudyCool',
    name: 'Cloudy & Mild',
    subtitle: 'Low solar energy slows evaporation',
    sunlight: 24,
    airTempC: 15,
    windSpeed: 10,
    stormUpdrafts: false,
  },
  winterFreeze: {
    id: 'winterFreeze',
    name: 'Mountain Freeze',
    subtitle: 'Below 0°C turns rain into solid snow',
    sunlight: 48,
    airTempC: -4,
    windSpeed: 26,
    stormUpdrafts: false,
  },
  sleetMix: {
    id: 'sleetMix',
    name: 'Freezing Sleet',
    subtitle: 'Near-freezing air forms ice pellets',
    sunlight: 40,
    airTempC: 1,
    windSpeed: 24,
    stormUpdrafts: false,
  },
  summerHail: {
    id: 'summerHail',
    name: 'Thunderstorm Hail',
    subtitle: 'Strong storm updrafts freeze raindrops',
    sunlight: 92,
    airTempC: 29,
    windSpeed: 38,
    stormUpdrafts: true,
  },
};

export function celsiusToFahrenheit(c) {
  return Math.round((c * 9) / 5 + 32);
}

export class WaterCycleSimulation {
  constructor() {
    this.params = { ...DEFAULT_PARAMS };
    this.reset();
  }

  reset() {
    this.params = { ...DEFAULT_PARAMS };
    this.elapsedSeconds = 0;

    // Internal smoothed hydrological reservoirs (0..1 normalized where applicable)
    this.evaporationNorm = 0.62;    // 0..1
    this.cloudMoisture = 56;        // 0..100 %
    this.condensationNorm = 0.56;   // 0..1
    this.precipNorm = 0.44;         // 0..1
    this.runoffNorm = 0.46;         // 0..1
    this.snowpack = 0.22;           // 0..1 alpine peak snow cover

    // Human-readable scientific telemetry for the 5th-grade Data Sheet
    this.metrics = {
      evaporationRate: 4.8,         // L/m²/hr from ocean & surface water
      humidityPercent: 68,          // % atmospheric moisture
      cloudCoverPercent: 56,        // % mountain cloud buildup
      precipitationType: 'Rain',    // 'None' | 'Rain' | 'Snow' | 'Sleet' | 'Hail'
      precipitationState: 'Liquid', // 'Liquid' | 'Solid' | 'None'
      precipitationRate: 14.2,      // mm/hr
      runoffFlow: 42.0,             // m³/s river discharge back to ocean
      snowlineMeters: 2600,         // visual snow elevation indicator
      activeStates: ['Liquid', 'Gas', 'Solid'],
      summaryNote: '',
    };

    this.step(0.016, true);
  }

  applyPreset(presetKey) {
    const p = SCENARIO_PRESETS[presetKey];
    if (!p) return;
    this.params.sunlight = p.sunlight;
    this.params.airTempC = p.airTempC;
    this.params.windSpeed = p.windSpeed;
    this.params.stormUpdrafts = p.stormUpdrafts;
  }

  step(dt, instant = false) {
    const effectiveDt = instant ? 1.0 : Math.min(dt, 0.1) * this.params.timeScale;
    if (!instant && this.params.timeScale === 0) {
      return this.metrics;
    }

    if (!instant) {
      this.elapsedSeconds += effectiveDt;
    }

    const sun01 = this.params.sunlight / 100; // 0..1
    // Normalize airTempC (-6..38) -> 0..1
    const temp01 = Math.max(0, Math.min(1, (this.params.airTempC + 6) / 44));
    const wind01 = this.params.windSpeed / 45; // 0..1

    // 1. EVAPORATION (Liquid -> Gas / Water Vapor)
    // Driven primarily by Solar Energy heating the Ocean, boosted by warmer Air Temp & Wind
    const thermalDrive = sun01 * (0.45 + 0.55 * temp01) + 0.08 * temp01;
    const windEvapBoost = 0.82 + 0.32 * wind01;
    const targetEvap = Math.max(0.03, Math.min(1.0, thermalDrive * windEvapBoost));

    const lerpFast = instant ? 1 : 1 - Math.exp(-effectiveDt * 1.6);
    const lerpMed = instant ? 1 : 1 - Math.exp(-effectiveDt * 0.95);
    const lerpSlow = instant ? 1 : 1 - Math.exp(-effectiveDt * 0.45);

    this.evaporationNorm += (targetEvap - this.evaporationNorm) * lerpFast;

    // 2. CONDENSATION (Water Vapor Gas -> Liquid Cloud Droplets / Ice Crystals)
    // Onshore wind carries moist ocean air inland up cooler mountain slopes where it cools & condenses
    const transportFactor = 0.30 + 0.70 * Math.pow(wind01, 0.65);
    const coolingBoost = 1.0 + (1.0 - temp01) * 0.22 + (this.params.stormUpdrafts ? 0.25 : 0);
    const targetCondensation = Math.max(
      0.06,
      Math.min(1.0, this.evaporationNorm * transportFactor * coolingBoost * 1.18)
    );
    this.condensationNorm += (targetCondensation - this.condensationNorm) * lerpMed;

    const targetCloudMoisture = Math.round(
      Math.max(8, Math.min(100, this.condensationNorm * 98 + (this.params.stormUpdrafts ? 12 : 0)))
    );
    this.cloudMoisture += (targetCloudMoisture - this.cloudMoisture) * lerpMed;

    // 3. PRECIPITATION (Rain, Snow, Sleet, or Hail - SC.5.E.7.4)
    // Clouds release precipitation once condensed droplets/crystals grow heavy enough
    const cloud01 = this.cloudMoisture / 100;
    const rawPrecip = cloud01 > 0.24 ? Math.pow((cloud01 - 0.24) / 0.76, 1.15) : 0;
    const stormMultiplier = this.params.stormUpdrafts ? 1.22 : 1.0;
    const targetPrecip = Math.max(0, Math.min(1.0, rawPrecip * stormMultiplier));
    this.precipNorm += (targetPrecip - this.precipNorm) * lerpMed;

    let precipType = 'None';
    let precipState = 'None';
    if (this.precipNorm >= 0.05) {
      if (this.params.stormUpdrafts && this.cloudMoisture >= 45 && this.params.airTempC > 4) {
        precipType = 'Hail';
        precipState = 'Solid';
      } else if (this.params.airTempC <= 0) {
        precipType = 'Snow';
        precipState = 'Solid';
      } else if (this.params.airTempC <= 3) {
        precipType = 'Sleet';
        precipState = 'Solid';
      } else {
        precipType = 'Rain';
        precipState = 'Liquid';
      }
    }

    // 4. MOUNTAIN SNOWPACK & STATE CHANGES (Solid <-> Liquid - SC.5.E.7.1)
    let targetSnowpack = 0.08; // high alpine permanent cap
    if (this.params.airTempC <= 0) {
      targetSnowpack = Math.min(1.0, 0.58 + this.precipNorm * 0.42 + (-this.params.airTempC / 12) * 0.2);
    } else if (this.params.airTempC <= 4) {
      targetSnowpack = 0.42 + this.precipNorm * 0.15;
    } else {
      // Warmer air & sunlight melt mountain snowpack into river runoff
      targetSnowpack = Math.max(0.02, 0.34 - temp01 * 0.30 - sun01 * 0.08);
    }
    const prevSnowpack = this.snowpack;
    this.snowpack += (targetSnowpack - this.snowpack) * lerpSlow;
    const snowmeltContribution = Math.max(0, (prevSnowpack - this.snowpack) * 3.5);

    // 5. SURFACE RUNOFF & COLLECTION (Flowing down river valley back to Ocean - SC.5.E.7.2)
    let liquidInput = 0.10; // base mountain spring flow
    if (precipType === 'Rain') {
      liquidInput += this.precipNorm * 0.88;
    } else if (precipType === 'Hail') {
      // Hailstones melt quickly on warm ground into runoff
      liquidInput += this.precipNorm * 0.65;
    } else if (precipType === 'Sleet') {
      liquidInput += this.precipNorm * 0.28;
    } else if (precipType === 'Snow') {
      // Snow stays frozen as solid on the ground until temperature rises!
      liquidInput += this.precipNorm * 0.06;
    }
    // Add warm-day alpine snowmelt if snowpack exists and temp > 2°C
    if (this.params.airTempC > 2 && this.snowpack > 0.06) {
      liquidInput += Math.min(0.28, snowmeltContribution + sun01 * temp01 * this.snowpack * 0.35);
    }

    const targetRunoff = Math.max(0.08, Math.min(1.0, liquidInput));
    this.runoffNorm += (targetRunoff - this.runoffNorm) * lerpMed;

    // Populate student-friendly scientific metrics
    const evapLiters = +(this.evaporationNorm * 8.4).toFixed(1);
    const humidity = Math.round(Math.min(99, 32 + this.evaporationNorm * 42 + cloud01 * 26));
    const cloudPct = Math.round(this.cloudMoisture);
    const precipMm = precipType === 'None' ? 0 : +(this.precipNorm * 36.0).toFixed(1);
    const runoffM3 = +(6 + this.runoffNorm * 84).toFixed(1);

    const states = ['Liquid', 'Gas'];
    if (this.snowpack > 0.08 || precipState === 'Solid' || this.params.stormUpdrafts) {
      states.push('Solid');
    }

    this.metrics = {
      evaporationRate: evapLiters,
      humidityPercent: humidity,
      cloudCoverPercent: cloudPct,
      precipitationType: precipType,
      precipitationState: precipState,
      precipitationRate: precipMm,
      runoffFlow: runoffM3,
      snowpackNorm: this.snowpack,
      activeStates: states,
      summaryNote: this.buildObservationSummary(precipType),
    };

    return this.metrics;
  }

  buildObservationSummary(precipType) {
    const { sunlight, airTempC, windSpeed, stormUpdrafts } = this.params;
    const tempF = celsiusToFahrenheit(airTempC);

    if (sunlight < 20) {
      return `Low sunlight (${sunlight}%) provides little heat energy to the ocean, slowing evaporation into water vapor.`;
    }
    if (precipType === 'Hail' && stormUpdrafts) {
      return `Strong storm updrafts toss liquid raindrops high into freezing cloud tops, forming solid hailstones!`;
    }
    if (precipType === 'Snow') {
      return `Air temperature is freezing (${airTempC}°C / ${tempF}°F), so cloud moisture falls as solid snow and builds snowpack instead of immediate liquid runoff.`;
    }
    if (precipType === 'Sleet') {
      return `Near-freezing air (${airTempC}°C / ${tempF}°F) freezes falling raindrops into solid sleet pellets before they hit the ground.`;
    }
    if (windSpeed < 5) {
      return `Calm wind (${windSpeed} km/h) keeps most evaporated ocean water vapor near the coast instead of pushing it up the mountains.`;
    }
    if (precipType === 'Rain' && this.precipNorm > 0.55) {
      return `Strong solar energy heats the ocean, wind pushes water vapor up the cooler mountains to condense into heavy clouds, and rain flows back as river runoff!`;
    }
    return `Solar energy evaporates liquid ocean water into water vapor (gas), which cools into clouds and cycles back to Earth's reservoirs.`;
  }
}
