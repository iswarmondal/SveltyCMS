/**
 * @file src/utils/crypto.ts
 * @description Server-only crypto utilities (Argon2 + AES-256-GCM)
 *
 * Security:
 * - Argon2id for password hashing & key derivation
 * - AES-256-GCM authenticated encryption
 * - Quantum-resistant design (memory-hard + 128-bit quantum security)
 * - Secure random generation
 */

import { logger } from '@utils/logger';

let argon2: typeof import('argon2') | null = null;
let crypto: typeof import('crypto') | null = null;

if (typeof window === 'undefined') {
	import('argon2').then((m) => (argon2 = m)).catch((err) => logger.error('Argon2 load failed', err));
	import('crypto').then((m) => (crypto = m)).catch((err) => logger.error('Crypto load failed', err));
}

// Argon2 config (memory-hard, quantum-resistant)
const ARGON2 = {
	memory: 65536, // 64 MiB
	time: 3,
	parallelism: 4,
	type: 2 as const, // argon2id
	hashLength: 32
};

// AES-256-GCM (128-bit quantum security via Grover)
const AES = {
	algo: 'aes-256-gcm' as const,
	keyLen: 32,
	ivLen: 12, // GCM recommended
	tagLen: 16,
	saltLen: 32
};

/** Hash password with Argon2id */
export async function hashPassword(pw: string): Promise<string> {
	if (!argon2) throw new Error('Argon2 unavailable (server only)');
	return argon2.hash(pw, { ...ARGON2, type: argon2.argon2id });
}

/** Verify password */
export async function verifyPassword(pw: string, hash: string): Promise<boolean> {
	if (!argon2) throw new Error('Argon2 unavailable (server only)');
	return argon2.verify(hash, pw);
}

/** Derive key from password + salt */
async function deriveKey(pw: string, salt: Buffer): Promise<Buffer> {
	if (!argon2) throw new Error('Argon2 unavailable');
	const raw = await argon2.hash(pw, { ...ARGON2, salt, raw: true });
	return Buffer.from(raw).subarray(0, AES.keyLen);
}

/** Encrypt object */
export async function encrypt(data: Record<string, unknown>, pw: string): Promise<string> {
	if (!crypto || !argon2) throw new Error('Crypto unavailable (server only)');

	const salt = crypto.randomBytes(AES.saltLen);
	const iv = crypto.randomBytes(AES.ivLen);
	const key = await deriveKey(pw, salt);

	const cipher = crypto.createCipheriv(AES.algo, key, iv);
	const plaintext = Buffer.from(JSON.stringify(data), 'utf8');
	const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
	const tag = cipher.getAuthTag();

	const combined = Buffer.concat([salt, iv, tag, encrypted]);
	return combined.toString('base64');
}

/** Decrypt to object */
export async function decrypt(encrypted: string, pw: string): Promise<Record<string, unknown>> {
	if (!crypto || !argon2) throw new Error('Crypto unavailable (server only)');

	const buf = Buffer.from(encrypted, 'base64');

	let pos = 0;
	const salt = buf.subarray(pos, (pos += AES.saltLen));
	const iv = buf.subarray(pos, (pos += AES.ivLen));
	const tag = buf.subarray(pos, (pos += AES.tagLen));
	const ciphertext = buf.subarray(pos);

	const key = await deriveKey(pw, salt);
	const decipher = crypto.createDecipheriv(AES.algo, key, iv);
	decipher.setAuthTag(tag);

	const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
	return JSON.parse(decrypted.toString('utf8'));
}

/** SHA-256 checksum */
export function checksum(data: unknown): string {
	if (!crypto) throw new Error('Crypto unavailable');
	return crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
}

/** Aliases for backward compatibility */
export const createChecksum = checksum;
export const encryptData = encrypt;
export const decryptData = decrypt;

/** Random token */
export function randomToken(bytes = 32): string {
	if (!crypto) throw new Error('Crypto unavailable');
	return crypto.randomBytes(bytes).toString('hex');
}

/** UUID v4 */
export function uuid(): string {
	if (!crypto) throw new Error('Crypto unavailable');
	return crypto.randomUUID();
}

/** Check availability */
export function cryptoReady(): boolean {
	return crypto !== null && argon2 !== null;
}
