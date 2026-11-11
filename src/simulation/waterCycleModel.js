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
  sunlight: 72,           // % Solar energy intensity (0 - 100)
  airTempC: 27,           // °C Air temperature (-6 to 38°C; 27°C ≈ 81°F Florida coast)
  windSpeed: 18,          // km/h Onshore sea breeze pushing ocean vapor toward mountains (0 - 45)
  stormUpdrafts: false,   // Strong thunderstorm updrafts (enables Hail formation per SC.5.E.7.4)
  timeScale: 1,           // 0 = Paused, 1 = 1x, 2 = 2x
  showFlowArrows: true,   // 3D Cycle diagram directional arrows
  showLabels: true,       // 3D Stage interactive labels
  // Classroom Teacher Display Visibility Controls (25% - 250%, 100% = prominent baseline)
  evapVisibility: 100,
  rainVisibility: 100,
  runoffVisibility: 100,
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
    subtitle: 'Cooler air & steady coastal rain',
    sunlight: 32,
    airTempC: 16,
    windSpeed: 16,
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
    sunlight: 42,
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
    this.evaporationNorm = 0.65;    // 0..1
    this.cloudMoisture = 64;        // 0..100 %
    this.condensationNorm = 0.64;   // 0..1
    this.precipNorm = 0.62;         // 0..1
    this.runoffNorm = 0.64;         // 0..1
    this.snowpack = 0.22;           // 0..1 alpine peak snow cover

    // Human-readable scientific telemetry for the 5th-grade Data Sheet
    this.metrics = {
      evaporationRate: 5.5,         // L/m²/hr from ocean & surface water
      humidityPercent: 72,          // % atmospheric moisture
      cloudCoverPercent: 64,        // % mountain cloud buildup
      precipitationType: 'Rain',    // 'None' | 'Rain' | 'Snow' | 'Sleet' | 'Hail'
      precipitationState: 'Liquid', // 'Liquid' | 'Solid' | 'None'
      precipitationRate: 21.6,      // mm/hr
      runoffFlow: 58.0,             // m³/s river discharge back to ocean
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
    const temp01 = Math.max(0, Math.min(1, (this.params.airTempC + 6) / 44));
    const wind01 = this.params.windSpeed / 45; // 0..1

    // 1. EVAPORATION (Liquid -> Gas / Water Vapor)
    // Driven primarily by Solar Energy heating the Ocean, with baseline ocean thermal evaporation
    const thermalDrive = 0.14 + sun01 * (0.42 + 0.50 * temp01) + 0.08 * temp01;
    const windEvapBoost = 0.84 + 0.30 * wind01;
    const targetEvap = Math.max(0.06, Math.min(1.0, thermalDrive * windEvapBoost));

    const lerpFast = instant ? 1 : 1 - Math.exp(-effectiveDt * 1.6);
    const lerpMed = instant ? 1 : 1 - Math.exp(-effectiveDt * 0.95);
    const lerpSlow = instant ? 1 : 1 - Math.exp(-effectiveDt * 0.45);

    this.evaporationNorm += (targetEvap - this.evaporationNorm) * lerpFast;

    // 2. CONDENSATION (Water Vapor Gas -> Liquid Cloud Droplets / Ice Crystals)
    const transportFactor = 0.38 + 0.65 * Math.pow(wind01, 0.6);
    const coolingBoost = 1.05 + (1.0 - temp01) * 0.28 + (this.params.stormUpdrafts ? 0.25 : 0);
    const targetCondensation = Math.max(
      0.12,
      Math.min(1.0, this.evaporationNorm * transportFactor * coolingBoost * 1.22)
    );
    this.condensationNorm += (targetCondensation - this.condensationNorm) * lerpMed;

    const targetCloudMoisture = Math.round(
      Math.max(12, Math.min(100, this.condensationNorm * 98 + (this.params.stormUpdrafts ? 12 : 0)))
    );
    this.cloudMoisture += (targetCloudMoisture - this.cloudMoisture) * lerpMed;

    // 3. PRECIPITATION (Rain, Snow, Sleet, or Hail - SC.5.E.7.4)
    // Tuned so even mild/cloudy stages clearly display active rainfall unless sun & wind are near 0
    const cloud01 = this.cloudMoisture / 100;
    const rawPrecip = cloud01 > 0.13 ? Math.pow((cloud01 - 0.13) / 0.87, 0.85) : 0;
    const stormMultiplier = this.params.stormUpdrafts ? 1.24 : 1.08;
    const targetPrecip = Math.max(0, Math.min(1.0, rawPrecip * stormMultiplier));
    this.precipNorm += (targetPrecip - this.precipNorm) * lerpMed;

    let precipType = 'None';
    let precipState = 'None';
    if (this.precipNorm >= 0.04) {
      if (this.params.stormUpdrafts && this.cloudMoisture >= 42 && this.params.airTempC > 4) {
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
    let targetSnowpack = 0.08;
    if (this.params.airTempC <= 0) {
      targetSnowpack = Math.min(1.0, 0.58 + this.precipNorm * 0.42 + (-this.params.airTempC / 12) * 0.2);
    } else if (this.params.airTempC <= 4) {
      targetSnowpack = 0.42 + this.precipNorm * 0.15;
    } else {
      targetSnowpack = Math.max(0.02, 0.34 - temp01 * 0.30 - sun01 * 0.08);
    }
    const prevSnowpack = this.snowpack;
    this.snowpack += (targetSnowpack - this.snowpack) * lerpSlow;
    const snowmeltContribution = Math.max(0, (prevSnowpack - this.snowpack) * 3.5);

    // 5. SURFACE RUNOFF & COLLECTION (Flowing down river valley back to Ocean - SC.5.E.7.2)
    let liquidInput = 0.22; // Clear baseline mountain spring & watershed flow across all weather stages
    if (precipType === 'Rain') {
      liquidInput += this.precipNorm * 0.85;
    } else if (precipType === 'Hail') {
      liquidInput += this.precipNorm * 0.65;
    } else if (precipType === 'Sleet') {
      liquidInput += this.precipNorm * 0.36;
    } else if (precipType === 'Snow') {
      liquidInput += this.precipNorm * 0.14;
    }
    if (this.params.airTempC > 2 && this.snowpack > 0.05) {
      liquidInput += Math.min(0.28, snowmeltContribution + sun01 * temp01 * this.snowpack * 0.35);
    }

    const targetRunoff = Math.max(0.18, Math.min(1.0, liquidInput));
    this.runoffNorm += (targetRunoff - this.runoffNorm) * lerpMed;

    // Populate student-friendly scientific metrics
    const evapLiters = +(this.evaporationNorm * 8.4).toFixed(1);
    const humidity = Math.round(Math.min(99, 32 + this.evaporationNorm * 42 + cloud01 * 26));
    const cloudPct = Math.round(this.cloudMoisture);
    const precipMm = precipType === 'None' ? 0 : +(this.precipNorm * 36.0).toFixed(1);
    const runoffM3 = +(10 + this.runoffNorm * 84).toFixed(1);

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
      return `Low sunlight (${sunlight}%) provides less heat energy to the ocean, slowing evaporation into water vapor.`;
    }
    if (precipType === 'Hail' && stormUpdrafts) {
      return `Strong storm updrafts toss liquid raindrops high into freezing cloud tops, forming solid hailstones!`;
    }
    if (precipType === 'Snow') {
      return `Air temperature is freezing (${airTempC}°C / ${tempF}°F), so cloud moisture falls as solid snow and builds snowpack while lower streams still carry base runoff.`;
    }
    if (precipType === 'Sleet') {
      return `Near-freezing air (${airTempC}°C / ${tempF}°F) freezes falling raindrops into solid sleet pellets before they hit the ground.`;
    }
    if (windSpeed < 5) {
      return `Calm wind (${windSpeed} km/h) keeps more evaporated ocean water vapor near the coast instead of pushing it all up the mountains.`;
    }
    if (precipType === 'Rain' && this.precipNorm > 0.50) {
      return `Strong solar energy heats the ocean, wind pushes water vapor up the cooler mountains to condense into heavy clouds, and rain rushes down as surface runoff!`;
    }
    return `Solar energy evaporates liquid ocean water into water vapor (gas), which cools into clouds, falls as rain, and flows back as runoff.`;
  }
}
