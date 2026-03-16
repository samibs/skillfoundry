# SkillFoundry Privacy Policy

**Last Updated:** 2026-03-16

---

## What We Collect

When telemetry is enabled, SkillFoundry records the following metrics locally:

| Field | Description |
|-------|-------------|
| Event type | Category of operation (`forge_run`, `gate_execution`, `security_scan`, `dependency_scan`, `hook_execution`, `benchmark_run`) |
| Timestamp | ISO 8601 date/time when the event occurred |
| Duration | How long the operation took (milliseconds) |
| Pass/fail status | Whether the operation succeeded, warned, failed, or errored |
| Gate tier | Which quality gate tier was evaluated (T1-T6) |
| Finding counts | Number of findings by severity (critical, high, medium, low) |
| Test counts | Number of tests created or executed |
| Token usage | Number of LLM tokens consumed |
| Cost | Estimated cost in USD |

---

## What We DO NOT Collect

SkillFoundry explicitly does **not** collect:

- **No source code** — your code is never read, copied, or transmitted
- **No file contents** — no file data of any kind is captured
- **No file paths** — directory structures and filenames are never recorded
- **No personal information** — no name, email, IP address, or identifiers
- **No API keys or credentials** — secrets are never logged or stored in telemetry

---

## Where Data Is Stored

All telemetry data is stored **locally only** on your machine:

- **Location:** `.skillfoundry/telemetry.jsonl` in your project directory
- **Format:** Append-only JSON Lines (one event per line)
- **Rotation:** Files are rotated at 5MB, with a maximum of 2 archives (`telemetry.1.jsonl`, `telemetry.2.jsonl`)
- **Transmission:** Data is **never** transmitted to any server without explicit opt-in consent
- **No remote server exists** — there is no SkillFoundry telemetry backend

---

## How to Opt Out

You can opt out of telemetry at any time using either method:

### CLI Command

```bash
sf consent --opt-out
```

### Manual Configuration

Edit `.skillfoundry/config.toml` and set:

```toml
[telemetry]
consent = "opted_out"
```

### Re-enabling Telemetry

```bash
sf consent --opt-in
```

Or set `consent = "opted_in"` in the `[telemetry]` section.

---

## Data Retention

- **Local data:** Managed entirely by you. Delete `.skillfoundry/telemetry.jsonl` and its archives at any time.
- **Server-side retention:** None. No server exists to receive or store telemetry data.
- **Archives:** Automatically rotated. Oldest archives are deleted when new ones are created (max 2 archives).

---

## Consent Defaults

- **Interactive terminals:** You are prompted once for consent on first use
- **Non-interactive environments (CI/CD, scripts, no TTY):** Telemetry defaults to **opted out** automatically
- **Consent is recorded per-project** in `.skillfoundry/config.toml`
