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
