# KeySprint Architecture

## Overview
KeySprint separates client-side typing execution from server-side account synchronization and competitive multiplayer validation.

```
[Browser SPA: React + TypeScript + Vite]
   ├── Pure Typing Engine (typingEngine.ts, calculations.ts)
   ├── Smart Coach & Keyboard Intelligence (coachEngine.ts, keyboardLayouts.ts)
   ├── Guest Persistence (IndexedDB + localStorage)
   └── API Client (credentials: include, X-CSRF-Token)
          │
          ▼  HTTPS REST + WebSockets (/api/v1/*)
[FastAPI Backend]
   ├── Argon2id Auth + Signed HttpOnly Session + CSRF
   ├── Rate Limiter (Redis or in-memory fallback)
   ├── Server-Authoritative Race Coordinator (WebSocket)
   └── SQLAlchemy 2 ORM + Alembic Migrations
          │
          ▼
[PostgreSQL]  (+ optional Redis)
```

## Key Design Decisions
1. **Guest-First Execution**: All core typing modes, analytics, smart coach drills, learning academy, and developer mode run natively in the browser without requiring a network connection or user account.
2. **Pure Engine Isolation**: `typingEngine.ts` and `calculations.ts` have zero React or DOM dependencies, enabling deterministic unit testing across edge cases.
3. **Competitive Integrity & Browser Anti-Cheat Limitations**:
   - Local guest imports are stored as personal practice history (`verified_competitive=False`). Global leaderboards only display authenticated competitive race runs validated on the server.
   - Race rooms enforce server-authoritative start timestamps, monotonic progressive character checkpoints (`chars_typed` + `progress_updates_count`), single-step jump caps, burst/cumulative speed ceilings, and server-side grading of `typed_text` against `room.prompt_text`.
   - **Honest Limitation of Browser-Based Anti-Cheat**: Because a browser client runs in user-controlled memory and DOM, a sufficiently sophisticated automated script (e.g. a browser extension or headless Playwright driver simulating realistic human keystroke timing at ~120–180 WPM across progressive checkpoints) cannot be 100% distinguished from a genuine human typist without invasive OS-level telemetry or biometric keystroke-dynamics models. KeySprint's server validation eliminates naive API/WebSocket replay, instant full-prompt pastes, forged client timestamps, and superhuman burst speeds while preserving low-latency responsiveness for legitimate typists.
