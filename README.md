# CarePath Sonipat

One app for the moments when getting care goes wrong:

- **SOS** — press and hold. The nearest hospitals with an ambulance on CarePath are alerted in widening rings (8 → 15 → 30 km); the first to accept is assigned. The patient sees the ambulance live on a map with ETA, a slow-traffic warning, and the driver's name, vehicle and phone. If nobody accepts, the app says so and puts **108** one tap away (108/112 are visible on every SOS screen from the first second).
- **Care guide (AI)** — describe the problem in English, Hindi or Hinglish. Claude picks the kind of care, then shows the **nearest suitable** place and the **best option within 100 km if you can travel**, with reasons. A deterministic red-flag screen runs on every message, before the model, and raises the SOS banner.
- **Hospital finder** — 169 Sonipat facilities (government and private) with map, filters, Ayushman status and where each fact comes from.
- **Insurance** — Ayushman (PM-JAY) and private-policy estimator: room-rent capping with proportionate deduction, co-pay, deductible, remaining cover.
- **Appointments** — request a visit; hospitals on CarePath confirm a time.
- **Hospital console** (`/console`) — live SOS alerts with sound, one-tap accept, driver link, fleet, appointments, and a profile form that turns a listing *verified*.
- **Driver page** (`/driver/<link>`) — no app install: shares GPS, navigation, call patient, trip steps.

## Run it

Requires Node.js 22.13+. No database server — data lives in a SQLite file.

```powershell
npm run setup     # installs, creates backend/.env, loads hospitals + demo partners
npm run dev       # API on :3001, web on http://127.0.0.1:5173
```

Demo hospital console: <http://127.0.0.1:5173/console> — usernames `civil-sonipat`, `park-nidaan`, `sdh-gohana`, `sdh-ganaur`, `nawal-kundli`, `chc-kharkhoda`; password `demo-sonipat`. Demo ambulances are labelled `DEMO-xx`, have non-dialable phone numbers, and drive the real road route by themselves once accepted.

To try SOS on a laptop, open the console in one window, then press SOS in another (allow location, or use your browser's dev-tools sensors to set a Sonipat location such as 28.996, 77.022).

**AI care guide:** put `ANTHROPIC_API_KEY=...` in `backend/.env` (model `claude-opus-5-5`). Without it the guide falls back to keyword matching and says so.

```powershell
npm test          # 44 backend tests: triage, ranking, claim maths, dispatch races, API security
npm run typecheck
```

## How it is built

```
frontend/        what people see — React 19 + Vite + Tailwind 4 + Leaflet/OpenStreetMap, mobile-first PWA (port 5173)
  src/pages/       one file per screen: home/SOS, care guide, hospitals, insurance, console, driver
  src/components/  shared pieces: SOS button, map, hospital card
  src/lib/         API client, hooks, formatting
backend/         the API — Express 5 + TypeScript + node:sqlite (port 3001)
  src/domain/      pure logic: specialties, triage red flags, ranking, insurance maths, geo
  src/services/    dispatch engine (waves, atomic first-accept, live ETA, simulator), assistant, hospitals
  src/routes/      public, patient, console, driver
  scripts/         seed the database, create hospital console logins
  tests/           automated tests
data/            hospital data and the tools that build it (see data/README.md)
  raw/             government PDFs, OpenStreetMap extracts
  manual/          hand-reviewed hospital ↔ location links
  processed/       cleaned CSVs + sonipat_facilities.json (what the backend loads)
  pipeline/        PDF extractor (Python) and dataset builder
scripts/         dev.mjs — starts backend + frontend together
```

The previous version of the app was removed in Nov 2026; it is still in git history (first commit `16257ac`).

Key decisions:

- **No login before SOS.** Patients are a device cookie; the phone number is asked once and remembered. Hospitals see only a ~1 km area and distance until they accept; the exact pickup point and phone go only to the hospital that accepts.
- **"First to pick up" means first to *accept*.** A ringing phone answered by a receptionist is not a committed ambulance. Acceptance is an atomic conditional update; a second accept gets "another hospital already accepted". `NOTIFY_MODE=webhook` posts each alert as JSON so an IVR (Exotel/Twilio: "press 1 to accept") can call the accept API.
- **Honest data.** Every specialty carries its source — *confirmed by hospital*, *OpenStreetMap*, *from facility name*, or *expected for this facility level* (IPHS norms). The UI says which, and tells people to call ahead when it isn't confirmed. Ranking uses facility level, specialty evidence, beds, 24×7 emergency, PM-JAY and distance — there are no public outcome or quality ratings, so the app does not pretend to have them.
- **Traffic.** OSRM gives road distance and ETA but has no live traffic. The backend compares the ambulance's actual progress with the route and warns "moving slowly — likely traffic". For traffic-aware ETAs, swap in Mappls or Google Routes behind `backend/src/lib/routing.ts`.

## Where the data comes from

| Data | Source | Notes |
|---|---|---|
| 76 hospitals, Ayushman desk contacts | AB-PMJAY empanelled list, District Sonipat, as on 03-08-2026 | extracted from `data/raw/*.pdf` |
| CHC/PHC network, beds | Haryana Health Dept facility list (05-05-2025) | |
| Coordinates, addresses, 90+ more facilities | OpenStreetMap (ODbL), fetched Nov 2026 | attribution shown in app |
| Roster → location links | `data/manual/pmjay_location_matches.json` | hand-reviewed; every link written down |

143 of 169 facilities have a location. The other 26 (mostly private hospitals missing from OSM, plus a few village PHCs) are listed but not ranked by distance until the hospital sets its pin in the console. Rebuild with `npm run data:build` then `npm run data:import`.

## Before real patients use it

1. **Hospital agreements** — onboard real hospitals (`npm run console:create-user --prefix backend -- <hospital-id> <username>`) and agree response expectations. SOS only reaches hospitals with an *available* ambulance on CarePath.
2. **Phone OTP** for patients, so a callback number is verified.
3. **Telephony** — IVR alert to each hospital's emergency desk in addition to the console.
4. **Routing/traffic provider** with a commercial licence (the public OSRM server is for development).
5. **Hosting** — one Node process behind HTTPS (`npm run build && npm start` serves the frontend too). For several instances, move SSE pub/sub to Redis and the database to Postgres/PostGIS.
6. **Legal/clinical review** of the assistant prompt and the DPDP Act 2023 privacy notice.

## Expanding to NCR

The app is not tied to Sonipat except through data. For each new district: add its PM-JAY list and OSM extract to `data/`, extend the match file, and widen the bounds in `data/pipeline/build-hospital-dataset.mjs` and the profile-pin bounds in `backend/src/routes/console.ts`. Ranking already looks 100 km out, so Delhi and Rohtak tertiary hospitals will appear as "best if you can travel" for Sonipat users once their data is loaded.
