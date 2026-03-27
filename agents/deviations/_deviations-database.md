# Known LLM Deviation Patterns — Database

> Per-category extract from _known-deviations.md. Full catalog: agents/_known-deviations.md

---

## CATEGORY 3: Database Deviations

| ID | Pattern | Prevention | Agent |
|----|---------|------------|-------|
| DB-001 | Mixed naming conventions in same schema | One convention per DB: PostgreSQL/SQLite = `snake_case`, MSSQL = `PascalCase` | data-architect, coder |
| DB-002 | Wrong SQL dialect for target DB | Check actual DB type before writing schema. No `SERIAL` for SQLite | data-architect |
| DB-003 | Missing indexes on foreign keys | Every FK column MUST have an index | data-architect |
| DB-004 | Missing indexes on frequently queried columns | Add indexes for WHERE, ORDER BY, JOIN columns | data-architect, performance |
| DB-005 | No CASCADE rules on foreign keys | Define ON DELETE behavior: CASCADE, SET NULL, or RESTRICT | data-architect |
| DB-006 | Using TEXT for everything | Use proper types: INTEGER, BOOLEAN, TIMESTAMP, UUID, DECIMAL | data-architect |
| DB-007 | Missing NOT NULL constraints | Default to NOT NULL. Only allow NULL when explicitly justified | data-architect |
| DB-008 | Missing created_at/updated_at timestamps | Every table needs `created_at` (auto-set) and `updated_at` (auto-update) | data-architect |
| DB-009 | No transactions for multi-table operations | Wrap related inserts/updates in transactions. Rollback on failure | coder, data-architect |
| DB-010 | String concatenation in SQL | Parameterized queries ONLY. Never `"SELECT * WHERE id=" + id` | security, coder |
| DB-011 | No default values for array/JSON columns | Default to `'[]'` or `'{}'`. Never leave as NULL | data-architect |
| DB-012 | Missing migration rollback scripts | Every migration up MUST have a corresponding down | data-architect, migration |
