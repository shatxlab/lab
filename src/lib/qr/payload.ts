/*
 * Builders and parsers for the text payloads QR codes carry. Phone cameras
 * recognise these conventions (WIFI:, mailto:, tel:, SMSTO:, geo:, vCard) and
 * offer the matching action, so they have to be exact.
 */

export type PayloadKind = "text" | "wifi" | "email" | "phone" | "sms" | "contact" | "location";

export type WifiSecurity = "WPA" | "WEP" | "nopass";

export interface WifiFields {
  ssid: string;
  password: string;
  security: WifiSecurity;
  hidden: boolean;
}

/** Escape the characters the WIFI: format reserves. */
function wifiEscape(value: string): string {
  return value.replace(/([\\;,:"])/g, "\\$1");
}

export function wifiPayload({ ssid, password, security, hidden }: WifiFields): string {
  const parts = [`T:${security}`, `S:${wifiEscape(ssid)}`];
  if (security !== "nopass") parts.push(`P:${wifiEscape(password)}`);
  if (hidden) parts.push("H:true");
  return `WIFI:${parts.join(";")};;`;
}

export interface EmailFields {
  to: string;
  subject: string;
  body: string;
}

export function emailPayload({ to, subject, body }: EmailFields): string {
  const query = [subject && `subject=${encodeURIComponent(subject)}`, body && `body=${encodeURIComponent(body)}`].filter(Boolean).join("&");
  return `mailto:${to.trim()}${query ? `?${query}` : ""}`;
}

export function phonePayload(number: string): string {
  return `tel:${number.replace(/[^\d+]/g, "")}`;
}

export function smsPayload(number: string, message: string): string {
  return `SMSTO:${number.replace(/[^\d+]/g, "")}:${message}`;
}

export interface ContactFields {
  firstName: string;
  lastName: string;
  organization: string;
  phone: string;
  email: string;
  url: string;
}

function vcardEscape(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/([;,])/g, "\\$1");
}

export function contactPayload(fields: ContactFields): string {
  const full = [fields.firstName, fields.lastName].filter(Boolean).join(" ");
  const lines = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `N:${vcardEscape(fields.lastName)};${vcardEscape(fields.firstName)};;;`,
    `FN:${vcardEscape(full)}`,
  ];
  if (fields.organization) lines.push(`ORG:${vcardEscape(fields.organization)}`);
  if (fields.phone) lines.push(`TEL:${fields.phone.trim()}`);
  if (fields.email) lines.push(`EMAIL:${fields.email.trim()}`);
  if (fields.url) lines.push(`URL:${fields.url.trim()}`);
  lines.push("END:VCARD");
  return lines.join("\r\n");
}

export function locationPayload(latitude: string, longitude: string): string {
  return `geo:${latitude.trim()},${longitude.trim()}`;
}

/* -------------------------------------------------------------- parsing */

export type ScanResult =
  | { kind: "url"; text: string; url: string }
  | { kind: "wifi"; text: string; ssid: string; password: string; security: string; hidden: boolean }
  | { kind: "email"; text: string; address: string }
  | { kind: "phone"; text: string; number: string }
  | { kind: "sms"; text: string; number: string; message: string }
  | { kind: "geo"; text: string; latitude: string; longitude: string }
  | { kind: "contact"; text: string }
  | { kind: "text"; text: string };

function splitUnescaped(input: string, separator: string): string[] {
  const parts: string[] = [];
  let current = "";
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index]!;
    if (char === "\\" && index + 1 < input.length) {
      current += input[index + 1];
      index += 1;
    } else if (char === separator) {
      parts.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  parts.push(current);
  return parts;
}

/** Classify whatever a QR code decoded to. Only http(s) counts as a link. */
export function parseScanResult(text: string): ScanResult {
  const trimmed = text.trim();

  if (/^wifi:/i.test(trimmed)) {
    const fields: Record<string, string> = {};
    for (const part of splitUnescaped(trimmed.slice(5), ";")) {
      const colon = part.indexOf(":");
      if (colon > 0) fields[part.slice(0, colon).toUpperCase()] = part.slice(colon + 1);
    }
    return {
      kind: "wifi",
      text,
      ssid: fields.S ?? "",
      password: fields.P ?? "",
      security: fields.T ?? "",
      hidden: fields.H === "true",
    };
  }
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      return { kind: "url", text, url: new URL(trimmed).href };
    } catch {
      return { kind: "text", text };
    }
  }
  if (/^mailto:/i.test(trimmed)) return { kind: "email", text, address: decodeURIComponent(trimmed.slice(7).split("?")[0] ?? "") };
  if (/^tel:/i.test(trimmed)) return { kind: "phone", text, number: trimmed.slice(4) };
  if (/^smsto?:/i.test(trimmed)) {
    const rest = trimmed.replace(/^smsto?:/i, "");
    const colon = rest.indexOf(":");
    return { kind: "sms", text, number: colon < 0 ? rest : rest.slice(0, colon), message: colon < 0 ? "" : rest.slice(colon + 1) };
  }
  if (/^geo:/i.test(trimmed)) {
    const [latitude = "", longitude = ""] = trimmed.slice(4).split(/[,;?]/);
    return { kind: "geo", text, latitude, longitude };
  }
  if (/^BEGIN:VCARD/i.test(trimmed)) return { kind: "contact", text };
  return { kind: "text", text };
}
