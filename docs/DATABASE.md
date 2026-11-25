# KeySprint Database Schema

KeySprint uses SQLAlchemy 2 models and Alembic migrations targeting PostgreSQL (`postgresql+psycopg://...`) with SQLite support for zero-setup local development.

## Tables
- `users`: Core user identity (`id`, `username`, `email`, `password_hash` via Argon2id, `is_active`, timestamps).
- `profiles`: Public/editable profile metadata (`user_id` FK -> `users.id`, `display_name`, `bio`, `preferred_layout`, `is_public`).
- `user_preferences`: Synced appearance and typing preferences (`user_id` FK, `theme`, `settings_json`).
- `test_results`: Individual typing sessions (`user_id` FK, `client_record_id`, `mode`, `category`, `difficulty`, `language`, WPM/accuracy/consistency metrics, `timeline_json`, `verified_competitive`, `imported_from_guest`). Unique constraint `(user_id, client_record_id)` prevents duplicate submissions.
- `learning_progress`: Per-lesson completion and best scores (`user_id` FK, `lesson_id`, `completed`, `best_wpm`, `best_accuracy`, `attempts`).
- `practice_sessions`: Aggregated keystroke accuracy/latency summaries powering Keyboard Intelligence.
- `achievements`: Earned user milestones (`user_id` FK, `code`, `title`).
- `leaderboard_entries`: Server-verified competitive scores indexed by `(period, net_wpm)`.
- `challenges`: Daily and weekly curated challenge prompts.
- `race_rooms` & `race_participants`: Multiplayer race state, prompt text, server start timestamp (`started_at`), and participant progress.
