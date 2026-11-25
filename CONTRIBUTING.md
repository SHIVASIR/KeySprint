# Contributing to KeySprint

Thank you for helping improve KeySprint!

## Guidelines
1. Fork the repository and create a topic branch from `main`.
2. Keep frontend and backend changes modular and independently testable.
3. Add or update automated tests (`vitest` / `pytest` / `playwright`) for bug fixes and new features.
4. Ensure `npm run lint`, `npm test`, `npm run build`, and `pytest -v` pass before opening a pull request.
5. Do not commit `.env` files, secrets, or proprietary third-party content.

## Code Standards
- TypeScript: strict mode enabled (`noUnusedLocals`, `noUnusedParameters`).
- Python: type annotations, Pydantic validation, SQLAlchemy ORM + Alembic migrations for schema changes.
- Accessibility: keyboard-operable controls, ARIA attributes, and high-contrast light/dark themes.
