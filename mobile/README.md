# Axten HR (mobile)

Android/iOS app for the HR module: employee self-service, manager approvals and the HR portal, in one app.
Talks to the Axten OS backend through `/api/v1` (contract: `../docs/HR_MOBILE_API.md`). Expo SDK 58 + Expo Router + TypeScript.

## Structure
```
src/app/            screens (file = route)
  login.tsx           username/password (+ MFA step)
  (app)/_layout.tsx   tabs, built from server `capabilities`
  (app)/index.tsx     Home: punch in/out, today, month, leave balance
  (app)/attendance/   month calendar, correction requests
  (app)/leave/        balances, requests, apply
  (app)/team/         manager approvals
  (app)/hr/           HR dashboard, employees, daily, monthly, requests, roster, settings, devices
  (app)/me/           profile, edit, roster
src/api/            client.ts (auth + refresh), types.ts, hr.ts (one function per endpoint)
src/auth/           secure token storage, AuthContext
src/location/       GPS fix + mock-location / accuracy checks
src/components/     ui kit, calendar, pickers, sheets
```

## Run on your phone (development)
```bash
cd mobile
npm install
EXPO_PUBLIC_API_URL=https://axtenos.com npx expo start
```
Scan the QR with **Expo Go** (Android). Needs the `/api/v1` backend to be deployed at that URL.

## Build the APK (private distribution)
```bash
npm i -g eas-cli
eas login
eas build -p android --profile preview      # → installable .apk, link shown when done
```
First run asks to create an Android keystore: let EAS generate it, then `eas credentials` → download a backup.
`EXPO_PUBLIC_API_URL` for builds is set per profile in `eas.json`.

Before each release bump `version` in `app.json` and `android.versionCode`.

## Notes
- All tokens live in the OS keystore (`expo-secure-store`). A per-install device id binds the refresh token.
- Punching needs a GPS fix with accuracy ≤150 m and no mock location; the server enforces the geofence.
- `metro.config.js` hides the parent repo's `node_modules` so the bundle never picks up the web app's React.
- Icons/splash are still the Expo template placeholders: replace `assets/*.png` with Axten branding.
