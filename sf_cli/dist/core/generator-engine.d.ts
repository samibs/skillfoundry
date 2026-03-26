/**
 * Generator Engine — Local generation of JWT tokens, API keys, certificates,
 * passwords, UUIDs, hashes, HMAC signatures, .env files, and more.
 *
 * Zero external dependencies — uses Node.js crypto only.
 * No secrets leave your machine.
 */
export interface JwtOptions {
    algorithm?: 'HS256' | 'RS256' | 'ES256';
    secret?: string;
    privateKey?: string;
    subject?: string;
    role?: string;
    tenant?: string;
    claims?: Record<string, unknown>;
    expiresIn?: string;
}
export interface JwtResult {
    token: string;
    header: Record<string, string>;
    payload: Record<string, unknown>;
    expiresAt: string;
    keyFile?: string;
}
export interface KeyPairResult {
    publicKey: string;
    privateKey: string;
    algorithm: string;
    publicKeyFile?: string;
    privateKeyFile?: string;
}
export interface CertResult {
    cert: string;
    key: string;
    certFile?: string;
    keyFile?: string;
    cn: string;
    days: number;
}
export interface EnvTemplate {
    name: string;
    description: string;
    variables: Array<{
        key: string;
        value: string;
        comment?: string;
    }>;
}
/**
 * Generate a UUID v4.
 */
export declare function generateUuid(): string;
/**
 * Generate a cryptographically secure random string.
 */
export declare function generateSecret(length?: number, encoding?: 'hex' | 'base64' | 'base64url'): string;
/**
 * Generate an API key with optional prefix.
 */
export declare function generateApiKey(prefix?: string): string;
/**
 * Generate a secure password.
 */
export declare function generatePassword(length?: number, includeSpecial?: boolean): string;
/**
 * Generate a hash (SHA256, SHA512, or scrypt).
 */
export declare function generateHash(input: string, algorithm?: 'sha256' | 'sha512' | 'scrypt'): string;
/**
 * Generate an HMAC signature.
 */
export declare function generateHmac(data: string, secret: string, algorithm?: 'sha256' | 'sha512'): string;
/**
 * Generate an RSA or EC key pair.
 */
export declare function generateKeyPair(algorithm?: 'RS256' | 'ES256', outputDir?: string): KeyPairResult;
/**
 * Generate a JWT token.
 */
export declare function generateJwt(options?: JwtOptions): JwtResult;
/**
 * Decode a JWT token (no verification).
 */
export declare function decodeJwt(token: string): {
    header: Record<string, unknown>;
    payload: Record<string, unknown>;
} | null;
/**
 * Generate a TOTP secret (RFC 6238 compatible).
 */
export declare function generateTotpSecret(): {
    secret: string;
    uri: string;
    qrText: string;
};
/**
 * Generate a webhook signing secret.
 */
export declare function generateWebhookSecret(): string;
/**
 * Generate a .env file from a template with auto-generated secrets.
 */
export declare function generateEnvFile(template?: string, outputPath?: string): {
    content: string;
    path?: string;
};
/**
 * Get available .env templates.
 */
export declare function getEnvTemplates(): Array<{
    name: string;
    title: string;
    description: string;
    varCount: number;
}>;
/**
 * Scan a project and auto-generate missing secrets in .env files.
 * Called by /forge, /go, /goma during project setup.
 */
export declare function autoGenerateSecrets(projectPath: string): {
    generated: string[];
    skipped: string[];
};
export declare function formatJwtResult(result: JwtResult): string;
export declare function formatKeyPairResult(result: KeyPairResult): string;
export declare function formatAutoGenerateResult(result: {
    generated: string[];
    skipped: string[];
}): string;
