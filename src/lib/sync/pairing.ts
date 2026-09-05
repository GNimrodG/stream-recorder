import { randomBytes } from "node:crypto";

const PAIRING_TTL_MS = 10 * 60 * 1000; // 10 minutes

interface PairingToken {
  token: string;
  expiresAt: number;
  used: boolean;
}

type PairingGlobal = typeof globalThis & {
  __streamRecorderPairingTokens?: Map<string, PairingToken>;
};

const pairingGlobal = globalThis as PairingGlobal;
const tokens = pairingGlobal.__streamRecorderPairingTokens ?? (pairingGlobal.__streamRecorderPairingTokens = new Map());

function pruneExpiredTokens() {
  const now = Date.now();
  for (const [key, entry] of tokens.entries()) {
    if (entry.expiresAt < now) {
      tokens.delete(key);
    }
  }
}

export function createPairingToken(): { token: string; expiresAt: number } {
  pruneExpiredTokens();
  const token = randomBytes(24).toString("base64url");
  const expiresAt = Date.now() + PAIRING_TTL_MS;
  tokens.set(token, { token, expiresAt, used: false });
  return { token, expiresAt };
}

/** Validates and consumes a pairing token; a token can only be redeemed once. */
export function consumePairingToken(token: string): boolean {
  pruneExpiredTokens();
  const entry = tokens.get(token);
  if (!entry || entry.used || entry.expiresAt < Date.now()) {
    return false;
  }
  entry.used = true;
  return true;
}

export interface PairingCodePayload {
  baseUrl: string;
  token: string;
}

export function encodePairingCode(payload: PairingCodePayload): string {
  return Buffer.from(JSON.stringify(payload), "utf-8").toString("base64url");
}

export function decodePairingCode(code: string): PairingCodePayload {
  const decoded = Buffer.from(code, "base64url").toString("utf-8");
  const parsed = JSON.parse(decoded) as PairingCodePayload;
  if (!parsed.baseUrl || !parsed.token) {
    throw new Error("Invalid pairing code");
  }
  return parsed;
}
