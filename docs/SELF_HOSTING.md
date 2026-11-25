# Self-Hosting & Deployment Guide

## Option 1: Docker Compose (Recommended for Self-Hosting)

1. Copy `.env.example` to `.env` and set strong values for `POSTGRES_PASSWORD` and `BACKEND_SECRET_KEY` (at least 32 random characters).
2. For local HTTP testing, keep `ENVIRONMENT=development` and `COOKIE_SECURE=false`. When deploying behind an HTTPS reverse proxy, set `ENVIRONMENT=production` and `COOKIE_SECURE=true` (enforced by the backend config validator).
3. Start all services (PostgreSQL, Redis, FastAPI backend, Nginx static frontend):
   ```bash
   docker compose up -d --build
   ```
3. Access KeySprint at `http://localhost:8080` (API at `http://localhost:8000`).

---

## Option 2: Render Deployment

A ready-to-use `render.yaml` blueprint is included at the repository root.

### Frontend (Render Static Site)
- **Root Directory**: `frontend`
- **Build Command**: `npm install && npm run build`
- **Publish Directory**: `dist`
- **Rewrite Rule**: `/*` -> `/index.html` (SPA routing)
- **Env Var**: `VITE_API_BASE_URL` = your Render backend URL (e.g. `https://keysprint-api.onrender.com`)

### Backend (Render Web Service)
- **Root Directory**: `backend`
- **Build Command**: `pip install -r requirements.txt`
- **Start Command**: `alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port $PORT`
- **Health Check Path**: `/health`
- **Env Vars**: `DATABASE_URL` (from Render PostgreSQL), `SECRET_KEY`, `CORS_ORIGINS`, `COOKIE_SECURE=true`

### Free-Tier Caveats (Render)
- Render Free Web Services spin down after 15 minutes of inactivity (causing ~30–50s cold starts on the first request).
- Render Free PostgreSQL databases have storage and retention limits depending on current Render plan terms; always verify current free-tier limits and maintain backups for production data.
- Because KeySprint's typing engine and guest storage run in the browser, core typing practice works smoothly even during API cold starts.
