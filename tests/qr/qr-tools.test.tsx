// @vitest-environment jsdom
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import QrTools from "@/components/tools/QrTools";
import { axeViolations, click, mount, type, waitFor } from "../helpers/dom";

vi.mock("@/lib/qr/scan", () => ({
  decodeFrame: vi.fn(async () => null),
  decodeImageFile: vi.fn(async (file: File) => (file.name === "wifi.png" ? "WIFI:T:WPA;S:Cafe;P:latte123;;" : file.name === "link.png" ? "https://example.com/x" : null)),
}));

beforeEach(() => {
  HTMLCanvasElement.prototype.getContext = (() => ({ fillRect() {}, drawImage() {}, fillStyle: "" })) as never;
});

afterEach(() => {
  document.body.innerHTML = "";
  localStorage.clear();
});

const tab = (name: string) => [...document.querySelectorAll('[role="tab"]')].find((node) => node.textContent === name) as HTMLElement;
const input = (label: string) =>
  [...document.querySelectorAll("label")].find((node) => node.textContent?.trim().startsWith(label))?.querySelector("input, textarea, select") as HTMLInputElement & HTMLSelectElement & HTMLTextAreaElement;
const button = (text: string) => [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === text) as HTMLElement;

async function pickImage(name: string) {
  const fileInput = document.querySelector<HTMLInputElement>('input[type="file"]')!;
  Object.defineProperty(fileInput, "files", { value: [new File(["x"], name, { type: "image/png" })], configurable: true });
  await act(async () => {
    fileInput.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

describe("QrTools — create", () => {
  it("renders a code for text and offers downloads", async () => {
    const view = await mount(<QrTools />);
    expect(document.body.textContent).toContain("Fill in the form");
    await type(input("Text or URL"), "hello");
    await waitFor(() => expect(document.querySelector('canvas[role="img"]')).toBeTruthy());
    expect(document.body.textContent).toContain("21×21 modules");
    expect(button("Download PNG")).toBeTruthy();
    expect(button("Download SVG")).toBeTruthy();
    expect(await axeViolations()).toEqual([]);
    view.unmount();
  });

  it("builds a Wi-Fi payload and hides the password field for open networks", async () => {
    const view = await mount(<QrTools />);
    await act(async () => {
      const select = input("What to encode");
      select.value = "wifi";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await type(input("Network name (SSID)"), "Home");
    await type(input("Password"), "pw;1");
    await click(document.querySelector("details summary"));
    await waitFor(() => expect(document.querySelector("details pre")?.textContent).toBe("WIFI:T:WPA;S:Home;P:pw\\;1;;"));
    await act(async () => {
      const select = input("Security");
      select.value = "nopass";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(input("Password")).toBeUndefined();
    expect(await axeViolations()).toEqual([]);
    view.unmount();
  });

  it("warns about low contrast and about data that is too long", async () => {
    const view = await mount(<QrTools />);
    await type(input("Text or URL"), "x".repeat(4000));
    await waitFor(() => expect(document.body.textContent).toContain("too much data"));
    await type(input("Text or URL"), "ok");
    await type(input("Code colour"), "#dddddd");
    await waitFor(() => expect(document.body.textContent).toContain("Low contrast"));
    view.unmount();
  });
});

describe("QrTools — scan", () => {
  it("explains when no camera is available", async () => {
    const view = await mount(<QrTools />);
    await click(tab("Scan"));
    await click(button("Start camera"));
    await waitFor(() => expect(document.body.textContent).toContain("No camera is available"));
    expect(await axeViolations()).toEqual([]);
    view.unmount();
  });

  it("decodes an image and shows Wi-Fi details, then keeps history", async () => {
    const view = await mount(<QrTools />);
    await click(tab("Scan"));
    await pickImage("wifi.png");
    await waitFor(() => expect(document.body.textContent).toContain("latte123"));
    expect(document.body.textContent).toContain("Cafe");
    await pickImage("link.png");
    await waitFor(() => expect(document.querySelector('a[href="https://example.com/x"]')).toBeTruthy());
    const link = document.querySelector<HTMLAnchorElement>('a[href="https://example.com/x"]')!;
    expect(link.rel).toContain("noopener");
    expect(link.target).toBe("_blank");
    expect(document.querySelector("#qr-history-title")).toBeTruthy();
    expect(await axeViolations()).toEqual([]);

    await click(button("Create a code from this"));
    expect(input("Text or URL").value).toBe("https://example.com/x");
    view.unmount();
  });

  it("reports an image without a code", async () => {
    const view = await mount(<QrTools />);
    await click(tab("Scan"));
    await pickImage("blank.png");
    await waitFor(() => expect(document.body.textContent).toContain("No QR code was found"));
    view.unmount();
  });
});
