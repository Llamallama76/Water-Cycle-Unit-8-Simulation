import * as THREE from 'three';
import { celsiusToFahrenheit } from '../simulation/waterCycleModel.js';
import { getRiverCenterZ } from '../world/terrain.js';

export const STAGE_INFO = {
  evaporation: {
    tag: 'Stage 1 · SC.5.E.7.1 & 7.2',
    title: 'Evaporation from the Ocean',
    state: 'Liquid → Gas (Water Vapor)',
    desc:
      "Holding about 97% of Earth's water, the ocean is the main engine of the water cycle. Heat energy from sunlight warms liquid ocean water so it evaporates into invisible water vapor gas, leaving ocean salt behind!",
    camKey: 'evaporation',
  },
  condensation: {
    tag: 'Stage 2 · SC.5.E.7.1 & 7.3',
    title: 'Condensation into Clouds',
    state: 'Gas → Tiny Liquid Droplets / Ice',
    desc:
      'Sea-breeze winds push warm, moist air inland and up the cooler mountain slopes. As rising water vapor cools high in the sky, it condenses back into millions of tiny liquid water droplets or ice crystals to form clouds.',
    camKey: 'condensation',
  },
  precipitation: {
    tag: 'Stage 3 · SC.5.E.7.1 & 7.4',
    title: 'Precipitation (Rain, Snow, Sleet, Hail)',
    state: 'Liquid Rain or Solid Ice',
    desc:
      'When condensed water droplets in clouds grow too heavy to stay suspended in the air, gravity pulls them down! Air temperature and storm updrafts determine whether it falls as liquid rain or solid snow, sleet, or hail.',
    camKey: 'precipitation',
  },
  runoff: {
    tag: 'Stage 4 · SC.5.E.7.1 & 7.2',
    title: 'Surface Runoff & Collection',
    state: 'Liquid Water (or Melting Solid Snow)',
    desc:
      'Rainwater and melting mountain snow flow downhill across the land into streams, plunging down the waterfall and winding river back into lakes and the ocean—connecting all of Earth’s water reservoirs!',
    camKey: 'runoff',
  },
  ocean: {
    tag: 'Earth Reservoir · SC.5.E.7.2',
    title: "The Ocean (97% of Earth's Water)",
    state: 'Liquid Saltwater Reservoir',
    desc:
      'The ocean is connected to every freshwater lake, river, and mountain snowcap on Earth through evaporation and precipitation. Most rainwater on land originally evaporated from the ocean!',
    camKey: 'evaporation',
  },
};

export function createHudController({ sim, camera, setCameraPreset }) {
  const labelsLayer = document.getElementById('labels-layer');

  // Top telemetry elements
  const hudEvapVal = document.getElementById('hud-evap-val');
  const hudCloudVal = document.getElementById('hud-cloud-val');
  const hudPrecipVal = document.getElementById('hud-precip-val');
  const hudRunoffVal = document.getElementById('hud-runoff-val');

  // Controls
  const sliderSunlight = document.getElementById('slider-sunlight');
  const sliderTemp = document.getElementById('slider-temp');
  const sliderWind = document.getElementById('slider-wind');
  const toggleUpdrafts = document.getElementById('toggle-updrafts');

  const valSunlight = document.getElementById('val-sunlight');
  const valTemp = document.getElementById('val-temp');
  const valWind = document.getElementById('val-wind');

  // Stage Display Visibility (Classroom Teacher Boost)
  const sliderVisEvap = document.getElementById('slider-vis-evap');
  const sliderVisRain = document.getElementById('slider-vis-rain');
  const sliderVisRunoff = document.getElementById('slider-vis-runoff');
  const valVisEvap = document.getElementById('val-vis-evap');
  const valVisRain = document.getElementById('val-vis-rain');
  const valVisRunoff = document.getElementById('val-vis-runoff');
  const btnVisReset = document.getElementById('btn-vis-reset');
  const spotlightBtns = Array.from(document.querySelectorAll('.spotlight-chip'));

  const controlsDock = document.getElementById('controls-dock');
  const btnCollapseDock = document.getElementById('btn-collapse-dock');
  const dockChevron = document.getElementById('dock-chevron');

  const btnToggleArrows = document.getElementById('btn-toggle-arrows');
  const btnToggleLabels = document.getElementById('btn-toggle-labels');
  const speedBtns = Array.from(document.querySelectorAll('.speed-btn'));
  const presetBtns = Array.from(document.querySelectorAll('.preset-btn'));
  const camBtns = Array.from(document.querySelectorAll('.cam-btn'));

  // Inspector Card
  const inspectorCard = document.getElementById('inspector-card');
  const inspTag = document.getElementById('insp-tag');
  const inspTitle = document.getElementById('insp-title');
  const inspState = document.getElementById('insp-state');
  const inspDesc = document.getElementById('insp-desc');
  const inspLiveNote = document.getElementById('insp-live-note');
  const btnCloseInspector = document.getElementById('btn-close-inspector');

  // Top Header Buttons & Modals
  const btnInstructions = document.getElementById('btn-instructions');
  const modalInstructions = document.getElementById('modal-instructions');
  const btnCloseInstructions = document.getElementById('btn-close-instructions');
  const tabBtns = Array.from(document.querySelectorAll('.tab-btn'));

  const btnDatasheet = document.getElementById('btn-datasheet');
  const modalDatasheet = document.getElementById('modal-datasheet');
  const btnCloseDatasheet = document.getElementById('btn-close-datasheet');
  const trialCountBadge = document.getElementById('trial-count-badge');
  const dsLiveReadout = document.getElementById('ds-live-readout');
  const trialsTbody = document.getElementById('trials-tbody');
  const btnRecordTrial = document.getElementById('btn-record-trial');
  const btnQuickRecord = document.getElementById('btn-quick-record');
  const btnExportCsv = document.getElementById('btn-export-csv');
  const btnPrintSheet = document.getElementById('btn-print-sheet');
  const btnClearTrials = document.getElementById('btn-clear-trials');

  const btnFocusMode = document.getElementById('btn-focus-mode');
  const focusModeLabel = document.getElementById('focus-mode-label');
  const btnResetAll = document.getElementById('btn-reset-all');
  const toastBanner = document.getElementById('toast-banner');

  const labInputs = [
    document.getElementById('lab-q1'),
    document.getElementById('lab-q2'),
    document.getElementById('lab-q3'),
  ];

  let activeStageKey = 'evaporation';
  let trials = [];
  let nextTrialNumber = 1;
  let toastTimer = null;

  function showToast(msg) {
    toastBanner.textContent = msg;
    toastBanner.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastBanner.classList.add('hidden');
    }, 2800);
  }

  // Create 3D Projected Pins
  const pinConfigs = [
    {
      key: 'evaporation',
      label: '1. Evaporation',
      subId: 'pin-sub-evap',
      subDefault: 'Liquid → Gas',
      dotClass: 'amber',
      pos: new THREE.Vector3(45, 9.5, 6),
    },
    {
      key: 'condensation',
      label: '2. Condensation',
      subId: 'pin-sub-cond',
      subDefault: 'Clouds',
      dotClass: 'sky',
      pos: new THREE.Vector3(-28, 41.5, -2),
    },
    {
      key: 'precipitation',
      label: '3. Precipitation',
      subId: 'pin-sub-prec',
      subDefault: 'Rainfall',
      dotClass: 'cyan',
      pos: new THREE.Vector3(-38, 25.0, 5),
    },
    {
      key: 'runoff',
      label: '4. Surface Runoff',
      subId: 'pin-sub-run',
      subDefault: 'River Flow',
      dotClass: 'teal',
      pos: new THREE.Vector3(-12, 6.8, getRiverCenterZ(-12)),
    },
    {
      key: 'ocean',
      label: 'Ocean (97% Water)',
      subId: 'pin-sub-ocean',
      subDefault: 'Main Reservoir',
      dotClass: 'cyan',
      pos: new THREE.Vector3(56, 2.2, 32),
    },
  ];

  const pinElements = pinConfigs.map((cfg) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `stage-pin${cfg.key === activeStageKey ? ' active' : ''}`;
    btn.innerHTML = `
      <span class="pin-dot ${cfg.dotClass}"></span>
      <span>${cfg.label}</span>
      <span class="pin-sub" id="${cfg.subId}">${cfg.subDefault}</span>
    `;
    btn.addEventListener('click', () => {
      selectStage(cfg.key, true);
    });
    labelsLayer.appendChild(btn);
    return { ...cfg, el: btn, subEl: btn.querySelector('.pin-sub') };
  });

  function selectStage(stageKey, moveCam = false) {
    activeStageKey = stageKey;
    const info = STAGE_INFO[stageKey] || STAGE_INFO.evaporation;
    inspTag.textContent = info.tag;
    inspTitle.textContent = info.title;
    inspState.textContent = info.state;
    inspDesc.textContent = info.desc;
    inspectorCard.classList.remove('hidden');

    pinElements.forEach((p) => {
      p.el.classList.toggle('active', p.key === stageKey);
    });

    if (moveCam && info.camKey) {
      setCameraPreset(info.camKey);
      highlightCamButton(info.camKey);
    }
  }

  function highlightCamButton(camKey) {
    camBtns.forEach((b) => b.classList.toggle('active', b.dataset.cam === camKey));
  }

  function clearActivePresetButtons() {
    presetBtns.forEach((b) => b.classList.remove('active'));
  }

  function clearActiveSpotlightButtons() {
    spotlightBtns.forEach((b) => b.classList.remove('active'));
  }

  function syncVisibilityControls() {
    const p = sim.params;
    sliderVisEvap.value = String(p.evapVisibility);
    sliderVisRain.value = String(p.rainVisibility);
    sliderVisRunoff.value = String(p.runoffVisibility);
    valVisEvap.textContent = `${p.evapVisibility}%`;
    valVisRain.textContent = `${p.rainVisibility}%`;
    valVisRunoff.textContent = `${p.runoffVisibility}%`;
  }

  function syncControlsFromSim() {
    const p = sim.params;
    sliderSunlight.value = String(p.sunlight);
    sliderTemp.value = String(p.airTempC);
    sliderWind.value = String(p.windSpeed);
    toggleUpdrafts.checked = p.stormUpdrafts;

    valSunlight.textContent = `${p.sunlight}%`;
    valTemp.textContent = `${p.airTempC}°C (${celsiusToFahrenheit(p.airTempC)}°F)`;
    valWind.textContent = `${p.windSpeed} km/h`;

    syncVisibilityControls();
    if (p.evapVisibility === 100 && p.rainVisibility === 100 && p.runoffVisibility === 100) {
      clearActiveSpotlightButtons();
    }

    btnToggleArrows.classList.toggle('active', p.showFlowArrows);
    btnToggleLabels.classList.toggle('active', p.showLabels);
    labelsLayer.style.display = p.showLabels ? 'block' : 'none';

    speedBtns.forEach((b) => {
      b.classList.toggle('active', Number(b.dataset.speed) === p.timeScale);
    });
  }

  // Wire Weather Sliders
  sliderSunlight.addEventListener('input', () => {
    sim.params.sunlight = Number(sliderSunlight.value);
    valSunlight.textContent = `${sim.params.sunlight}%`;
    clearActivePresetButtons();
  });

  sliderTemp.addEventListener('input', () => {
    sim.params.airTempC = Number(sliderTemp.value);
    valTemp.textContent = `${sim.params.airTempC}°C (${celsiusToFahrenheit(sim.params.airTempC)}°F)`;
    clearActivePresetButtons();
  });

  sliderWind.addEventListener('input', () => {
    sim.params.windSpeed = Number(sliderWind.value);
    valWind.textContent = `${sim.params.windSpeed} km/h`;
    clearActivePresetButtons();
  });

  toggleUpdrafts.addEventListener('change', () => {
    sim.params.stormUpdrafts = toggleUpdrafts.checked;
    clearActivePresetButtons();
    if (toggleUpdrafts.checked) {
      selectStage('precipitation', false);
      showToast('Storm updrafts enabled: watch raindrops freeze into solid Hail!');
    }
  });

  // Wire Stage Display Visibility Sliders & Classroom Spotlights
  sliderVisEvap.addEventListener('input', () => {
    sim.params.evapVisibility = Number(sliderVisEvap.value);
    valVisEvap.textContent = `${sim.params.evapVisibility}%`;
    clearActiveSpotlightButtons();
  });

  sliderVisRain.addEventListener('input', () => {
    sim.params.rainVisibility = Number(sliderVisRain.value);
    valVisRain.textContent = `${sim.params.rainVisibility}%`;
    clearActiveSpotlightButtons();
  });

  sliderVisRunoff.addEventListener('input', () => {
    sim.params.runoffVisibility = Number(sliderVisRunoff.value);
    valVisRunoff.textContent = `${sim.params.runoffVisibility}%`;
    clearActiveSpotlightButtons();
  });

  btnVisReset.addEventListener('click', () => {
    sim.params.evapVisibility = 100;
    sim.params.rainVisibility = 100;
    sim.params.runoffVisibility = 100;
    syncVisibilityControls();
    clearActiveSpotlightButtons();
    showToast('Stage display visibility restored to 100% default.');
  });

  spotlightBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.spotlight;
      const alreadyActive = btn.classList.contains('active');
      if (alreadyActive) {
        sim.params.evapVisibility = 100;
        sim.params.rainVisibility = 100;
        sim.params.runoffVisibility = 100;
        syncVisibilityControls();
        clearActiveSpotlightButtons();
        showToast('Display spotlight turned off (100% standard visibility).');
        return;
      }

      if (mode === 'evap') {
        sim.params.evapVisibility = 225;
        sim.params.rainVisibility = 85;
        sim.params.runoffVisibility = 85;
        selectStage('evaporation', false);
        showToast('Spotlight: Ocean Evaporation boosted to 225%!');
      } else if (mode === 'rain') {
        sim.params.evapVisibility = 85;
        sim.params.rainVisibility = 225;
        sim.params.runoffVisibility = 110;
        selectStage('precipitation', false);
        if (sim.metrics.precipitationType !== 'Rain') {
          showToast(
            `Rainfall boosted to 225% (currently falling as ${sim.metrics.precipitationType} — warm air above 2°C without updrafts for liquid Rain).`
          );
        } else {
          showToast('Spotlight: Rainfall & Rain Curtains boosted to 225%!');
        }
      } else if (mode === 'runoff') {
        sim.params.evapVisibility = 85;
        sim.params.rainVisibility = 100;
        sim.params.runoffVisibility = 225;
        selectStage('runoff', false);
        showToast('Spotlight: Mountainside & River Runoff boosted to 225%!');
      } else if (mode === 'all') {
        sim.params.evapVisibility = 200;
        sim.params.rainVisibility = 200;
        sim.params.runoffVisibility = 200;
        showToast('Classroom Boost: Evaporation, Rainfall, and Runoff set to 200%!');
      }

      syncVisibilityControls();
      spotlightBtns.forEach((b) => b.classList.toggle('active', b === btn));
    });
  });

  // Scenario Presets
  presetBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.preset;
      sim.applyPreset(key);
      syncControlsFromSim();
      presetBtns.forEach((b) => b.classList.toggle('active', b === btn));
      showToast(`Applied weather scenario: ${btn.textContent.trim()}`);
    });
  });

  // Overlays & Speed
  btnToggleArrows.addEventListener('click', () => {
    sim.params.showFlowArrows = !sim.params.showFlowArrows;
    btnToggleArrows.classList.toggle('active', sim.params.showFlowArrows);
  });

  btnToggleLabels.addEventListener('click', () => {
    sim.params.showLabels = !sim.params.showLabels;
    btnToggleLabels.classList.toggle('active', sim.params.showLabels);
    labelsLayer.style.display = sim.params.showLabels ? 'block' : 'none';
  });

  speedBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      sim.params.timeScale = Number(btn.dataset.speed);
      speedBtns.forEach((b) => b.classList.toggle('active', b === btn));
    });
  });

  // Dock collapse
  btnCollapseDock.addEventListener('click', () => {
    const collapsed = controlsDock.classList.toggle('collapsed');
    dockChevron.style.transform = collapsed ? 'rotate(180deg)' : 'rotate(0deg)';
  });

  btnCloseInspector.addEventListener('click', () => {
    inspectorCard.classList.add('hidden');
  });

  // Bottom Camera Switcher
  camBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const camKey = btn.dataset.cam;
      setCameraPreset(camKey);
      highlightCamButton(camKey);
      if (STAGE_INFO[camKey]) {
        selectStage(camKey, false);
      }
    });
  });

  // Focus 3D Mode
  btnFocusMode.addEventListener('click', () => {
    const active = document.body.classList.toggle('focus-3d-mode');
    focusModeLabel.textContent = active ? 'Show Controls' : 'Focus 3D';
  });

  // Instructions Modal & Tabs
  btnInstructions.addEventListener('click', () => {
    modalInstructions.classList.remove('hidden');
  });
  btnCloseInstructions.addEventListener('click', () => {
    modalInstructions.classList.add('hidden');
  });
  modalInstructions.addEventListener('click', (e) => {
    if (e.target === modalInstructions) modalInstructions.classList.add('hidden');
  });

  tabBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      tabBtns.forEach((b) => b.classList.toggle('active', b === btn));
      const targetId = btn.dataset.tab;
      document.getElementById('tab-howto').style.display = targetId === 'tab-howto' ? 'flex' : 'none';
      document.getElementById('tab-standards').style.display =
        targetId === 'tab-standards' ? 'flex' : 'none';
    });
  });

  // Data Sheet Modal & Trial Logging
  btnDatasheet.addEventListener('click', () => {
    modalDatasheet.classList.remove('hidden');
  });
  btnCloseDatasheet.addEventListener('click', () => {
    modalDatasheet.classList.add('hidden');
  });
  modalDatasheet.addEventListener('click', (e) => {
    if (e.target === modalDatasheet) modalDatasheet.classList.add('hidden');
  });

  function recordTrial() {
    const p = sim.params;
    const m = sim.metrics;
    const tempF = celsiusToFahrenheit(p.airTempC);

    const row = {
      id: nextTrialNumber++,
      sunlight: `${p.sunlight}%`,
      temp: `${p.airTempC}°C (${tempF}°F)`,
      wind: `${p.windSpeed} km/h${p.stormUpdrafts ? ' + Updraft' : ''}`,
      evap: `${m.evaporationRate} L/m²/h`,
      clouds: `${m.cloudCoverPercent}%`,
      precip:
        m.precipitationType === 'None'
          ? 'None (0 mm/h)'
          : `${m.precipitationType} (${m.precipitationState}) · ${m.precipitationRate} mm/h`,
      runoff: `${m.runoffFlow} m³/s`,
      states: m.activeStates.join(', '),
    };

    trials.push(row);
    renderTrialsTable();
    showToast(`Recorded Trial #${row.id} to Lab Data Sheet!`);
  }

  function renderTrialsTable() {
    trialCountBadge.textContent = String(trials.length);

    if (trials.length === 0) {
      trialsTbody.innerHTML = `
        <tr class="empty-row">
          <td colspan="10">
            No trials logged yet. Change Sunlight or Air Temperature and click <strong>+ Record Current Trial</strong> to compare results!
          </td>
        </tr>
      `;
      return;
    }

    trialsTbody.innerHTML = trials
      .map(
        (t) => `
        <tr>
          <td><strong>#${t.id}</strong></td>
          <td>${t.sunlight}</td>
          <td>${t.temp}</td>
          <td>${t.wind}</td>
          <td>${t.evap}</td>
          <td>${t.clouds}</td>
          <td>${t.precip}</td>
          <td>${t.runoff}</td>
          <td>${t.states}</td>
          <td class="datasheet-actions-bar">
            <button class="icon-btn del-trial-btn" data-id="${t.id}" type="button" title="Remove row">✕</button>
          </td>
        </tr>
      `
      )
      .join('');

    trialsTbody.querySelectorAll('.del-trial-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = Number(btn.dataset.id);
        trials = trials.filter((r) => r.id !== id);
        renderTrialsTable();
      });
    });
  }

  btnRecordTrial.addEventListener('click', recordTrial);
  btnQuickRecord.addEventListener('click', recordTrial);

  btnClearTrials.addEventListener('click', () => {
    trials = [];
    nextTrialNumber = 1;
    renderTrialsTable();
    showToast('Cleared recorded trials table.');
  });

  btnExportCsv.addEventListener('click', () => {
    if (trials.length === 0) {
      showToast('Record at least one trial first before exporting CSV!');
      return;
    }
    const headers = [
      'Trial',
      'Sunlight',
      'Air Temperature',
      'Wind & Updrafts',
      'Evaporation Rate',
      'Cloud Cover',
      'Precipitation',
      'River Runoff',
      'States of Water',
    ];
    const escapeCsv = (s) => `"${String(s).replace(/"/g, '""')}"`;
    const lines = [
      headers.join(','),
      ...trials.map((t) =>
        [t.id, t.sunlight, t.temp, t.wind, t.evap, t.clouds, t.precip, t.runoff, t.states]
          .map(escapeCsv)
          .join(',')
      ),
      '',
      '"Question 1 (Solar Energy & Evaporation)"',
      escapeCsv(labInputs[0].value || ''),
      '"Question 2 (States of Water & Precipitation)"',
      escapeCsv(labInputs[1].value || ''),
      '"Question 3 (Connecting Ocean & River Reservoirs)"',
      escapeCsv(labInputs[2].value || ''),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'florida-5th-grade-water-cycle-datasheet.csv';
    a.click();
    URL.revokeObjectURL(url);
    showToast('Downloaded Lab Data Sheet CSV!');
  });

  btnPrintSheet.addEventListener('click', () => {
    window.print();
  });

  // Escape key closes any open modal
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      modalInstructions.classList.add('hidden');
      modalDatasheet.classList.add('hidden');
    }
  });

  // RESET ALL FUNCTION (Restores sliders, water cycle reservoirs, camera, UI, and data sheet!)
  btnResetAll.addEventListener('click', () => {
    sim.reset();
    trials = [];
    nextTrialNumber = 1;
    labInputs.forEach((inp) => {
      inp.value = '';
    });
    renderTrialsTable();

    document.body.classList.remove('focus-3d-mode');
    focusModeLabel.textContent = 'Focus 3D';
    controlsDock.classList.remove('collapsed');
    dockChevron.style.transform = 'rotate(0deg)';
    modalInstructions.classList.add('hidden');
    modalDatasheet.classList.add('hidden');

    syncControlsFromSim();
    presetBtns.forEach((b) => b.classList.toggle('active', b.dataset.preset === 'floridaSunny'));
    selectStage('evaporation', false);
    setCameraPreset('overview');
    highlightCamButton('overview');

    showToast('Reset complete — weather, 3D cycle, camera, and data sheet restored!');
  });

  // Initial sync
  syncControlsFromSim();

  const projVec = new THREE.Vector3();

  return {
    update() {
      const m = sim.metrics;
      const p = sim.params;
      const tempF = celsiusToFahrenheit(p.airTempC);

      // Update Top Telemetry Bar
      hudEvapVal.textContent = `${m.evaporationRate.toFixed(1)} L/m²/h`;
      hudCloudVal.textContent = `${m.cloudCoverPercent}% Clouds`;
      hudPrecipVal.textContent =
        m.precipitationType === 'None'
          ? 'Dry · 0 mm/h'
          : `${m.precipitationType} · ${m.precipitationRate.toFixed(1)} mm/h`;
      hudRunoffVal.textContent = `${m.runoffFlow.toFixed(1)} m³/s`;

      // Update Inspector live observation note
      inspLiveNote.textContent = m.summaryNote;
      if (activeStageKey === 'precipitation') {
        inspState.textContent =
          m.precipitationType === 'None'
            ? 'No Active Precipitation'
            : `${m.precipitationType} (${m.precipitationState} Water)`;
      }

      // Update Data Sheet live summary line
      dsLiveReadout.textContent = `Current: Sunlight ${p.sunlight}% · Temp ${p.airTempC}°C (${tempF}°F) · Wind ${p.windSpeed} km/h · Precip: ${m.precipitationType} (${m.precipitationRate} mm/h) · Runoff: ${m.runoffFlow} m³/s`;

      // Project 3D Stage Pins onto 2D screen coordinates
      if (p.showLabels) {
        const w = window.innerWidth;
        const h = window.innerHeight;

        pinElements[0].subEl.textContent = `${m.evaporationRate.toFixed(1)} L/m²/h`;
        pinElements[1].subEl.textContent = `${m.cloudCoverPercent}% Clouds`;
        pinElements[2].subEl.textContent =
          m.precipitationType === 'None' ? 'Clear Sky' : `${m.precipitationType} (${m.precipitationState})`;
        pinElements[3].subEl.textContent = `${m.runoffFlow.toFixed(0)} m³/s`;

        for (const pin of pinElements) {
          projVec.copy(pin.pos).project(camera);
          if (projVec.z > 1.0) {
            pin.el.style.opacity = '0';
            pin.el.style.pointerEvents = 'none';
            continue;
          }
          const sx = (projVec.x * 0.5 + 0.5) * w;
          const sy = (-projVec.y * 0.5 + 0.5) * h;

          const inBounds = sx > 40 && sx < w - 40 && sy > 58 && sy < h - 48;
          pin.el.style.opacity = inBounds ? '1' : '0';
          pin.el.style.pointerEvents = inBounds ? 'auto' : 'none';
          pin.el.style.transform = `translate3d(${sx.toFixed(1)}px, ${sy.toFixed(1)}px, 0) translate(-50%, -100%)`;
        }
      }
    },
  };
}
