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

import { BAR, BEAT, midiToHz, planBar, type NoteEvent } from "@/lib/focus/lofi";
import { seededRandom } from "@/lib/focus/random";

export type LofiState = "idle" | "playing" | "blocked" | "unsupported";

/** Everything the voices connect to. */
export interface Bus {
  /** Where finished sound goes (tone shaping, then the master volume). */
  out: AudioNode;
  /** A reverb send: connect and scale to taste. */
  reverb: AudioNode;
  /** A dotted-eighth echo send, darker on every repeat. */
  echo: AudioNode;
  /** A slow pitch drift, in cents, like a tape that does not quite hold speed: connect it to `detune`. */
  wobble: AudioNode;
  noise: AudioBuffer;
}

/** Looped white noise for the brushes and hats. */
export function makeNoise(ctx: BaseAudioContext, seconds = 2, seed = 1): AudioBuffer {
  const buffer = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * seconds)), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  const next = seededRandom(seed);
  for (let i = 0; i < data.length; i += 1) data[i] = next() * 2 - 1;
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

/** Rise to `peak`, settle to `sustain` of it while held, then fade out after `hold` seconds. */
function envelope(param: AudioParam, at: number, peak: number, attack: number, hold: number, release: number, sustain = 0.45, decay = hold / 3) {
  param.setValueAtTime(0.0001, at);
  param.linearRampToValueAtTime(peak, at + attack);
  param.setTargetAtTime(peak * sustain, at + attack, Math.max(0.02, decay));
  param.setTargetAtTime(0.0001, at + Math.max(hold, attack), release / 3);
}

function send(ctx: BaseAudioContext, from: AudioNode, to: AudioNode, amount: number) {
  const gain = ctx.createGain();
  gain.gain.value = amount;
  from.connect(gain).connect(to);
}

/** Electric piano: a sine whose tone is shaped by a second sine at the same pitch (FM), soft at the attack and mellow after. */
function playKeys(ctx: BaseAudioContext, bus: Bus, event: NoteEvent, at: number) {
  const hz = midiToHz(event.midi ?? 60);
  const v = event.velocity;
  const carrier = ctx.createOscillator();
  carrier.frequency.value = hz;
  const modulator = ctx.createOscillator();
  modulator.frequency.value = hz;
  const index = ctx.createGain();
  index.gain.setValueAtTime(hz * (0.25 + 0.6 * v), at);
  index.gain.setTargetAtTime(hz * 0.08, at, 0.25);
  modulator.connect(index).connect(carrier.frequency);
  bus.wobble.connect(carrier.detune);
  bus.wobble.connect(modulator.detune);

  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 900 + v * 900;
  const amp = ctx.createGain();
  envelope(amp.gain, at, 0.075 * v, 0.006, event.duration, 0.35, 0.4, 0.6);
  carrier.connect(filter);
  filter.connect(amp);
  amp.connect(bus.out);
  send(ctx, amp, bus.reverb, 0.45);

  const stop = at + event.duration + 1;
  for (const osc of [carrier, modulator]) {
    osc.start(at);
    osc.stop(stop);
  }
}

/** A warm string-machine bed: two slightly detuned saws, filtered dark, swelling in slowly. */
function playPad(ctx: BaseAudioContext, bus: Bus, event: NoteEvent, at: number) {
  const hz = midiToHz(event.midi ?? 60);
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 700;
  filter.Q.value = 0.3;
  const amp = ctx.createGain();
  envelope(amp.gain, at, 0.016 * event.velocity, 1.2, event.duration, 1.8, 0.85, 1);
  filter.connect(amp);
  amp.connect(bus.out);
  send(ctx, amp, bus.reverb, 0.7);
  const stop = at + event.duration + 2.5;
  for (const cents of [-7, 7]) {
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = hz;
    osc.detune.value = cents;
    bus.wobble.connect(osc.detune);
    osc.connect(filter);
    osc.start(at);
    osc.stop(stop);
  }
}

/** A round sine bass with a little filtered triangle for definition. */
function playBass(ctx: BaseAudioContext, bus: Bus, event: NoteEvent, at: number) {
  const hz = midiToHz(event.midi ?? 36);
  const amp = ctx.createGain();
  envelope(amp.gain, at, 0.22 * event.velocity, 0.015, event.duration, 0.15, 0.6);
  const sine = ctx.createOscillator();
  sine.frequency.value = hz;
  const edge = ctx.createOscillator();
  edge.type = "triangle";
  edge.frequency.value = hz;
  const edgeGain = ctx.createGain();
  edgeGain.gain.value = 0.3;
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 500;
  sine.connect(amp);
  edge.connect(edgeGain).connect(filter).connect(amp);
  amp.connect(bus.out);
  const stop = at + event.duration + 0.5;
  sine.start(at);
  edge.start(at);
  sine.stop(stop);
  edge.stop(stop);
}

/** A soft, round thump: a sine that drops in pitch, with no click on top. */
function playKick(ctx: BaseAudioContext, bus: Bus, event: NoteEvent, at: number) {
  const osc = ctx.createOscillator();
  osc.frequency.setValueAtTime(110, at);
  osc.frequency.exponentialRampToValueAtTime(45, at + 0.12);
  const amp = ctx.createGain();
  amp.gain.setValueAtTime(0.0001, at);
  amp.gain.linearRampToValueAtTime(0.42 * event.velocity, at + 0.006);
  amp.gain.exponentialRampToValueAtTime(0.0001, at + 0.36);
  osc.connect(amp).connect(bus.out);
  osc.start(at);
  osc.stop(at + 0.4);
}

/** A burst of the shared noise through a filter, shaped to `length` seconds. */
function noiseBurst(ctx: BaseAudioContext, bus: Bus, at: number, filter: BiquadFilterNode, peak: number, length: number) {
  const source = ctx.createBufferSource();
  source.buffer = bus.noise;
  source.loop = true;
  const amp = ctx.createGain();
  amp.gain.setValueAtTime(0.0001, at);
  amp.gain.linearRampToValueAtTime(peak, at + 0.003);
  amp.gain.exponentialRampToValueAtTime(0.0001, at + length);
  source.connect(filter).connect(amp).connect(bus.out);
  source.start(at, Math.random() * 1.5);
  source.stop(at + length + 0.05);
  return amp;
}

/** A brushed snare: a dark swish with a little woody knock under it. */
function playSnare(ctx: BaseAudioContext, bus: Bus, event: NoteEvent, at: number) {
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 1500;
  filter.Q.value = 0.9;
  const swish = noiseBurst(ctx, bus, at, filter, 0.09 * event.velocity, 0.2);
  send(ctx, swish, bus.reverb, 0.6);
  const knock = ctx.createOscillator();
  knock.type = "triangle";
  knock.frequency.setValueAtTime(200, at);
  knock.frequency.exponentialRampToValueAtTime(150, at + 0.08);
  const amp = ctx.createGain();
  amp.gain.setValueAtTime(0.0001, at);
  amp.gain.linearRampToValueAtTime(0.07 * event.velocity, at + 0.002);
  amp.gain.exponentialRampToValueAtTime(0.0001, at + 0.1);
  knock.connect(amp).connect(bus.out);
  knock.start(at);
  knock.stop(at + 0.12);
}

/** A quiet, short tick: kept well under the music so it never turns into hiss. */
function playHat(ctx: BaseAudioContext, bus: Bus, event: NoteEvent, at: number) {
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 5000;
  filter.Q.value = 1.2;
  noiseBurst(ctx, bus, at, filter, 0.016 * event.velocity, 0.03);
}

/** A soft, round lead: a pure tone with vibrato that only arrives as the note is held, echoing gently into the room. */
function playLead(ctx: BaseAudioContext, bus: Bus, event: NoteEvent, at: number) {
  const hz = midiToHz(event.midi ?? 72);
  const body = ctx.createOscillator();
  body.frequency.value = hz;
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 5;
  const depth = ctx.createGain();
  depth.gain.setValueAtTime(0, at);
  depth.gain.linearRampToValueAtTime(hz * 0.003, at + 0.5);
  lfo.connect(depth);
  depth.connect(body.frequency);
  bus.wobble.connect(body.detune);

  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 1500;
  const amp = ctx.createGain();
  envelope(amp.gain, at, 0.15 * event.velocity, 0.06, event.duration, 0.4, 0.8, 0.5);
  body.connect(filter);
  filter.connect(amp);
  amp.connect(bus.out);
  send(ctx, amp, bus.reverb, 0.5);
  send(ctx, amp, bus.echo, 0.2);

  const stop = at + event.duration + 1;
  for (const osc of [body, lfo]) {
    osc.start(at);
    osc.stop(stop);
  }
}

const VOICES: Record<NoteEvent["voice"], (ctx: BaseAudioContext, bus: Bus, event: NoteEvent, at: number) => void> = {
  keys: playKeys,
  pad: playPad,
  bass: playBass,
  kick: playKick,
  snare: playSnare,
  hat: playHat,
  lead: playLead,
};

/** Put one bar's events on the timeline, the bar starting at `start` seconds of the context's clock. */
export function scheduleBar(ctx: BaseAudioContext, bus: Bus, events: readonly NoteEvent[], start: number) {
  for (const event of events) VOICES[event.voice](ctx, bus, event, start + event.at);
}

export interface Mix {
  bus: Bus;
  /** The master volume node: ramp its gain to fade. */
  master: GainNode;
}

/** The fixed part of the signal path: tone, reverb, echo, tape drift and a gentle compressor into `master`. */
export function createMix(ctx: BaseAudioContext, destination: AudioNode, seed = 1): Mix {
  const master = ctx.createGain();
  master.gain.value = 0;
  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -18;
  compressor.ratio.value = 2.5;
  compressor.attack.value = 0.03;
  compressor.release.value = 0.25;
  // Lo-fi is warm and slightly dull: roll the top off, and the very bottom.
  const dull = ctx.createBiquadFilter();
  dull.type = "lowpass";
  dull.frequency.value = 3600;
  dull.Q.value = 0.5;
  const rumble = ctx.createBiquadFilter();
  rumble.type = "highpass";
  rumble.frequency.value = 40;
  dull.connect(rumble).connect(compressor).connect(master).connect(destination);

  const reverb = ctx.createConvolver();
  reverb.buffer = makeImpulse(ctx, 2.8, seed + 9);
  const wet = ctx.createGain();
  wet.gain.value = 0.28;
  reverb.connect(wet).connect(dull);

  const echo = ctx.createGain();
  const delay = ctx.createDelay(2);
  delay.delayTime.value = BEAT * 0.75;
  const darken = ctx.createBiquadFilter();
  darken.type = "lowpass";
  darken.frequency.value = 1300;
  const feedback = ctx.createGain();
  feedback.gain.value = 0.32;
  echo.connect(delay).connect(darken);
  darken.connect(feedback).connect(delay);
  send(ctx, darken, dull, 0.45);

  // Two slow, unrelated sways, so the drift never settles into an obvious cycle.
  const wobble = ctx.createGain();
  for (const [hz, cents] of [[0.27, 6], [0.07, 4]] as const) {
    const lfo = ctx.createOscillator();
    lfo.frequency.value = hz;
    send(ctx, lfo, wobble, cents);
    lfo.start();
  }

  return { bus: { out: dull, reverb, echo, wobble, noise: makeNoise(ctx, 2, seed + 1) }, master };
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
  /** Fade the music out and hold it (the clock stops too) until resumed, so it picks up where it left off. */
  setPaused(paused: boolean): void;
  subscribe(listener: (state: LofiState) => void): () => void;
}

/** Bars scheduled ahead of the clock: enough to survive a throttled timer. */
const LOOKAHEAD_BARS = 3;
const PUMP_MS = 700;
const FADE_IN_S = 3;
/** How long the music takes to die away when paused, before the audio clock is stopped. */
const HUSH_MS = 1200;

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
  let paused = false;
  let hushTimer: number | undefined;
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
  const level = () => (muted || paused ? 0 : volume * FULL_GAIN);

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
      window.clearTimeout(hushTimer);
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
    setPaused(next) {
      paused = next;
      window.clearTimeout(hushTimer);
      if (!ctx || !mix) return;
      if (next) {
        mix.master.gain.setTargetAtTime(0, ctx.currentTime, 0.25);
        hushTimer = window.setTimeout(() => void ctx?.suspend().catch(() => {}), HUSH_MS);
      } else {
        const playing = ctx;
        void playing.resume().then(() => mix && playing === ctx && mix.master.gain.setTargetAtTime(level(), playing.currentTime, 0.4), () => {});
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}
