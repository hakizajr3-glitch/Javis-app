/**
 * Voice Selector — Maps the saved `voice_persona` to a real
 * `SpeechSynthesisVoice` from `window.speechSynthesis`.
 *
 * The persona→voice resolver lives in `elevenLabsConfig.ts` (the JARVIS voice
 * config that supersedes the legacy ElevenLabs catalog). This module is the
 * voice loader: it awaits `getVoices()`, caches it across calls, and exposes
 * `getVoiceForPersona` / `applyPersonaToUtterance` for any TTS consumer.
 *
 * No code outside this module should hardcode voice names. To add a new
 * persona, edit `JARVIS_PERSONAS` in elevenLabsConfig.ts and add a
 * `systemVoiceHint` regex list there.
 */

import {
  getJarvisPersona,
  pickSystemVoiceForPersona,
  type JarvisPersonaId,
} from './elevenLabsConfig';

export type { JarvisPersonaId } from './elevenLabsConfig';
export type VoicePersona = JarvisPersonaId;

// Re-export for legacy imports.
export const getPersona = getJarvisPersona;

// -------- Async voice loading --------

let cachedVoices: SpeechSynthesisVoice[] | null = null;
let pendingPromise: Promise<SpeechSynthesisVoice[]> | null = null;

/**
 * Resolve with the full list of voices once they're loaded.
 * If `getVoices()` returns empty initially, waits for `voiceschanged`
 * up to `timeoutMs` then resolves with whatever is available.
 */
function loadAllVoices(timeoutMs: number = 1500): Promise<SpeechSynthesisVoice[]> {
  if (cachedVoices && cachedVoices.length > 0) return Promise.resolve(cachedVoices);
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return Promise.resolve([]);
  }
  const synth = window.speechSynthesis;

  const initial = synth.getVoices();
  if (initial.length > 0) {
    cachedVoices = initial;
    return Promise.resolve(initial);
  }

  if (pendingPromise) return pendingPromise;

  pendingPromise = new Promise<SpeechSynthesisVoice[]>((resolve) => {
    let done = false;
    const finish = (vs: SpeechSynthesisVoice[]) => {
      if (done) return;
      done = true;
      synth.removeEventListener('voiceschanged', onChanged);
      if (vs.length > 0) cachedVoices = vs;
      pendingPromise = null;
      resolve(vs);
    };
    const onChanged = () => finish(synth.getVoices());
    synth.addEventListener('voiceschanged', onChanged);
    // Hard timeout — Chromium's voiceschanged event fires in <100ms in our
    // tests; 1500ms is generous.
    setTimeout(() => finish(synth.getVoices()), timeoutMs);
  });

  return pendingPromise;
}

/** Force-reload (e.g. after picking a new persona override in Settings). */
export function invalidateVoicesCache(): void {
  cachedVoices = null;
  pendingPromise = null;
}

// -------- Public API --------

/**
 * Returns the best-matching SpeechSynthesisVoice for the persona, honoring
 * any manual voice-name override, then persona.systemVoiceHint regex match,
 * then first English voice fallback.
 */
export async function getVoiceForPersona(persona?: JarvisPersonaId): Promise<SpeechSynthesisVoice | null> {
  const p = persona ?? getJarvisPersona();
  const voices = await loadAllVoices();
  return pickSystemVoiceForPersona(p, voices);
}

/**
 * Convenience: apply the persona's matched voice to an utterance in place.
 * Sets both `utterance.voice` and `utterance.lang` so the engine picks the
 * right pronunciation for the chosen voice. Returns true on success.
 */
export async function applyPersonaToUtterance(
  utterance: SpeechSynthesisUtterance,
  persona?: JarvisPersonaId,
): Promise<boolean> {
  const v = await getVoiceForPersona(persona);
  if (v) {
    utterance.voice = v;
    utterance.lang = v.lang;
    return true;
  }
  return false;
}

/**
 * Snapshot of the system's installed voices, sorted: curated persona-friendly
 * choices first, the rest alphabetical. Useful for the Settings UI's
 * "curated system voice picker" dropdown.
 */
export async function listAvailableVoices(): Promise<SpeechSynthesisVoice[]> {
  const voices = await loadAllVoices();
  return [...voices].sort((a, b) => a.name.localeCompare(b.name));
}
