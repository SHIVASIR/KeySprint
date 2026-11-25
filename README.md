# KeySprint

**Type Faster. Go Further.**

KeySprint is a free, open-source (MIT) typing improvement ecosystem built for learners, everyday typists, competitive racers, and software developers.

---

## Core Modules

- **Typing Studio (`/`)**: Time-based (`15s`, `30s`, `60s`, `120s`), word-based (`10`, `25`, `50`, `100`), content categories (General English, Technology, Business, Education, Quotes, Programming), custom text, difficulty tiers, plus punctuation, numbers, special characters, no-backspace, blind typing, and strict accuracy modes.
- **Results & Telemetry (`/results/:id`)**: Deterministic Net WPM, Gross WPM, Accuracy, Keystroke Accuracy, Consistency, and Recharts speed/accuracy timeline graphs.
- **Smart Typing Coach (`/practice`) & Keyboard Intelligence**: Rule-based weak-key detection, slow bigram analysis, interactive configurable keyboard heatmaps (QWERTY, Colemak, Dvorak), hand/finger breakdowns, and adaptive drills generated directly from recorded keystrokes.
- **Learning Academy (`/learn`)**: 5-level structured curriculum (`Beginner` to `Expert`) with functional exercises, target thresholds, daily goals, and milestones.
- **Developer Mode (`/developer`)**: Syntax-sensitive code typing across Python, JavaScript, C, C++, Java, HTML, CSS, and SQL with strict whitespace and indentation preservation.
- **Personal Progress & History (`/progress`, `/history`)**: Guest-first persistence using IndexedDB and localStorage with date/mode/category filtering.
- **Competition Arena (`/arena`, `/leaderboard`)**: Verified global/daily/weekly/monthly leaderboards, challenges, and server-authoritative WebSocket multiplayer race rooms.

---

## Technology Stack

- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, React Router, Lucide React, Recharts
- **Backend**: Python, FastAPI, Pydantic v2, SQLAlchemy 2, Alembic, Argon2id (`argon2-cffi`)
- **Database**: PostgreSQL (SQLite fallback supported for zero-setup local dev & testing)
- **Optional Infrastructure**: Redis (rate limiting & multi-instance scaling), Docker Compose, GitHub Actions
- **Testing**: Vitest, React Testing Library, Pytest, Playwright

---

## Quick Start (Local Development)

### Prerequisites
- Node.js 20+ and npm
- Python 3.11+

### 1. Start the Backend API
```bash
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate  |  macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
alembic upgrade head
uvicorn app.main:app --reload --port 8000
```

### 2. Start the Frontend
```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`. Guest Mode works immediately even if the backend is offline; starting the backend enables optional accounts, cloud sync, leaderboards, and live WebSocket multiplayer.

---

## Running Automated Tests

```bash
# Frontend unit & component tests
cd frontend && npm test

# Frontend production build
cd frontend && npm run build

# Backend API & WebSocket tests
cd backend && pytest -v

# Playwright E2E tests (requires Chromium installed via `npx playwright install chromium`)
cd frontend && npm run test:e2e
```

---

## Documentation

- [Architecture Guide](docs/ARCHITECTURE.md)
- [Database Schema](docs/DATABASE.md)
- [REST & WebSocket API](docs/API.md)
- [Self-Hosting & Render Deployment](docs/SELF_HOSTING.md)
- [Contributing](CONTRIBUTING.md)
- [Security Policy](SECURITY.md)

## License

MIT — see [LICENSE](LICENSE).
