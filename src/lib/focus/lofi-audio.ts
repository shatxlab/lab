/**
 * Plays the lo-fi score (`lofi.ts`) with Web Audio: every instrument is built
 * from oscillators and filtered noise, so there are no audio files at all.
 *
 * `scheduleBar` works on any BaseAudioContext, so the same code can be rendered
 * offline (that is how it is checked); `createLofi` adds the live scheduler, the
 * volume and the browser's autoplay rules: audio may only begin after the user
 * has touched the page, so until then the state is "blocked" and the first tap,
 * click or key press starts it.
 */

import { BAR, midiToHz, planBar, type NoteEvent } from "@/lib/focus/lofi";
import { seededRandom } from "@/lib/focus/random";

export type LofiState = "idle" | "playing" | "blocked" | "unsupported";

/** Everything the voices connect to. */
export interface Bus {
  /** Where finished sound goes (tone shaping, then the master volume). */
  out: AudioNode;
  /** A reverb send: connect and scale to taste. */
  reverb: AudioNode;
  noise: AudioBuffer;
}

/** Looped white noise for hats, snares and the crackle bed. */
export function makeNoise(ctx: BaseAudioContext, seconds = 2, seed = 1): AudioBuffer {
  const buffer = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * seconds)), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  const next = seededRandom(seed);
  for (let i = 0; i < data.length; i += 1) data[i] = next() * 2 - 1;
  return buffer;
}

/** Vinyl: faint hiss with occasional pops, long enough that the loop is not noticed. */
export function makeCrackle(ctx: BaseAudioContext, seconds = 6, seed = 5): AudioBuffer {
  const buffer = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * seconds)), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  const next = seededRandom(seed);
  for (let i = 0; i < data.length; i += 1) data[i] = (next() * 2 - 1) * 0.02;
  const pops = Math.floor(seconds * 9);
  for (let p = 0; p < pops; p += 1) {
    const at = Math.floor(next() * (data.length - 400));
    const size = 0.25 + next() * 0.75;
    const length = 40 + Math.floor(next() * 160);
    for (let i = 0; i < length; i += 1) data[at + i] = (data[at + i] ?? 0) + (next() * 2 - 1) * size * Math.exp(-i / (length / 4));
  }
  return buffer;
}

/** A soft, dark room: decaying noise, a touch longer on the right. */
export function makeImpulse(ctx: BaseAudioContext, seconds = 2.2, seed = 9): AudioBuffer {
  const length = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let channel = 0; channel < 2; channel += 1) {
    const data = buffer.getChannelData(channel);
    const next = seededRandom(seed + channel);
    for (let i = 0; i < length; i += 1) data[i] = (next() * 2 - 1) * Math.pow(1 - i / length, 2.6 + channel * 0.3);
  }
  return buffer;
}

function envelope(param: AudioParam, at: number, peak: number, attack: number, hold: number, release: number) {
  param.setValueAtTime(0.0001, at);
  param.linearRampToValueAtTime(peak, at + attack);
  param.setTargetAtTime(peak * 0.45, at + attack, Math.max(0.02, hold / 3));
  param.setTargetAtTime(0.0001, at + hold, release / 3);
}

/** Electric-piano-ish: a triangle with a quiet octave above, through a dark filter. */
function playKeys(ctx: BaseAudioContext, bus: Bus, event: NoteEvent, at: number) {
  const hz = midiToHz(event.midi ?? 60);
  const amp = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 900 + event.velocity * 1800;
  const peak = 0.11 * event.velocity;
  envelope(amp.gain, at, peak, 0.012, event.duration, 0.5);
  const body = ctx.createOscillator();
  body.type = "triangle";
  body.frequency.value = hz;
  const shimmer = ctx.createOscillator();
  shimmer.type = "sine";
  shimmer.frequency.value = hz * 2;
  shimmer.detune.value = 6;
  const shimmerGain = ctx.createGain();
  shimmerGain.gain.value = 0.28;
  body.connect(filter);
  shimmer.connect(shimmerGain).connect(filter);
  filter.connect(amp);
  amp.connect(bus.out);
  const send = ctx.createGain();
  send.gain.value = 0.55;
  amp.connect(send).connect(bus.reverb);
  const stop = at + event.duration + 1.2;
  body.start(at);
  shimmer.start(at);
  body.stop(stop);
  shimmer.stop(stop);
}

/** A round sine bass with a little triangle for definition. */
function playBass(ctx: BaseAudioContext, bus: Bus, event: NoteEvent, at: number) {
  const hz = midiToHz(event.midi ?? 36);
  const amp = ctx.createGain();
  envelope(amp.gain, at, 0.2 * event.velocity, 0.02, event.duration, 0.18);
  const sine = ctx.createOscillator();
  sine.frequency.value = hz;
  const edge = ctx.createOscillator();
  edge.type = "triangle";
  edge.frequency.value = hz;
  const edgeGain = ctx.createGain();
  edgeGain.gain.value = 0.25;
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 420;
  sine.connect(amp);
  edge.connect(edgeGain).connect(filter).connect(amp);
  amp.connect(bus.out);
  const stop = at + event.duration + 0.6;
  sine.start(at);
  edge.start(at);
  sine.stop(stop);
  edge.stop(stop);
}

/** Boom: a sine that drops fast in pitch. */
function playKick(ctx: BaseAudioContext, bus: Bus, event: NoteEvent, at: number) {
  const osc = ctx.createOscillator();
  osc.frequency.setValueAtTime(130, at);
  osc.frequency.exponentialRampToValueAtTime(42, at + 0.14);
  const amp = ctx.createGain();
  amp.gain.setValueAtTime(0.0001, at);
  amp.gain.linearRampToValueAtTime(0.5 * event.velocity, at + 0.004);
  amp.gain.exponentialRampToValueAtTime(0.0001, at + 0.3);
  osc.connect(amp).connect(bus.out);
  osc.start(at);
  osc.stop(at + 0.34);
}

/** A short noise burst, band-passed: the snare and the hats differ only in the filter and length. */
function playNoise(ctx: BaseAudioContext, bus: Bus, event: NoteEvent, at: number, kind: "snare" | "hat") {
  const source = ctx.createBufferSource();
  source.buffer = bus.noise;
  source.loop = true;
  const filter = ctx.createBiquadFilter();
  const amp = ctx.createGain();
  const length = kind === "snare" ? 0.17 : 0.045;
  if (kind === "snare") {
    filter.type = "bandpass";
    filter.frequency.value = 1700;
    filter.Q.value = 0.7;
  } else {
    filter.type = "highpass";
    filter.frequency.value = 7000;
  }
  const peak = (kind === "snare" ? 0.24 : 0.07) * event.velocity;
  amp.gain.setValueAtTime(0.0001, at);
  amp.gain.linearRampToValueAtTime(peak, at + 0.002);
  amp.gain.exponentialRampToValueAtTime(0.0001, at + length);
  source.connect(filter).connect(amp).connect(bus.out);
  if (kind === "snare") {
    const send = ctx.createGain();
    send.gain.value = 0.5;
    amp.connect(send).connect(bus.reverb);
  }
  source.start(at, Math.random() * 1.5);
  source.stop(at + length + 0.05);
}

/** A soft sine lead with slow vibrato, mostly in the reverb. */
function playLead(ctx: BaseAudioContext, bus: Bus, event: NoteEvent, at: number) {
  const hz = midiToHz(event.midi ?? 72);
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.value = hz;
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 4.6;
  const depth = ctx.createGain();
  depth.gain.value = hz * 0.004;
  lfo.connect(depth).connect(osc.frequency);
  const amp = ctx.createGain();
  envelope(amp.gain, at, 0.09 * event.velocity, 0.05, event.duration, 0.45);
  osc.connect(amp);
  amp.connect(bus.out);
  const send = ctx.createGain();
  send.gain.value = 0.8;
  amp.connect(send).connect(bus.reverb);
  const stop = at + event.duration + 1.4;
  osc.start(at);
  lfo.start(at);
  osc.stop(stop);
  lfo.stop(stop);
}

/** Put one bar's events on the timeline, the bar starting at `start` seconds of the context's clock. */
export function scheduleBar(ctx: BaseAudioContext, bus: Bus, events: readonly NoteEvent[], start: number) {
  for (const event of events) {
    const at = start + event.at;
    switch (event.voice) {
      case "keys":
        playKeys(ctx, bus, event, at);
        break;
      case "bass":
        playBass(ctx, bus, event, at);
        break;
      case "kick":
        playKick(ctx, bus, event, at);
        break;
      case "snare":
        playNoise(ctx, bus, event, at, "snare");
        break;
      case "hat":
        playNoise(ctx, bus, event, at, "hat");
        break;
      case "lead":
        playLead(ctx, bus, event, at);
        break;
    }
  }
}

export interface Mix {
  bus: Bus;
  /** The master volume node: ramp its gain to fade. */
  master: GainNode;
}

/** The fixed part of the signal path: tone, reverb, crackle and a gentle compressor into `master`. */
export function createMix(ctx: BaseAudioContext, destination: AudioNode, seed = 1): Mix {
  const master = ctx.createGain();
  master.gain.value = 0;
  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -20;
  compressor.ratio.value = 3;
  compressor.attack.value = 0.02;
  compressor.release.value = 0.3;
  // Lo-fi is warm and slightly dull: roll the top off, and the very bottom.
  const dull = ctx.createBiquadFilter();
  dull.type = "lowpass";
  dull.frequency.value = 5200;
  const rumble = ctx.createBiquadFilter();
  rumble.type = "highpass";
  rumble.frequency.value = 38;
  dull.connect(rumble).connect(compressor).connect(master).connect(destination);

  const reverb = ctx.createConvolver();
  reverb.buffer = makeImpulse(ctx, 2.2, seed + 9);
  const wet = ctx.createGain();
  wet.gain.value = 0.32;
  reverb.connect(wet).connect(dull);

  const crackle = ctx.createBufferSource();
  crackle.buffer = makeCrackle(ctx, 6, seed + 5);
  crackle.loop = true;
  const crackleFilter = ctx.createBiquadFilter();
  crackleFilter.type = "highpass";
  crackleFilter.frequency.value = 1400;
  const crackleGain = ctx.createGain();
  crackleGain.gain.value = 0.16;
  crackle.connect(crackleFilter).connect(crackleGain).connect(dull);
  crackle.start();

  return { bus: { out: dull, reverb, noise: makeNoise(ctx, 2, seed + 1) }, master };
}

/** Loudness reached at full volume; the master gain is this times the volume. */
export const FULL_GAIN = 0.9;

/** Render `bars` bars offline (for checking the sound without a speaker). */
export async function renderOffline(bars: number, seed = 1, sampleRate = 44100): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(2, Math.ceil(sampleRate * (bars * BAR + 2)), sampleRate);
  const mix = createMix(ctx, ctx.destination, seed);
  mix.master.gain.value = FULL_GAIN * 0.6;
  for (let bar = 0; bar < bars; bar += 1) scheduleBar(ctx, mix.bus, planBar(bar, seed), 0.1 + bar * BAR);
  return ctx.startRendering();
}

export interface Lofi {
  readonly state: LofiState;
  /** Begin playing, or wait for the first tap if the browser forbids it yet. */
  start(): Promise<LofiState>;
  stop(): void;
  setVolume(volume: number): void;
  setMuted(muted: boolean): void;
  subscribe(listener: (state: LofiState) => void): () => void;
}

/** Bars scheduled ahead of the clock: enough to survive a throttled timer. */
const LOOKAHEAD_BARS = 3;
const PUMP_MS = 700;
const FADE_IN_S = 3;

type ContextFactory = () => AudioContext | null;
const defaultFactory: ContextFactory = () => {
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    return Ctor ? new Ctor() : null;
  } catch {
    return null;
  }
};

export function createLofi(options: { seed?: number; volume?: number; muted?: boolean; makeContext?: ContextFactory } = {}): Lofi {
  const seed = options.seed ?? (Date.now() & 0x7fffffff);
  const makeContext = options.makeContext ?? defaultFactory;
  let volume = options.volume ?? 0.6;
  let muted = options.muted ?? false;
  let state: LofiState = "idle";
  let ctx: AudioContext | null = null;
  let mix: Mix | null = null;
  let timer: number | undefined;
  let nextBar = 0;
  let barTime = 0;
  let gestureOff: (() => void) | null = null;
  const listeners = new Set<(state: LofiState) => void>();

  const set = (next: LofiState) => {
    if (state === next) return;
    state = next;
    for (const listener of listeners) listener(next);
  };
  const level = () => (muted ? 0 : volume * FULL_GAIN);

  const pump = () => {
    if (!ctx || !mix || ctx.state !== "running") return;
    while (barTime < ctx.currentTime + LOOKAHEAD_BARS * BAR) {
      scheduleBar(ctx, mix.bus, planBar(nextBar, seed), barTime);
      nextBar += 1;
      barTime += BAR;
    }
  };

  const begin = () => {
    if (!ctx || mix) return;
    mix = createMix(ctx, ctx.destination, seed);
    mix.master.gain.setValueAtTime(0, ctx.currentTime);
    mix.master.gain.linearRampToValueAtTime(level(), ctx.currentTime + FADE_IN_S);
    barTime = ctx.currentTime + 0.15;
    nextBar = 0;
    pump();
    timer = window.setInterval(pump, PUMP_MS);
    set("playing");
  };

  const listenForGesture = () => {
    if (gestureOff) return;
    const events = ["pointerdown", "keydown", "touchend"] as const;
    const go = () => {
      gestureOff?.();
      void ctx?.resume().then(begin, () => {});
    };
    for (const name of events) window.addEventListener(name, go, { once: true, passive: true });
    gestureOff = () => {
      for (const name of events) window.removeEventListener(name, go);
      gestureOff = null;
    };
  };

  return {
    get state() {
      return state;
    },
    async start() {
      if (state === "playing" || state === "unsupported") return state;
      ctx ??= makeContext();
      if (!ctx) {
        set("unsupported");
        return state;
      }
      if (ctx.state === "suspended") {
        // Resolves at once where autoplay is allowed, and never until a gesture where it is not.
        await Promise.race([ctx.resume().catch(() => {}), new Promise((resolve) => setTimeout(resolve, 300))]);
      }
      if (ctx.state === "running") begin();
      else {
        set("blocked");
        listenForGesture();
      }
      return state;
    },
    stop() {
      gestureOff?.();
      window.clearInterval(timer);
      timer = undefined;
      const closing = ctx;
      ctx = null;
      mix = null;
      void closing?.close().catch(() => {});
      if (state !== "unsupported") set("idle");
    },
    setVolume(next) {
      volume = Math.max(0, Math.min(1, next));
      if (ctx && mix) mix.master.gain.setTargetAtTime(level(), ctx.currentTime, 0.08);
    },
    setMuted(next) {
      muted = next;
      if (ctx && mix) mix.master.gain.setTargetAtTime(level(), ctx.currentTime, 0.08);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}
