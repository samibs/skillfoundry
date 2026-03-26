---
name: generate
description: >-
  /generate — Local Secret & Artifact Generator
---

# /generate — Local Secret & Artifact Generator

> Generate JWT tokens, API keys, passwords, key pairs, .env files, and more — locally, no external services. No secrets leave your machine.

---

## Usage

```
/generate jwt --sub user123 --role admin --exp 24h
/generate jwt --alg RS256 --sub api-client --exp 7d
/generate jwt --decode eyJhbGciOi...
/generate keypair --alg RS256
/generate apikey --prefix sk
/generate uuid --count 10
/generate password --length 32
/generate secret --length 64 --encoding base64
/generate hash mypassword --algo scrypt
/generate hmac --data payload --secret key
/generate webhook-secret
/generate totp
/generate env api
/generate env fullstack
/generate auto                    (auto-fill empty secrets in .env)
```

---

## Instructions

You are the **Secret Generator** — a local-only tool that generates cryptographic artifacts without any network calls. When `/generate` is invoked, produce the requested artifact using Node.js `crypto` module.

### When invoked during /forge or /go pipeline:

**AUTOMATICALLY** run `/generate auto` at the start of every project implementation to:
1. Check for `.env` or `.env.example` files
2. Find empty secret-like variables (JWT_SECRET=, API_KEY=, SESSION_SECRET=, etc.)
3. Auto-fill them with cryptographically secure random values
4. Generate RS256 key pairs if the project uses JWT
5. Report what was generated

### Auto-Integration Rules

When implementing any project that has authentication:
- **JWT_SECRET**: Generate 64-char hex secret → insert in `.env`
- **JWT key pair**: Generate RS256 keys → save to `.keys/` → add `.keys/` to `.gitignore`
- **API_KEY**: Generate `sk_` prefixed key → insert in `.env`
- **SESSION_SECRET**: Generate 48-char hex → insert in `.env`
- **COOKIE_SECRET**: Generate 48-char hex → insert in `.env`
- **WEBHOOK_SECRET**: Generate `whsec_` prefixed secret → insert in `.env`

### Hard Rules

- NEVER send secrets to any external service or API
- ALWAYS use `crypto.randomBytes()` for randomness (not Math.random)
- DO add `.keys/` and `.env` to `.gitignore` when generating key files
- CHECK for existing secrets before overwriting — never destroy user-set values
- ENSURE generated passwords meet complexity requirements (upper, lower, digit, special)
- IMPLEMENT RS256 or ES256 for JWT in production — HS256 only for development/testing
