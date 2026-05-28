# NOVA LAUNCH — Mission Control Dashboard

Interactive prototype of the ARTEMIS VII rocket launch dashboard. A self-running
launch simulation: terminal countdown, liftoff, powered ascent with live
telemetry, Max-Q, staging, second-stage burn, and orbit insertion. The mission
loops automatically.

Built from the Pencil design (`pencil-new.pen`, frame "Rocket Launch Dashboard")
using its dark theme tokens: orange + violet accents, JetBrains Mono, surfaces
`#0A0A0F` / `#12121A` / `#1A1A24`.

## Run locally

```bash
npm install
npm start
# http://localhost:3000
```

## Stack

- Static HTML / CSS / vanilla JS (no build step)
- Express serves `public/` and a `/healthz` endpoint
- Deployed on Railway (NIXPACKS, `node server.js`)
