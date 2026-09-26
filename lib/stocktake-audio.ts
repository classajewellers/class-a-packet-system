/**
 * Short beeps for a new find. The context is created on a tap, because a
 * phone browser will not start audio from the gun's keystrokes alone.
 */
const MUTE_KEY = "vault.stocktake.mute";

type AudioContextCtor = typeof AudioContext;

function ctor(): AudioContextCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & { webkitAudioContext?: AudioContextCtor };
  return window.AudioContext || w.webkitAudioContext || null;
}

let ctx: AudioContext | null = null;

export function stocktakeMuted(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setStocktakeMuted(muted: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
  } catch {
    /* private mode */
  }
}

/** Call from a click or tap. Safe to call again. */
export function primeStocktakeAudio(): void {
  const Ctor = ctor();
  if (!Ctor) return;
  if (!ctx) ctx = new Ctor();
  if (ctx.state === "suspended") void ctx.resume();
}

function tone(frequency: number, durationMs: number): void {
  if (stocktakeMuted() || !ctx || ctx.state !== "running") return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const now = ctx.currentTime;
  const end = now + durationMs / 1000;
  osc.type = "sine";
  osc.frequency.value = frequency;
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.12, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, end);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(end + 0.02);
}

export function beepFound(): void {
  tone(880, 90);
}

export function beepTick(): void {
  tone(620, 45);
}
