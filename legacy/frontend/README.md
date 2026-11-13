# CarePath frontend

React, TypeScript, and Vite UI for the local Sonipat, Haryana healthcare directory. Hospital and verified doctor discovery, insurer-sourced network listings, and the signed-in user's appointment history use backend APIs. Limited symptom-to-specialty matching runs locally in the browser and is not an AI or diagnosis service.

The interface uses a consistent light design system with soft blue and teal accents, translucent glass cards, responsive public navigation, and a patient dashboard shell. The public landing page previews real published directory results from the API; it does not use sample hospital data. Small CSS transitions and skeleton loading states avoid an extra animation dependency, and motion respects the user's reduced-motion preference. On mobile, dashboard navigation opens as a dismissible drawer. Emergency links open the device phone app for India's emergency number 112; CarePath does not dispatch emergency services. The emergency page can optionally use browser-provided location locally to sort current verified Sonipat hospital records with valid coordinates; it does not transmit the location.

## Requirements

- Node.js 20.19+ or 22.12+
- npm

## Run locally

```sh
npm install
npm run dev
```

Vite prints the local URL when the development server is ready.

## Hospital directory API

Vite listens on `http://127.0.0.1:5174` and proxies `/api` to `http://127.0.0.1:3001`. Start the backend separately. The frontend uses the same relative `/api` base for public and authenticated requests, so browser cookies stay same-origin.

The directory filters exactly to Sonipat and displays no sample facilities. An empty published-hospital response is shown as an empty state, not as a connectivity failure.

The administrative interface is deferred during the initial Sonipat patient-app phase. Frontend `/admin/*` URLs return to the public site; backend admin authentication and authorized verification/publication APIs remain available to protected backend operations. Public directory routes continue to expose only eligible verified and published records.

## Accounts and limitations

Register, login, session restore, protected dashboard, profile updates, and logout use backend cookie sessions. Passwords are stored as salted scrypt hashes; session tokens are HTTP-only cookies and only their hashes are persisted. Profile updates use the existing authenticated CSRF-protected endpoint. Google Sign-In uses Google Identity Services in the browser and sends the ID token to the API for audience/signature/email verification; configure the same Web client ID as `VITE_GOOGLE_CLIENT_ID` in `frontend/.env.local` and `GOOGLE_CLIENT_ID` in `backend/.env`, then apply database migration 008 to `healthcare_platform_test`. An existing password account is not silently linked to a matching Google email. Email ownership verification and password recovery require an email provider, which is not configured. The doctor directory and detail pages only display current verified provider records and their qualifying hospital affiliations; any contact links are hospital contacts, not direct doctor contacts. Insurance filters search only current insurer-sourced records attached to currently verified, published hospitals; they do not verify a patient's policy or coverage. Appointment history distinguishes pending requests from provider-confirmed appointments; only pending requests already associated with the account can be cancelled. Appointment creation, provider scheduling, AI assistance, and ambulance partner dispatch/tracking require integrations that are not available. Symptom guidance uses limited local keyword matching only and does not send or save the entered text.

## Available commands

```sh
npm run build    # Type-check and create a production build in dist/
npm run lint     # Lint the project with Oxlint
npm run preview  # Preview the production build locally
```

## Frontend structure

```text
src/
  auth/        Cookie-backed application-user session context
  components/  Shared navigation, footer, glass cards, skeletons, and directory states
  data/        General specialty categories (not provider listings)
  pages/       Patient dashboard, directories, details, assistants, and emergency information
  utils/       Shared route helpers
  App.tsx      Route definitions and shared page layout
  index.css    Tailwind theme and global styles
  App.css      Responsive layout, visual effects, transitions, and motion preferences
  main.tsx     React entry point and router setup
```
