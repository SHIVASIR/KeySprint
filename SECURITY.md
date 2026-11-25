# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in KeySprint (authentication, session cookies, CSRF, WebSocket validation, or data exposure):

1. **Do not** open a public GitHub issue with exploit details.
2. Contact the maintainers privately via GitHub Security Advisories on the repository.
3. Provide steps to reproduce and potential impact so we can verify and release a fix promptly.

## Security Architecture Highlights
- Passwords are hashed using Argon2id (`argon2-cffi`).
- Authentication uses signed `HttpOnly` session cookies (`itsdangerous`) paired with double-submit CSRF tokens (`X-CSRF-Token`) on state-changing requests.
- Competitive multiplayer race scores are validated server-side against server-authoritative start timestamps.
