import jsQR from "jsqr";
import QRCode from "qrcode";
import { describe, expect, it } from "vitest";

import { buildMatrix, contrastRatio, matrixToSvg, QrTooLongError, styleWarning, DEFAULT_QR_STYLE } from "@/lib/qr/generate";
import { contactPayload, emailPayload, locationPayload, phonePayload, smsPayload, wifiPayload } from "@/lib/qr/payload";

describe("payloads", () => {
  it("builds Wi-Fi payloads with escaping", () => {
    expect(wifiPayload({ ssid: "Home", password: "secret", security: "WPA", hidden: false })).toBe("WIFI:T:WPA;S:Home;P:secret;;");
    expect(wifiPayload({ ssid: 'a;b:c"d', password: "p\\w,x", security: "WPA", hidden: true })).toBe('WIFI:T:WPA;S:a\\;b\\:c\\"d;P:p\\\\w\\,x;H:true;;');
    expect(wifiPayload({ ssid: "Open", password: "ignored", security: "nopass", hidden: false })).toBe("WIFI:T:nopass;S:Open;;");
  });

  it("builds email, phone, sms and geo payloads", () => {
    expect(emailPayload({ to: "a@b.co", subject: "Hi there", body: "x&y" })).toBe("mailto:a@b.co?subject=Hi%20there&body=x%26y");
    expect(emailPayload({ to: "a@b.co", subject: "", body: "" })).toBe("mailto:a@b.co");
    expect(phonePayload("+7 (999) 123-45-67")).toBe("tel:+79991234567");
    expect(smsPayload("+1 555 0100", "Hello: you")).toBe("SMSTO:+15550100:Hello: you");
    expect(locationPayload(" 55.75 ", "37.61")).toBe("geo:55.75,37.61");
  });

  it("builds a vCard", () => {
    const card = contactPayload({ firstName: "Ann", lastName: "Lee", organization: "A;B", phone: "+1 555", email: "a@b.co", url: "" });
    expect(card.split("\r\n")).toEqual(["BEGIN:VCARD", "VERSION:3.0", "N:Lee;Ann;;;", "FN:Ann Lee", "ORG:A\\;B", "TEL:+1 555", "EMAIL:a@b.co", "END:VCARD"]);
  });
});

describe("QR matrix", () => {
  it("builds a matrix and an SVG with one path", () => {
    const matrix = buildMatrix("hello", "M");
    expect(matrix.size).toBe(21);
    expect(matrix.modules).toHaveLength(21 * 21);
    const svg = matrixToSvg(matrix, DEFAULT_QR_STYLE, 256);
    expect(svg).toContain('viewBox="0 0 29 29"');
    expect(svg).toContain('width="256"');
    expect(svg.match(/<path/g)).toHaveLength(1);
    // Finder pattern: top-left module is dark and sits at the margin offset.
    expect(svg).toContain("M4 4h7");
  });

  it("raises a friendly error when the data does not fit", () => {
    expect(() => buildMatrix("x".repeat(4000), "H")).toThrow(QrTooLongError);
  });

  it("encodes a larger version for longer text and higher correction", () => {
    expect(buildMatrix("x".repeat(100), "L").size).toBeLessThan(buildMatrix("x".repeat(100), "H").size);
  });

  it("warns about unscannable colour choices", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 0);
    expect(styleWarning(DEFAULT_QR_STYLE)).toBeNull();
    expect(styleWarning({ ...DEFAULT_QR_STYLE, foreground: "#cccccc" })).toBe("lowContrast");
    expect(styleWarning({ ...DEFAULT_QR_STYLE, foreground: "#ffffff", background: "#000000" })).toBe("inverted");
  });

  it("is readable by the scanner (generate → decode round trip)", () => {
    for (const text of ["hello", "https://example.com/some/long/path?with=query&and=more", "Привет, мир — QR ✓"]) {
      const matrix = buildMatrix(text, "M");
      const scale = 6;
      const margin = 4;
      const side = (matrix.size + margin * 2) * scale;
      const data = new Uint8ClampedArray(side * side * 4).fill(255);
      for (let row = 0; row < matrix.size; row += 1) {
        for (let column = 0; column < matrix.size; column += 1) {
          if (!matrix.modules[row * matrix.size + column]) continue;
          for (let y = 0; y < scale; y += 1) {
            for (let x = 0; x < scale; x += 1) {
              const at = (((row + margin) * scale + y) * side + (column + margin) * scale + x) * 4;
              data[at] = data[at + 1] = data[at + 2] = 0;
            }
          }
        }
      }
      // A reference decoder must read back exactly what was encoded.
      expect(jsQR(data, side, side)?.data).toBe(text);
    }
  });

  it("agrees with the reference qrcode module on size", () => {
    expect(buildMatrix("agree", "Q").size).toBe(QRCode.create("agree", { errorCorrectionLevel: "Q" }).modules.size);
  });
});
