/**
 * Generator Engine — Local generation of JWT tokens, API keys, certificates,
 * passwords, UUIDs, hashes, HMAC signatures, .env files, and more.
 *
 * Zero external dependencies — uses Node.js crypto only.
 * No secrets leave your machine.
 */
import { randomUUID, randomBytes, createHmac, createHash, generateKeyPairSync, createSign, scryptSync, } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
// ── Constants ───────────────────────────────────────────────────
const LINE = '\u2501';
const PASSWORD_CHARS = {
    lower: 'abcdefghijklmnopqrstuvwxyz',
    upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    digits: '0123456789',
    special: '!@#$%^&*()-_=+[]{}|;:,.<>?',
};
const ENV_TEMPLATES = {
    api: {
        name: 'API Server',
        description: 'Standard API server environment variables',
        variables: [
            { key: 'NODE_ENV', value: 'development', comment: 'Environment' },
            { key: 'PORT', value: '3000', comment: 'Server port' },
            { key: 'HOST', value: '0.0.0.0', comment: 'Bind address' },
            { key: 'DATABASE_URL', value: 'sqlite:./data/app.db', comment: 'Database connection string' },
            { key: 'JWT_SECRET', value: '', comment: 'Auto-generated JWT signing secret' },
            { key: 'JWT_EXPIRES_IN', value: '24h', comment: 'Token expiration' },
            { key: 'API_KEY', value: '', comment: 'Auto-generated API key' },
            { key: 'CORS_ORIGIN', value: 'http://localhost:3001', comment: 'Allowed CORS origin' },
            { key: 'LOG_LEVEL', value: 'info', comment: 'Logging level (debug|info|warn|error)' },
            { key: 'RATE_LIMIT_MAX', value: '100', comment: 'Max requests per 15-min window' },
        ],
    },
    fullstack: {
        name: 'Full-Stack Application',
        description: 'Full-stack app with auth, DB, and frontend',
        variables: [
            { key: 'NODE_ENV', value: 'development', comment: 'Environment' },
            { key: 'PORT', value: '3000', comment: 'Backend port' },
            { key: 'FRONTEND_URL', value: 'http://localhost:3001', comment: 'Frontend URL' },
            { key: 'DATABASE_URL', value: 'postgresql://user:password@localhost:5432/appdb', comment: 'Database connection' },
            { key: 'REDIS_URL', value: 'redis://localhost:6379', comment: 'Redis connection (sessions/cache)' },
            { key: 'JWT_SECRET', value: '', comment: 'Auto-generated' },
            { key: 'JWT_REFRESH_SECRET', value: '', comment: 'Auto-generated' },
            { key: 'SESSION_SECRET', value: '', comment: 'Auto-generated' },
            { key: 'API_KEY', value: '', comment: 'Auto-generated' },
            { key: 'COOKIE_SECRET', value: '', comment: 'Auto-generated' },
            { key: 'SMTP_HOST', value: 'smtp.example.com', comment: 'Email server' },
            { key: 'SMTP_PORT', value: '587', comment: 'Email port' },
            { key: 'SMTP_USER', value: '', comment: 'Email username' },
            { key: 'SMTP_PASS', value: '', comment: 'Email password' },
            { key: 'CORS_ORIGIN', value: 'http://localhost:3001', comment: 'Allowed origins' },
            { key: 'LOG_LEVEL', value: 'info', comment: 'Logging level' },
        ],
    },
    minimal: {
        name: 'Minimal',
        description: 'Bare minimum environment variables',
        variables: [
            { key: 'NODE_ENV', value: 'development' },
            { key: 'PORT', value: '3000' },
            { key: 'SECRET_KEY', value: '', comment: 'Auto-generated' },
        ],
    },
};
// ── Utility Functions ───────────────────────────────────────────
function base64url(data) {
    const buf = typeof data === 'string' ? Buffer.from(data) : data;
    return buf.toString('base64url');
}
function parseExpiry(exp) {
    const match = exp.match(/^(\d+)(s|m|h|d)$/);
    if (!match)
        return 86400; // default 24h
    const num = parseInt(match[1], 10);
    const unit = match[2];
    switch (unit) {
        case 's': return num;
        case 'm': return num * 60;
        case 'h': return num * 3600;
        case 'd': return num * 86400;
        default: return 86400;
    }
}
// ── Generators ──────────────────────────────────────────────────
/**
 * Generate a UUID v4.
 */
export function generateUuid() {
    return randomUUID();
}
/**
 * Generate a cryptographically secure random string.
 */
export function generateSecret(length = 64, encoding = 'hex') {
    const bytes = randomBytes(Math.ceil(length / 2));
    if (encoding === 'base64')
        return bytes.toString('base64').slice(0, length);
    if (encoding === 'base64url')
        return bytes.toString('base64url').slice(0, length);
    return bytes.toString('hex').slice(0, length);
}
/**
 * Generate an API key with optional prefix.
 */
export function generateApiKey(prefix = 'sk') {
    return `${prefix}_${randomBytes(24).toString('base64url')}`;
}
/**
 * Generate a secure password.
 */
export function generatePassword(length = 32, includeSpecial = true) {
    let chars = PASSWORD_CHARS.lower + PASSWORD_CHARS.upper + PASSWORD_CHARS.digits;
    if (includeSpecial)
        chars += PASSWORD_CHARS.special;
    const bytes = randomBytes(length);
    let password = '';
    for (let i = 0; i < length; i++) {
        password += chars[bytes[i] % chars.length];
    }
    // Ensure at least one of each required type
    const ensure = [PASSWORD_CHARS.lower, PASSWORD_CHARS.upper, PASSWORD_CHARS.digits];
    if (includeSpecial)
        ensure.push(PASSWORD_CHARS.special);
    for (let i = 0; i < ensure.length && i < password.length; i++) {
        const charSet = ensure[i];
        if (!password.split('').some((c) => charSet.includes(c))) {
            const pos = randomBytes(1)[0] % password.length;
            const char = charSet[randomBytes(1)[0] % charSet.length];
            password = password.slice(0, pos) + char + password.slice(pos + 1);
        }
    }
    return password;
}
/**
 * Generate a hash (SHA256, SHA512, or scrypt).
 */
export function generateHash(input, algorithm = 'sha256') {
    if (algorithm === 'scrypt') {
        const salt = randomBytes(16);
        const derived = scryptSync(input, salt, 64);
        return `${salt.toString('hex')}:${derived.toString('hex')}`;
    }
    return createHash(algorithm).update(input).digest('hex');
}
/**
 * Generate an HMAC signature.
 */
export function generateHmac(data, secret, algorithm = 'sha256') {
    return createHmac(algorithm, secret).update(data).digest('hex');
}
/**
 * Generate an RSA or EC key pair.
 */
export function generateKeyPair(algorithm = 'RS256', outputDir) {
    let publicKey;
    let privateKey;
    if (algorithm === 'RS256') {
        const pair = generateKeyPairSync('rsa', {
            modulusLength: 2048,
            publicKeyEncoding: { type: 'spki', format: 'pem' },
            privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
        });
        publicKey = pair.publicKey;
        privateKey = pair.privateKey;
    }
    else {
        const pair = generateKeyPairSync('ec', {
            namedCurve: 'P-256',
            publicKeyEncoding: { type: 'spki', format: 'pem' },
            privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
        });
        publicKey = pair.publicKey;
        privateKey = pair.privateKey;
    }
    const result = { publicKey, privateKey, algorithm };
    if (outputDir) {
        mkdirSync(outputDir, { recursive: true });
        const prefix = algorithm.toLowerCase();
        const pubFile = join(outputDir, `${prefix}-public.pem`);
        const privFile = join(outputDir, `${prefix}-private.pem`);
        writeFileSync(pubFile, publicKey);
        writeFileSync(privFile, privateKey);
        result.publicKeyFile = pubFile;
        result.privateKeyFile = privFile;
    }
    return result;
}
/**
 * Generate a JWT token.
 */
export function generateJwt(options = {}) {
    const alg = options.algorithm || 'HS256';
    const now = Math.floor(Date.now() / 1000);
    const expSeconds = parseExpiry(options.expiresIn || '24h');
    const exp = now + expSeconds;
    const header = { alg, typ: 'JWT' };
    const payload = {
        ...options.claims,
        iat: now,
        exp,
    };
    if (options.subject)
        payload.sub = options.subject;
    if (options.role)
        payload.role = options.role;
    if (options.tenant)
        payload.tenant = options.tenant;
    if (!payload.jti)
        payload.jti = randomUUID();
    const headerB64 = base64url(JSON.stringify(header));
    const payloadB64 = base64url(JSON.stringify(payload));
    const signingInput = `${headerB64}.${payloadB64}`;
    let signature;
    let keyFile;
    if (alg === 'HS256') {
        const secret = options.secret || generateSecret(64);
        if (!options.secret)
            payload._generated_secret = secret;
        signature = base64url(createHmac('sha256', secret).update(signingInput).digest());
    }
    else if (alg === 'RS256') {
        let privKey = options.privateKey;
        if (!privKey) {
            const keysDir = join(process.cwd(), '.keys');
            const keyPath = join(keysDir, 'jwt-rs256-private.pem');
            if (existsSync(keyPath)) {
                privKey = readFileSync(keyPath, 'utf-8');
                keyFile = keyPath;
            }
            else {
                const pair = generateKeyPair('RS256', keysDir);
                privKey = pair.privateKey;
                keyFile = pair.privateKeyFile;
            }
        }
        const sign = createSign('RSA-SHA256');
        sign.update(signingInput);
        signature = base64url(sign.sign(privKey));
    }
    else {
        // ES256
        let privKey = options.privateKey;
        if (!privKey) {
            const keysDir = join(process.cwd(), '.keys');
            const keyPath = join(keysDir, 'jwt-es256-private.pem');
            if (existsSync(keyPath)) {
                privKey = readFileSync(keyPath, 'utf-8');
                keyFile = keyPath;
            }
            else {
                const pair = generateKeyPair('ES256', keysDir);
                privKey = pair.privateKey;
                keyFile = pair.privateKeyFile;
            }
        }
        const sign = createSign('SHA256');
        sign.update(signingInput);
        signature = base64url(sign.sign({ key: privKey, dsaEncoding: 'ieee-p1363' }));
    }
    const token = `${signingInput}.${signature}`;
    return {
        token,
        header,
        payload,
        expiresAt: new Date(exp * 1000).toISOString(),
        keyFile,
    };
}
/**
 * Decode a JWT token (no verification).
 */
export function decodeJwt(token) {
    const parts = token.split('.');
    if (parts.length !== 3)
        return null;
    try {
        const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
        const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
        return { header, payload };
    }
    catch {
        return null;
    }
}
/**
 * Generate a TOTP secret (RFC 6238 compatible).
 */
export function generateTotpSecret() {
    // Generate base32-compatible secret (A-Z, 2-7)
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    const bytes = randomBytes(20);
    let base32Secret = '';
    for (let i = 0; i < 16; i++) {
        base32Secret += chars[bytes[i] % chars.length];
    }
    return {
        secret: base32Secret,
        uri: `otpauth://totp/App:user@example.com?secret=${base32Secret}&issuer=App`,
        qrText: `Use this secret in your authenticator app: ${base32Secret}`,
    };
}
/**
 * Generate a webhook signing secret.
 */
export function generateWebhookSecret() {
    return `whsec_${randomBytes(32).toString('base64url')}`;
}
// ── .env Generator ──────────────────────────────────────────────
/**
 * Generate a .env file from a template with auto-generated secrets.
 */
export function generateEnvFile(template = 'api', outputPath) {
    const tmpl = ENV_TEMPLATES[template];
    if (!tmpl) {
        return { content: `# Unknown template: ${template}\n# Available: ${Object.keys(ENV_TEMPLATES).join(', ')}` };
    }
    const lines = [
        `# ${tmpl.name} — Environment Configuration`,
        `# ${tmpl.description}`,
        `# Generated by SkillFoundry /generate env`,
        `# Date: ${new Date().toISOString().slice(0, 10)}`,
        '',
    ];
    for (const v of tmpl.variables) {
        if (v.comment)
            lines.push(`# ${v.comment}`);
        let value = v.value;
        // Auto-generate secrets for empty values with secret-like names
        if (!value && /SECRET|KEY|TOKEN|PASS/.test(v.key)) {
            if (v.key.includes('JWT')) {
                value = generateSecret(64);
            }
            else if (v.key.includes('API_KEY')) {
                value = generateApiKey();
            }
            else {
                value = generateSecret(48);
            }
        }
        lines.push(`${v.key}=${value}`);
        lines.push('');
    }
    const content = lines.join('\n');
    if (outputPath) {
        mkdirSync(dirname(outputPath), { recursive: true });
        writeFileSync(outputPath, content);
    }
    return { content, path: outputPath };
}
/**
 * Get available .env templates.
 */
export function getEnvTemplates() {
    return Object.entries(ENV_TEMPLATES).map(([name, tmpl]) => ({
        name,
        title: tmpl.name,
        description: tmpl.description,
        varCount: tmpl.variables.length,
    }));
}
// ── Auto-Integration for Forge Pipeline ─────────────────────────
/**
 * Scan a project and auto-generate missing secrets in .env files.
 * Called by /forge, /go, /goma during project setup.
 */
export function autoGenerateSecrets(projectPath) {
    const generated = [];
    const skipped = [];
    // Check for .env
    const envPath = join(projectPath, '.env');
    const envExamplePath = join(projectPath, '.env.example');
    if (existsSync(envPath)) {
        const content = readFileSync(envPath, 'utf-8');
        let updated = content;
        let changed = false;
        // Find empty secret-like variables and fill them
        const emptySecretPattern = /^((?:JWT_?|API_?|SESSION_?|COOKIE_?|WEBHOOK_?)?(?:SECRET|KEY|TOKEN|PASS(?:WORD)?))=\s*$/gm;
        let match;
        while ((match = emptySecretPattern.exec(content)) !== null) {
            const key = match[1];
            let value;
            if (key.includes('JWT')) {
                value = generateSecret(64);
            }
            else if (key.includes('API_KEY') || key.includes('API_SECRET')) {
                value = generateApiKey();
            }
            else if (key.includes('WEBHOOK')) {
                value = generateWebhookSecret();
            }
            else {
                value = generateSecret(48);
            }
            updated = updated.replace(`${key}=`, `${key}=${value}`);
            generated.push(`${key} (in .env)`);
            changed = true;
        }
        if (changed) {
            writeFileSync(envPath, updated);
        }
    }
    else if (existsSync(envExamplePath)) {
        // Copy .env.example to .env and fill secrets
        const content = readFileSync(envExamplePath, 'utf-8');
        let populated = content;
        const emptyPattern = /^([A-Z_]+(?:SECRET|KEY|TOKEN|PASS(?:WORD)?))=\s*$/gm;
        let match;
        while ((match = emptyPattern.exec(content)) !== null) {
            const key = match[1];
            let value;
            if (key.includes('JWT')) {
                value = generateSecret(64);
            }
            else if (key.includes('API')) {
                value = generateApiKey();
            }
            else {
                value = generateSecret(48);
            }
            populated = populated.replace(`${key}=`, `${key}=${value}`);
            generated.push(`${key} (from .env.example → .env)`);
        }
        writeFileSync(envPath, populated);
        if (generated.length > 0) {
            generated.unshift('.env created from .env.example');
        }
    }
    else {
        skipped.push('No .env or .env.example found');
    }
    // Check for .keys directory — generate JWT keypair if project uses JWT
    const packageJsonPath = join(projectPath, 'package.json');
    if (existsSync(packageJsonPath)) {
        const pkg = readFileSync(packageJsonPath, 'utf-8');
        if (/jsonwebtoken|jose|jwt/i.test(pkg)) {
            const keysDir = join(projectPath, '.keys');
            if (!existsSync(join(keysDir, 'rs256-private.pem'))) {
                generateKeyPair('RS256', keysDir);
                generated.push('RS256 key pair (.keys/rs256-*.pem)');
            }
            else {
                skipped.push('RS256 key pair already exists');
            }
        }
    }
    return { generated, skipped };
}
// ── Formatting ──────────────────────────────────────────────────
export function formatJwtResult(result) {
    const lines = [
        'JWT Token Generated',
        LINE.repeat(60),
        '',
        `  Token: ${result.token.slice(0, 50)}...${result.token.slice(-20)}`,
        '',
        `  Header:  ${JSON.stringify(result.header)}`,
        `  Payload: ${JSON.stringify(result.payload, null, 2).split('\n').map((l, i) => i === 0 ? l : `           ${l}`).join('\n')}`,
        `  Expires: ${result.expiresAt}`,
    ];
    if (result.keyFile)
        lines.push(`  Key:     ${result.keyFile}`);
    lines.push('');
    lines.push(`  Full token (copy):`);
    lines.push(`  ${result.token}`);
    lines.push('');
    return lines.join('\n');
}
export function formatKeyPairResult(result) {
    const lines = [
        `Key Pair Generated (${result.algorithm})`,
        LINE.repeat(60),
        '',
    ];
    if (result.publicKeyFile) {
        lines.push(`  Public key:  ${result.publicKeyFile}`);
        lines.push(`  Private key: ${result.privateKeyFile}`);
    }
    else {
        lines.push('  Public key:');
        lines.push(`  ${result.publicKey.split('\n').slice(0, 3).join('\n  ')}...`);
        lines.push('  Private key:');
        lines.push(`  ${result.privateKey.split('\n').slice(0, 3).join('\n  ')}...`);
    }
    lines.push('');
    return lines.join('\n');
}
export function formatAutoGenerateResult(result) {
    const lines = [
        'Auto-Generated Secrets',
        LINE.repeat(60),
        '',
    ];
    if (result.generated.length > 0) {
        lines.push('  Generated:');
        for (const g of result.generated)
            lines.push(`    \u2713 ${g}`);
    }
    if (result.skipped.length > 0) {
        lines.push('  Skipped:');
        for (const s of result.skipped)
            lines.push(`    \u2500 ${s}`);
    }
    if (result.generated.length === 0 && result.skipped.length === 0) {
        lines.push('  Nothing to generate.');
    }
    lines.push('');
    return lines.join('\n');
}
//# sourceMappingURL=generator-engine.js.map