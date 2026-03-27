# SkillFoundry — Essential Rules (Lite)

> Lightweight context for everyday work. Full rules: `@CLAUDE.md` or auto-loaded by `/forge`, `/certify`, `/go`.

## Philosophy
- Cold-blooded logic. No placeholders, no TODOs, no mocks. Only real, working code.
- Three-Layer: DATABASE → BACKEND → FRONTEND. All three. Every time.
- PRD-first for non-trivial features. No PRD = no implementation.

## Top 10 Rules (Most-Violated)
1. **Frontend-Backend Contract**: READ the actual backend endpoint BEFORE writing any frontend fetch call. Verify path, method, body, response shape.
2. **Array Safety**: Default all arrays to `[]`. Guard: `(data.items ?? []).map(...)`. Never `.map()` on nullable.
3. **DB Naming**: One convention per DB. PostgreSQL/SQLite = `snake_case`. MSSQL = `PascalCase`. Never mix.
4. **DB Dialect**: Check actual DB type before writing schema. No `SERIAL` for SQLite. No `AUTOINCREMENT` for PostgreSQL.
5. **No Secrets in Code**: No hardcoded API keys, tokens, passwords. Use `.env` + config abstraction.
6. **Tokens**: Access tokens in memory only. Refresh tokens in HttpOnly Secure SameSite=Strict cookies. Never localStorage.
7. **Error Handling**: Never silently fail. No empty `catch {}`. Log, re-throw, or return meaningful error.
8. **Input Validation**: Validate at system boundaries. Use Zod/Joi. Parameterized queries only.
9. **Consistent Layout**: All pages same `max-width` container. Responsive at 320px/768px/1200px+. No horizontal scroll.
10. **Test Everything**: No feature is done without tests. 80%+ coverage for business logic.

## Banned Patterns
`TODO`, `FIXME`, `PLACEHOLDER`, `STUB`, `MOCK` (in prod), `COMING SOON`, `NotImplementedError`, empty function bodies, `@ts-ignore` without justification.

## Quick Commands
| Command | Purpose |
|---------|---------|
| `/go` | Implement PRDs from genesis/ |
| `/certify` | Run certification audit |
| `/layer-check` | Validate DB→Backend→Frontend |
| `/forge` | Full 6-phase pipeline |

## Full Context
For complete rules, deviation catalog (171 patterns), and production standards: reference `CLAUDE.md`.
