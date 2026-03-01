# STORY-009: Cost, Explain, Undo, Health

## Goal
Complete operational DX command suite and integrate cost tracking.

## PRD Mapping
- FR-022
- FR-023
- FR-024
- FR-025

## Tasks
- Integrate agent/story/phase token records with cost tracker.
- Ensure `/explain`, `/undo`, and `/health` command docs and behavior align.
- Add consistent result envelopes for command outputs.

## Acceptance Criteria
- Cost report includes per-agent and per-story breakdowns.
- Explain reports latest action context in plain language.
- Undo reverts last reversible action safely.
- Health reports actionable config/system diagnostics.

## Tests
- Cost aggregation test.
- Undo reversible/non-reversible branch tests.
- Health diagnostics smoke.
