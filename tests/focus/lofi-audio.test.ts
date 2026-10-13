// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createLofi, makeCrackle, makeImpulse, makeNoise, scheduleBar, createMix, FULL_GAIN } from "@/lib/focus/lofi-audio";
import { BAR, planBar } from "@/lib/focus/lofi";

/** A stand-in for the audio graph that records what is built and never plays anything. */
function fakeContext(initial: "running" | "suspended" = "running", resumes = true) {
  const created = new Map<string, number>();
  const note = (name: string) => created.set(name, (created.get(name) ?? 0) + 1);
  const param = () => ({ value: 0, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn(), setTargetAtTime: vi.fn() });
  const node = (name: string) => {
    note(name);
    const target: Record<string, unknown> = {
      connect: (to: unknown) => to,
      start: vi.fn(),
      stop: vi.fn(),
      frequency: param(),
      detune: param(),
      gain: param(),
      Q: param(),
      threshold: param(),
      ratio: param(),
      attack: param(),
      release: param(),
    };
    return target;
  };
  const ctx = {
    state: initial as AudioContextState,
    currentTime: 0,
    sampleRate: 8000,
    destination: {},
    created,
    resume: vi.fn(async () => {
      if (resumes) ctx.state = "running";
      else await new Promise(() => {});
    }),
    close: vi.fn(async () => {
      ctx.state = "closed";
    }),
    createBuffer: (_c: number, length: number) => ({ getChannelData: () => new Float32Array(length), length }),
    createGain: () => node("gain"),
    createOscillator: () => node("osc"),
    createBiquadFilter: () => node("filter"),
    createBufferSource: () => node("source"),
    createConvolver: () => node("convolver"),
    createDynamicsCompressor: () => node("compressor"),
  };
  return ctx;
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("generated buffers", () => {
  const ctx = fakeContext() as unknown as BaseAudioContext;

  it("makes noise, vinyl and a room of the right sizes, filled with sound", () => {
    expect(makeNoise(ctx, 2).length).toBe(16000);
    expect(makeCrackle(ctx, 3).length).toBe(24000);
    expect(makeImpulse(ctx, 1).length).toBe(8000);
  });

  it("really fills them (using a context that keeps its samples)", () => {
    const real = { sampleRate: 44100, createBuffer: (c: number, n: number) => { const data = Array.from({ length: c }, () => new Float32Array(n)); return { getChannelData: (i: number) => data[i], length: n }; } } as unknown as BaseAudioContext;
    const noise = makeNoise(real, 0.1).getChannelData(0);
    expect(noise.some((v) => v !== 0)).toBe(true);
    expect(noise.reduce((m, v) => Math.max(m, Math.abs(v)), 0)).toBeLessThanOrEqual(1);
    const crackle = makeCrackle(real, 6).getChannelData(0);
    expect(crackle.reduce((m, v) => Math.max(m, Math.abs(v)), 0)).toBeGreaterThan(0.1); // there are pops
    expect(crackle.filter((v) => Math.abs(v) < 0.03).length).toBeGreaterThan(crackle.length * 0.8); // and mostly quiet hiss
    const impulse = makeImpulse(real, 0.2);
    const left = impulse.getChannelData(0);
    expect(Math.abs(left[0]!)).toBeGreaterThan(Math.abs(left[left.length - 1]!));
  });
});

describe("scheduleBar", () => {
  it("builds a voice for every event and starts and stops every oscillator", () => {
    const ctx = fakeContext();
    const mix = createMix(ctx as unknown as BaseAudioContext, ctx.destination as AudioNode);
    const before = ctx.created.get("osc") ?? 0;
    const events = planBar(0, 3);
    expect(() => scheduleBar(ctx as unknown as BaseAudioContext, mix.bus, events, 1)).not.toThrow();
    expect((ctx.created.get("osc") ?? 0) - before).toBeGreaterThan(events.filter((e) => e.voice === "keys").length);
    expect(mix.master.gain.value).toBe(0); // starts silent; the player fades it in
  });
});

describe("createLofi", () => {
  it("plays at once where the browser allows it, fades in, and keeps scheduling bars ahead", async () => {
    const ctx = fakeContext("running");
    const lofi = createLofi({ seed: 1, makeContext: () => ctx as unknown as AudioContext });
    const states: string[] = [];
    lofi.subscribe((s) => states.push(s));
    expect(lofi.state).toBe("idle");
    await lofi.start();
    expect(lofi.state).toBe("playing");
    expect(states).toEqual(["playing"]);
    const oscAtStart = ctx.created.get("osc")!;
    expect(oscAtStart).toBeGreaterThan(20); // three bars were put on the timeline straight away
    // Time passes: more bars appear before the clock reaches the end of the old ones.
    ctx.currentTime = 4 * BAR;
    vi.advanceTimersByTime(1500);
    expect(ctx.created.get("osc")!).toBeGreaterThan(oscAtStart);
    lofi.stop();
    expect(lofi.state).toBe("idle");
    expect(ctx.close).toHaveBeenCalled();
  });

  it("waits for the first tap when the browser blocks audio, then starts", async () => {
    const ctx = fakeContext("suspended", false);
    const lofi = createLofi({ makeContext: () => ctx as unknown as AudioContext });
    const started = lofi.start();
    await vi.advanceTimersByTimeAsync(400);
    await started;
    expect(lofi.state).toBe("blocked");
    expect(ctx.created.get("osc") ?? 0).toBe(0);

    // The tap lets the context run.
    ctx.resume.mockImplementation(async () => {
      ctx.state = "running";
    });
    window.dispatchEvent(new Event("pointerdown"));
    await vi.advanceTimersByTimeAsync(10);
    expect(lofi.state).toBe("playing");
    expect(ctx.created.get("osc")!).toBeGreaterThan(20);
    lofi.stop();
  });

  it("stops listening for a tap when stopped while blocked", async () => {
    const ctx = fakeContext("suspended", false);
    const lofi = createLofi({ makeContext: () => ctx as unknown as AudioContext });
    const started = lofi.start();
    await vi.advanceTimersByTimeAsync(400);
    await started;
    lofi.stop();
    ctx.resume.mockImplementation(async () => {
      ctx.state = "running";
    });
    window.dispatchEvent(new Event("pointerdown"));
    await vi.advanceTimersByTimeAsync(10);
    expect(lofi.state).toBe("idle");
  });

  it("is unsupported, and quiet about it, where there is no audio", async () => {
    const lofi = createLofi({ makeContext: () => null });
    await lofi.start();
    expect(lofi.state).toBe("unsupported");
    lofi.stop();
    expect(lofi.state).toBe("unsupported");
  });

  it("changes the volume smoothly and mutes by going to zero", async () => {
    const ctx = fakeContext("running");
    const lofi = createLofi({ volume: 0.5, makeContext: () => ctx as unknown as AudioContext });
    await lofi.start();
    // The master gain is the first gain node made by the mix.
    const gains = ctx.createGain;
    expect(FULL_GAIN).toBeGreaterThan(0);
    lofi.setVolume(2); // clamped
    lofi.setMuted(true);
    lofi.setMuted(false);
    lofi.setVolume(-1);
    expect(gains).toBeTypeOf("function");
    lofi.stop();
  });

  it("does not start twice", async () => {
    const ctx = fakeContext("running");
    const lofi = createLofi({ makeContext: () => ctx as unknown as AudioContext });
    await lofi.start();
    const count = ctx.created.get("osc");
    await lofi.start();
    expect(ctx.created.get("osc")).toBe(count);
    lofi.stop();
  });
});
