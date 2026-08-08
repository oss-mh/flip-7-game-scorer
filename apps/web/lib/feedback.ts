import { getPreference } from "./localPreferences";

export type FeedbackKind = "deal" | "bust" | "flip7" | "freeze";

/**
 * Vibration patterns, in ms: a number is one pulse, an array alternates
 * vibrate/pause. Deal is a single light tap; bust and freeze are short and
 * blunt (something happened *to* you); Flip 7 is the longest and busiest,
 * since it's the one genuinely worth celebrating.
 */
const HAPTIC_PATTERNS: Record<FeedbackKind, number | readonly number[]> = {
  deal: 10,
  bust: [40, 60, 40],
  freeze: [15, 80, 15, 80, 60],
  flip7: [20, 40, 20, 40, 20, 40, 80],
};

/** One tone in a short synthesized cue: frequency in Hz, duration in ms, and how long after the cue starts it begins. */
interface Tone {
  readonly frequency: number;
  readonly durationMs: number;
  readonly delayMs?: number;
  readonly type?: OscillatorType;
}

/**
 * Short synthesized tones rather than audio files — no licensing question,
 * no asset to ship, and nothing for AGENTS.md's "don't add a dependency
 * without asking" to even ask about. Deal is a single high tick; bust
 * drops in pitch (something going wrong); freeze is a still, cool
 * two-note chime; Flip 7 is a bright ascending run.
 */
const SOUND_PATTERNS: Record<FeedbackKind, readonly Tone[]> = {
  deal: [{ frequency: 880, durationMs: 50 }],
  bust: [
    { frequency: 320, durationMs: 110 },
    { frequency: 190, durationMs: 160, delayMs: 90 },
  ],
  freeze: [
    { frequency: 1046, durationMs: 90, type: "sine" },
    { frequency: 1568, durationMs: 140, delayMs: 100, type: "sine" },
  ],
  flip7: [
    { frequency: 523, durationMs: 80 },
    { frequency: 659, durationMs: 80, delayMs: 80 },
    { frequency: 784, durationMs: 80, delayMs: 160 },
    { frequency: 1047, durationMs: 180, delayMs: 240 },
  ],
};

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Vibration is physical device motion, so a reduced-motion preference
 * applies to it the same way it would to an on-screen animation — gated
 * here rather than left to the OS, since there's no equivalent "please
 * don't buzz" signal the platform exposes directly.
 */
function playHaptic(kind: FeedbackKind): void {
  if (!getPreference("hapticsEnabled", true)) return;
  if (prefersReducedMotion()) return;
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;

  try {
    navigator.vibrate(HAPTIC_PATTERNS[kind] as number | number[]);
  } catch {
    // Best-effort — a vibration failing silently is a no-op, not a bug.
  }
}

// Lazily created on first use (never at module load, so importing this
// file has no side effect) and reused after that — browsers only allow
// starting an AudioContext following a user gesture, which "a card was
// just dealt" always is.
let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext;
  if (!Ctor) return null;
  audioContext ??= new Ctor();
  return audioContext;
}

/**
 * Silent mode isn't checked here at all: standard `AudioContext` playback
 * — no telephony/media-session category tricks — already respects the
 * iOS mute switch and Android's ringer mode on its own, so leaving it
 * alone *is* respecting it. Anything fancier would be working against the
 * platform, not with it.
 */
function playSound(kind: FeedbackKind): void {
  if (!getPreference("soundEnabled", false)) return;

  const context = getAudioContext();
  if (!context) return;
  if (context.state === "suspended") void context.resume();

  const now = context.currentTime;
  for (const tone of SOUND_PATTERNS[kind]) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = tone.type ?? "triangle";
    oscillator.frequency.value = tone.frequency;

    const startTime = now + (tone.delayMs ?? 0) / 1000;
    const endTime = startTime + tone.durationMs / 1000;
    // A short fade in/out avoids the click a hard on/off edge makes.
    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.exponentialRampToValueAtTime(0.2, startTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, endTime);

    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(startTime);
    oscillator.stop(endTime + 0.02);
  }
}

/** Fires whichever of haptics/sound the user has enabled for `kind` — see AGENTS.md issue #49. */
export function triggerFeedback(kind: FeedbackKind): void {
  playHaptic(kind);
  playSound(kind);
}
