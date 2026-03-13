import * as crypto from 'crypto';
import { ValueTransformer } from 'typeorm';

type KeyMap = Map<string, Buffer>;

type Cache = {
  activeKeyId: string;
  keys: KeyMap;
};

let cache: Cache | null = null;

function loadKeyCache(): Cache {
  if (cache) return cache;

  const activeKeyId = (process.env.PII_ENCRYPTION_ACTIVE_KEY_ID || '').trim();
  const keysRaw = (process.env.PII_ENCRYPTION_KEYS || '').trim();

  const keys: KeyMap = new Map();
  if (keysRaw) {
    for (const pair of keysRaw.split(',')) {
      const [idRaw, keyRaw] = pair.split(':');
      const keyId = (idRaw || '').trim();
      const encoded = (keyRaw || '').trim();
      if (!keyId || !encoded) continue;
      try {
        const buf = Buffer.from(encoded, 'base64');
        if (buf.length === 32) {
          keys.set(keyId, buf);
        }
      } catch {
        // Ignore malformed key entries; validated at bootstrap in production.
      }
    }
  }

  cache = {
    activeKeyId,
    keys,
  };
  return cache;
}

function encryptWithAesGcm(plaintext: string, keyId: string, key: Buffer): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `enc:${keyId}:${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
}

function decryptWithAesGcm(value: string, key: Buffer): string {
  const parts = value.split(':');
  if (parts.length !== 5) throw new Error('Invalid encrypted payload format');
  const iv = Buffer.from(parts[2], 'base64');
  const tag = Buffer.from(parts[3], 'base64');
  const data = Buffer.from(parts[4], 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
  return decrypted.toString('utf8');
}

export function encryptPii(value: string | null | undefined): string | null | undefined {
  if (value == null || value === '') return value;
  if (value.startsWith('enc:')) return value;

  const { activeKeyId, keys } = loadKeyCache();
  const activeKey = activeKeyId ? keys.get(activeKeyId) : undefined;
  if (!activeKeyId || !activeKey) {
    // Non-production fallback. Production startup enforces keys.
    return value;
  }
  return encryptWithAesGcm(value, activeKeyId, activeKey);
}

export function decryptPii(value: string | null | undefined): string | null | undefined {
  if (value == null || value === '') return value;
  if (!value.startsWith('enc:')) return value;

  const { keys } = loadKeyCache();
  const parts = value.split(':');
  if (parts.length !== 5) return value;

  const keyId = parts[1];
  const hintedKey = keys.get(keyId);
  if (hintedKey) {
    try {
      return decryptWithAesGcm(value, hintedKey);
    } catch {
      // Try fallback keys below.
    }
  }

  for (const key of keys.values()) {
    try {
      return decryptWithAesGcm(value, key);
    } catch {
      continue;
    }
  }

  return value;
}

export const piiValueTransformer: ValueTransformer = {
  to: (value: string | null | undefined) => encryptPii(value) as any,
  from: (value: string | null | undefined) => decryptPii(value) as any,
};

