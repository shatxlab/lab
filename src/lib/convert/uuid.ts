/** UUID generation (v4 random, v7 time-ordered) and inspection. */

export type UuidVersion = "v4" | "v7" | "nil";

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}

function format(bytes: Uint8Array): string {
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function uuidV4(): string {
  const bytes = randomBytes(16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  return format(bytes);
}

/** RFC 9562 UUIDv7: 48-bit Unix ms timestamp, then random bits. */
export function uuidV7(now: number = Date.now()): string {
  const bytes = randomBytes(16);
  let remaining = now;
  for (let index = 5; index >= 0; index -= 1) {
    bytes[index] = remaining % 256;
    remaining = Math.floor(remaining / 256);
  }
  bytes[6] = (bytes[6]! & 0x0f) | 0x70;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  return format(bytes);
}

export const NIL_UUID = "00000000-0000-0000-0000-000000000000";

export interface UuidOptions {
  version: UuidVersion;
  count: number;
  uppercase: boolean;
  hyphens: boolean;
  braces: boolean;
}

export function generateUuids(options: UuidOptions): string[] {
  const count = Math.min(Math.max(Math.floor(options.count) || 1, 1), 500);
  const list: string[] = [];
  for (let index = 0; index < count; index += 1) {
    // v7 within the same millisecond stays unique through the random bits; a
    // +index nudge keeps a batch sorted in generation order.
    let value = options.version === "v4" ? uuidV4() : options.version === "v7" ? uuidV7(Date.now() + index) : NIL_UUID;
    if (!options.hyphens) value = value.replace(/-/g, "");
    if (options.uppercase) value = value.toUpperCase();
    if (options.braces) value = `{${value}}`;
    list.push(value);
  }
  return list;
}

export interface UuidInfo {
  valid: true;
  version: number;
  variant: string;
  /** Embedded creation time for v1 and v7. */
  timestamp?: Date;
}

const UUID_PATTERN = /^\{?([0-9a-f]{8})-?([0-9a-f]{4})-?([0-9a-f]{4})-?([0-9a-f]{4})-?([0-9a-f]{12})\}?$/i;

export function inspectUuid(input: string): UuidInfo | { valid: false } {
  const match = UUID_PATTERN.exec(input.trim());
  if (!match) return { valid: false };
  const [, a, b, c, d, e] = match as unknown as string[];
  const hex = `${a}${b}${c}${d}${e}`;
  const version = Number.parseInt(hex[12]!, 16);
  const variantNibble = Number.parseInt(hex[16]!, 16);
  const variant = hex === "0".repeat(32) ? "nil" : variantNibble < 8 ? "NCS" : variantNibble < 12 ? "RFC 9562" : variantNibble < 14 ? "Microsoft" : "reserved";

  let timestamp: Date | undefined;
  if (version === 7) {
    timestamp = new Date(Number.parseInt(hex.slice(0, 12), 16));
  } else if (version === 1) {
    // 60-bit count of 100 ns intervals since 1582-10-15.
    const ticks = (BigInt(`0x${hex.slice(13, 16)}`) << 48n) | (BigInt(`0x${hex.slice(8, 12)}`) << 32n) | BigInt(`0x${hex.slice(0, 8)}`);
    const ms = Number(ticks / 10000n) - 12219292800000;
    timestamp = new Date(ms);
  }
  return { valid: true, version, variant, timestamp };
}
