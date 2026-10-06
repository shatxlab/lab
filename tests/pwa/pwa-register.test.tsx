// @vitest-environment jsdom
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import PwaRegister from "@/components/apps/PwaRegister";
import { axeViolations, click, mount, waitFor } from "../helpers/dom";

type Listener = (event?: unknown) => void;

function fakeWorker() {
  const listeners: Record<string, Listener[]> = {};
  return {
    state: "installing",
    postMessage: vi.fn(),
    addEventListener: (type: string, fn: Listener) => (listeners[type] ??= []).push(fn),
    emit(type: string) {
      listeners[type]?.forEach((fn) => fn());
    },
  };
}

function setup({ controller }: { controller: boolean }) {
  const containerListeners: Record<string, Listener[]> = {};
  const regListeners: Record<string, Listener[]> = {};
  const installing = fakeWorker();
  const registration = {
    waiting: null as ReturnType<typeof fakeWorker> | null,
    installing: null as ReturnType<typeof fakeWorker> | null,
    addEventListener: (type: string, fn: Listener) => (regListeners[type] ??= []).push(fn),
    update: vi.fn().mockResolvedValue(undefined),
  };
  const serviceWorker = {
    controller: controller ? {} : null,
    register: vi.fn().mockResolvedValue(registration),
    addEventListener: (type: string, fn: Listener) => (containerListeners[type] ??= []).push(fn),
    removeEventListener: vi.fn(),
  };
  Object.defineProperty(navigator, "serviceWorker", { value: serviceWorker, configurable: true });
  return {
    serviceWorker,
    registration,
    installing,
    foundWorker() {
      registration.installing = installing;
      regListeners.updatefound?.forEach((fn) => fn());
      installing.state = "installed";
      installing.emit("statechange");
    },
    controllerChange() {
      containerListeners.controllerchange?.forEach((fn) => fn());
    },
  };
}

beforeEach(() => {
  vi.stubEnv("PROD", true);
});

afterEach(() => {
  vi.unstubAllEnvs();
  document.body.innerHTML = "";
  localStorage.clear();
  Reflect.deleteProperty(navigator, "serviceWorker");
});

describe("PwaRegister", () => {
  it("registers the worker for the whole site", async () => {
    const env = setup({ controller: true });
    const view = await mount(<PwaRegister />);
    await waitFor(() => expect(env.serviceWorker.register).toHaveBeenCalledTimes(1));
    expect(env.serviceWorker.register.mock.calls[0]![0]).toMatch(/sw\.js$/);
    expect(env.serviceWorker.register.mock.calls[0]![1].scope).toMatch(/\/$/);
    view.unmount();
  });

  it("announces offline readiness on the first install, then lets it be dismissed", async () => {
    const env = setup({ controller: false });
    const view = await mount(<PwaRegister />);
    await waitFor(() => expect(env.serviceWorker.register).toHaveBeenCalled());
    await act(async () => env.foundWorker());
    expect(document.querySelector('[role="status"]')?.textContent).toContain("ready to work offline");
    expect(document.querySelector(".lab-toast-primary")).toBeNull();
    expect(await axeViolations()).toEqual([]);
    await click([...document.querySelectorAll("button")].find((b) => b.textContent === "Dismiss"));
    expect(document.querySelector(".lab-toast")).toBeNull();
    view.unmount();
  });

  it("offers a reload when a new version is waiting, and reloads only after the visitor agrees", async () => {
    const reload = vi.fn();
    Object.defineProperty(window, "location", { value: { ...window.location, reload }, writable: true });
    const env = setup({ controller: true });
    const view = await mount(<PwaRegister />);
    await waitFor(() => expect(env.serviceWorker.register).toHaveBeenCalled());
    await act(async () => env.foundWorker());
    expect(document.querySelector(".lab-toast")?.textContent).toContain("new version");

    // A controller change nobody asked for must not yank the page away.
    await act(async () => env.controllerChange());
    expect(reload).not.toHaveBeenCalled();

    await click(document.querySelector(".lab-toast-primary"));
    expect(env.installing.postMessage).toHaveBeenCalledWith("SKIP_WAITING");
    await act(async () => env.controllerChange());
    expect(reload).toHaveBeenCalledTimes(1);
    view.unmount();
  });

  it("keeps working when service workers are unavailable", async () => {
    const view = await mount(<PwaRegister />);
    expect(view.container.innerHTML).toBe("");
    view.unmount();
  });
});
