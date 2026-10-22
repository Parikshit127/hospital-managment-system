# HR Mobile API (`/api/v1`)

Backend for the private-APK HR app (Expo / React Native, to be built in `mobile/`). Employee, manager and HR
features all go through the same HR engine and server actions as the web portal, so rules never diverge.

## Auth model
- `POST /auth/login` `{ username, password, device:{deviceId,deviceName?,platform?,appVersion?}, location?:{lat,lng,accuracy?} }`
  → `{ accessToken, refreshToken, expiresIn, user, organization, employee, capabilities, geofence }`.
  Login location is stored on the device session (HR can see it). Roles that need MFA get `{ mfaRequired, mfaToken }`
  → `POST /auth/mfa { mfaToken, code }`.
- Access token: 30 min, `Authorization: Bearer`. Refresh token: 30 days, **rotates on every use**
  (`POST /auth/refresh { refreshToken, deviceId }`). Replaying a rotated-out token revokes the session.
- A new login on the same device replaces the old session. `POST /auth/logout` signs the device out.
- Role change → next call returns `401 token_expired` (app refreshes and gets the new role). Disabled user / revoked
  device → `401 revoked` (app must show the login screen).
- Envelope: `{ ok:true, data, meta? }` (meta carries paging: total, totalPages, page) or `{ ok:false, error, code }`. Codes: `bad_request unauthorized token_expired forbidden
  not_found revoked rate_limited server_error`.

## Endpoints
Employee (every login): `GET me/workspace`, `POST me/punch {type,lat,lng,accuracy?,mocked?,note?}`, `GET me/attendance?month=`,
`POST me/regularizations`, `DELETE me/regularizations/:id`, `GET|POST me/leave`, `DELETE me/leave/:id`,
`GET me/roster?from=&days=`, `GET|PATCH me/profile`, `GET auth/me` (capabilities → which tabs to show).

Manager (has direct reports): `GET team/approvals`, `POST leave/:id/review`, `POST regularizations/:id/review`
`{decision:'Approved'|'Rejected', note?}`.

HR (permission `hr.*`): `GET dashboard`; `GET|POST employees`, `GET|PATCH employees/:id`; `GET|POST attendance/daily`,
`GET attendance/monthly?month=`; `GET regularizations?filter=`; `GET leave/requests?filter=`, `POST leave` (on behalf),
`POST leave/:id/cancel`; `GET|POST leave-types`, `GET leave-balance/:employeeId`; `GET|POST holidays`, `DELETE holidays/:id`;
`GET|PATCH policy`; `GET|POST shifts`; `GET|POST roster`, `DELETE roster/:id`; `GET devices`, `POST devices/:id/revoke`.
All paths are under `/api/v1/hr/` except `auth/*`.

## Attendance rules
Punch is server-timed. Location is mandatory from the app; `policy.requireGeo` + `policy.geofence` (HR → Settings)
decide whether it must be inside the radius. Mock-location flag from the OS is rejected. Events are stored with
`source = MOBILE`, lat/lng/accuracy and IP.

## Ops
- Migration `20261022120000_hr_mobile_sessions` (new table `mobile_sessions`, additive).
- Tests: `tests/integration/mobile-api.db.test.ts` (needs `TEST_DATABASE_URL`, see `scripts/test-integration.sh`).
- Auth plumbing: `app/lib/mobile/*`; `getSession()` honours the Bearer identity only inside `mobileRoute()`.
