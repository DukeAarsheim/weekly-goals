# Weekly Goals

A personal weekly goal tracker: set goals each week (with optional "N times per week" targets), check them off, keep weekly notes, and define recurring goals that fill every new week. Works offline and installs to a phone home screen.

## Run locally

    npm start        # http://localhost:8080
    npm test         # unit tests (Node 18+)

## Install on your phone

Serve the folder over HTTPS (any static host, e.g. GitHub Pages or Netlify), open it on your phone, and use "Add to Home screen". Service workers do not work from `file://`.

## Your data

Everything is stored in this browser's `localStorage` on this device only. Use **Data → Export backup** regularly, and **Import** to move to another device.

## Updating

When you change any cached file, bump `CACHE` in `sw.js` so installed copies refresh.
