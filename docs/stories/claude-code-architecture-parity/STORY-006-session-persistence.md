---
story_id: STORY-006
title: Session Persistence & Resumption
phase: 2
priority: SHOULD
complexity: small
depends_on: [STORY-004]
blocks: []
layers: [backend]
---

# STORY-006: Session Persistence & Resumption

## Objective

Implement file-based session persistence so sessions can be saved and resumed across server restarts.

## Technical Approach

### 1. Create Session Store

Create `src/session/persistence.ts`:

```typescript
import { writeFileSync, readFileSync, mkdirSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';

export interface StoredSession {
  sessionId: string;
  messages: string[];        // Tool invocation log
  inputTokens: number;
  outputTokens: number;
  turnCount: number;
  createdAt: string;
  lastActive: string;
  transcript: object;        // Serialized TranscriptStore
}

export function saveSession(session: StoredSession, directory: string): string {
  mkdirSync(directory, { recursive: true });
  const path = join(directory, `${session.sessionId}.json`);
  writeFileSync(path, JSON.stringify(session, null, 2));
  return path;
}

export function loadSession(sessionId: string, directory: string): StoredSession | null {
  const path = join(directory, `${sessionId}.json`);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf-8'));
}

export function listSessions(directory: string): string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory)
    .filter(f => f.endsWith('.json'))
    .map(f => f.replace('.json', ''));
}
```

### 2. Add persist/resume to SessionEngine

Add to `src/session/engine.ts`:
- `persist()` — serialize state to StoredSession, call saveSession()
- `static resume(sessionId, config)` — load from disk, restore state
- Auto-persist after every N turns (configurable, default: 5)

### 3. REST API Endpoint

Add to `src/api/routes.ts`:
- `GET /api/v1/sessions` — list all session IDs
- `GET /api/v1/sessions/:id` — get session state (usage, turns, last active)
- `POST /api/v1/sessions/:id/compact` — force compaction

## Acceptance Criteria

```gherkin
Given an active session with 10 turns
When persist() is called
Then a JSON file appears in .sf_sessions/{sessionId}.json
And it contains sessionId, messages, token counts, and transcript

Given a persisted session file
When SessionEngine.resume(sessionId) is called
Then the engine restores with correct usage, turnCount, and transcript

Given no session file exists for an ID
When loadSession("nonexistent") is called
Then it returns null (no error thrown)

Given GET /api/v1/sessions
When called
Then it returns a list of session IDs from the sessions directory
```

## Files to Create/Modify

| Action | File | Purpose |
|--------|------|---------|
| CREATE | `src/session/persistence.ts` | File-based session store |
| MODIFY | `src/session/engine.ts` | persist() and resume() methods |
| MODIFY | `src/api/routes.ts` | Session REST endpoints |
