# Water Cycle Unit 8 Simulation (HydroSphere 3D)

Interactive 3D coastal mountain-to-ocean **Water Cycle** educational simulation built with **Three.js** and **Vite**, aligned to **Florida 5th Grade Science Standards (`SC.5.E.7.1` – `SC.5.E.7.4`)**.

## Features
- **3D Coastal Mountain-to-Ocean Landscape**: Procedural PBR mountain peaks, alpine glacial tarn, cascading waterfall, meandering river valley, sandy beach, and planar-reflective ocean (`THREE.Water`).
- **4 Core Water Cycle Stages**:
  1. **Evaporation** (warm sunlit ocean steam plumes & mist rising as liquid water turns to water vapor gas)
  2. **Condensation** (cooling water vapor → cumulus & storm cumulonimbus clouds)
  3. **Precipitation** (prominent 3D wind-slanted **Rain** streaks, volumetric downpour curtains & splash rings, plus solid **Snow**, **Sleet**, and bouncing **Hail** based on air temperature in `°C` / `°F` and storm updrafts)
  4. **Surface Runoff & Ocean Collection** (7 bold mountainside runoff channels, rushing waterfall, meandering river, and ocean estuary plume returning water to the ocean, which holds ~97% of Earth's water)
- **Florida Grade 5 Scope & Limits**: Respects FLDOE Statewide Science Assessment Grade 5 content limits (excludes untested terms like *transpiration*, *infiltration*, *percolation*, and molecular kinetic formulas).
- **Classroom Presentation & Student Tools**:
  - **Stage Display Visibility & Spotlight Controls** (`25%`–`250%` live display boost sliders + one-click **Spotlight Evap**, **Spotlight Rain**, **Spotlight Runoff**, and **Boost All 200%** buttons for classroom instruction)
  - Interactive **Weather Controls** & quick scenario presets
  - **How to Use & Standards** modal
  - **Student Lab Data Sheet** with trial logging, reflection prompts, **CSV Export**, and **Print Sheet**
  - **Focus 3D** mode & **Reset All**

## Local Development

```bash
npm install
npm run dev
```

## Deploying to Netlify
This repository includes a preconfigured [`netlify.toml`](./netlify.toml):
- **Build command**: `npm run build`
- **Publish directory**: `dist`

Simply click **Add new site → Import an existing project** in Netlify and select this GitHub repository.
