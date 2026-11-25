# KeySprint API Reference (`/api/v1`)

## Health
- `GET /health` — Service health probe.

## Authentication
- `POST /api/v1/auth/register` — Create account; sets `ks_session` (`HttpOnly`) and `ks_csrf` cookies.
- `POST /api/v1/auth/login` — Authenticate by username or email.
- `POST /api/v1/auth/logout` — Clear session and CSRF cookies.
- `GET /api/v1/auth/me` — Return currently authenticated user profile.

## Results
- `POST /api/v1/results` — Save test result (idempotent via `client_record_id`).
- `POST /api/v1/results/import` — Import eligible guest records with duplicate prevention.
- `GET /api/v1/results?page=1&page_size=20` — Paginated result history.
- `GET /api/v1/results/{id}` — Retrieve owned result.
- `DELETE /api/v1/results/{id}` — Delete owned result.

## Profile & Preferences
- `GET /api/v1/profile` — Get profile details.
- `PATCH /api/v1/profile` — Update display name, bio, preferred layout, visibility.
- `DELETE /api/v1/profile` — Permanently delete account and cascade user data.
- `GET /api/v1/preferences` — Retrieve synced theme & typing preferences.
- `PUT /api/v1/preferences` — Update synced theme & typing preferences.

## Learning & Analytics
- `GET /api/v1/lessons` — List structured curriculum lessons.
- `GET /api/v1/learning/progress` — Get user lesson progress.
- `POST /api/v1/learning/progress` — Record lesson completion/attempt.
- `GET /api/v1/analytics/overview` — Aggregate speed, accuracy, and practice time.
- `GET /api/v1/analytics/history` — Recent progression points.
- `GET /api/v1/analytics/keyboard` — Aggregated per-key statistics.

## Leaderboard & Competition
- `GET /api/v1/leaderboard` (`all`), `/daily`, `/weekly`, `/monthly`
- `GET /api/v1/leaderboard/challenges`
- `POST /api/v1/races` — Create multiplayer race room.
- `GET /api/v1/races/{id}` — Inspect/join race room.
- `WS /api/v1/ws/races/{id}` — Real-time race synchronization (`start_race`, `progress`, `finish`).
