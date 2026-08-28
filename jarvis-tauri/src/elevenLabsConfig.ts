/**
 * voiceConfig — JARVIS voice persona catalog, ElevenLabs key/voice resolvers,
 * and system-voice routing for non-ElevenLabs personas.
 *
 * Architecture (per injection prompt):
 *   - Jarvis Male ('jarvismale')  → ElevenLabs (user-selected voice in Settings)
 *   - Male Persona  ('male')       → Gemini Live API / SpeechSynthesis (NO ElevenLabs)
 *   - Female Persona ('female')    → Gemini Live API / SpeechSynthesis (NO ElevenLabs)
 *
 * Resolution priority for the active persona id:
 *   1. localStorage.jarvis_config.voice_persona   (Settings UI)
 *   2. localStorage.voice_persona                 (standalone mirror slot)
 *   3. DEFAULT_JARVIS_PERSONA = 'jarvismale'      (first-run default)
 *
 * Resolution priority for ElevenLabs API key:
 *   1. localStorage.jarvis_config.elevenlabs_api_key  (Settings UI)
 *   2. localStorage.elevenlabs_api_key                (standalone mirror slot)
 *   3. import.meta.env.VITE_ELEVENLABS_API_KEY        (build-time .env)
 *   4. '' (empty → browser TTS fallback)
 *
 * Resolution priority for ElevenLabs voice ID:
 *   1. localStorage.jarvis_config.elevenlabs_voice_id  (Settings UI)
 *   2. localStorage.elevenlabs_voice_id                (standalone mirror slot)
 *   3. ELEVENLABS_VOICES[0].id (Adam — first catalog voice)
 */

// ---- Types ----

export type JarvisPersonaId = 'jarvismale' | 'male' | 'female';

export interface JarvisPersonaEntry {
  id: JarvisPersonaId;
  name: string;
  shortDescription: string;
  description: string;
  /** Only set for ElevenLabs-backed personas (jarvismale). */
  elevenlabsVoiceId?: string;
  /** Ordered regex-name hints matched against `SpeechSynthesisVoice.name`. */
  systemVoiceHint: RegExp[];
  /** Cached preferred voice name (for UI display + first-run default). */
  preferredVoiceName: string;
}

// ---- ElevenLabs voice catalog (verified production IDs, July 2026) ----

export const ELEVENLABS_VOICES = [
  {
    id: 'IRHApOXLvnW57QJPQH2P',
    name: 'Adam',
    description:
      'Deep, steady, and versatile; ideal for documentaries, tutorials, and male-voiced narration.',
  },
  {
    id: 'pg7Nd5b8Y3tnfSndq5lh',
    name: 'Josh',
    description:
      'Clear, authoritative, and warm; widely used for motivational or educational videos.',
  },
  {
    id: 'hbB2qXyS2GMyyZIZyhAH',
    name: 'Bella',
    description:
      'Calm, articulate, and expressive; great for stable female narration with natural pauses.',
  },
] as const;

// ---- ElevenLabs API key resolver ----

/**
 * Layered resolver for the ElevenLabs API key.
 * UI-set key (localStorage) takes precedence; build-time .env is last.
 */
export function getElevenLabsApiKey(): string {
  try {
    // 1. Settings UI (jarvis_config JSON)
    const saved = localStorage.getItem('jarvis_config');
    if (saved) {
      const fromCfg = JSON.parse(saved).elevenlabs_api_key;
      if (fromCfg && String(fromCfg).trim()) return String(fromCfg).trim();
    }
  } catch (_) { /* ignore */ }
  try {
    // 2. Standalone mirror slot
    const standalone = localStorage.getItem('elevenlabs_api_key');
    if (standalone && String(standalone).trim()) return String(standalone).trim();
  } catch (_) { /* ignore */ }
  try {
    // 3. Build-time .env (Vite)
    const env = (import.meta as any).env?.VITE_ELEVENLABS_API_KEY;
    if (env && String(env).trim()) return String(env).trim();
  } catch (_) { /* ignore */ }
  return '';
}

/** Returns true if ANY layered source has a non-empty ElevenLabs key. */
export function hasElevenLabsApiKey(): boolean {
  return getElevenLabsApiKey().trim().length > 0;
}

/** ElevenLabs TTS model id — pinned to a fast, low-latency model. */
export function getElevenLabsModelId(): string {
  return 'eleven_flash_v2';
}

// ---- ElevenLabs voice ID resolver ----

/**
 * Layered resolver for the ElevenLabs voice ID.
 *   UI-set → standalone mirror → first catalog voice.
 */
export function getElevenLabsVoiceId(): string {
  try {
    // 1. Settings UI (jarvis_config JSON)
    const saved = localStorage.getItem('jarvis_config');
    if (saved) {
      const fromCfg = JSON.parse(saved).elevenlabs_voice_id;
      if (fromCfg && String(fromCfg).trim()) return String(fromCfg).trim();
    }
  } catch (_) { /* ignore */ }
  try {
    // 2. Standalone mirror slot
    const standalone = localStorage.getItem('elevenlabs_voice_id');
    if (standalone && String(standalone).trim()) return String(standalone).trim();
  } catch (_) { /* ignore */ }
  // 3. First catalog voice (Adam)
  return ELEVENLABS_VOICES[0].id;
}

// ---- JARVIS Personas catalog ----

export const JARVIS_PERSONAS: ReadonlyArray<JarvisPersonaEntry> = [
  {
    id: 'jarvismale',
    name: 'Jarvis Male Persona',
    shortDescription: 'Native English, British RP · erudite AI butler',
    description:
      'Native English, British Received Pronunciation — refined, London-educated. Male, 40s–50s. Studio quality. Persona: erudite AI butler, unflappable confidant. Composed, dryly witty, quietly warm. Deep, resonant timbre with unhurried, measured pacing and crisp articulation. Speaks with understated precision and subtle wit, never rushed, with a calm authoritative undertone — like a trusted advisor who has seen everything and remains entirely unbothered.',
    elevenlabsVoiceId: 'IRHApOXLvnW57QJPQH2P',
    preferredVoiceName: 'Daniel',
    systemVoiceHint: [
      /^Daniel/,
      /UK English Male/,
      /British Male/,
      /\ben-GB\b.*Male/i,
      /Arthur/i,
      /Oliver/i,
      /Google UK English/i,
    ],
  },
  {
    id: 'male',
    name: 'Male Persona',
    shortDescription: 'Clear, authoritative, and warm',
    description: 'Deep, professional tone. Delivers responses with authority and warmth — ideal for briefings, explanations, and direct assistance.',
    // NO elevenlabsVoiceId — this persona runs on Gemini Live API / SpeechSynthesis exclusively
    preferredVoiceName: 'Alex',
    systemVoiceHint: [
      /Alex/,
      /Fred/,
      /Aaron/,
      /Tom/,
      /Daniel/,
      /Google US English/,
      /^Male$/i,
    ],
  },
  {
    id: 'female',
    name: 'Female Persona',
    shortDescription: 'Calm, articulate, and expressive',
    description: 'Clear, helpful, and warm tone. Natural conversational cadence — ideal for explanations, guidance, and friendly assistance.',
    // NO elevenlabsVoiceId — this persona runs on Gemini Live API / SpeechSynthesis exclusively
    preferredVoiceName: 'Samantha',
    systemVoiceHint: [
      /Samantha/,
      /Karen/,
      /Victoria/,
      /Tessa/,
      /Allison/,
      /Ava/,
      /Google UK English Female/,
      /Google US English/,
      /^Female$/i,
    ],
  },
] as const;

export const DEFAULT_JARVIS_PERSONA: JarvisPersonaId = 'jarvismale';

/** Returns true only for personas that are ElevenLabs-backed. */
export function isElevenLabsPersona(id: JarvisPersonaId): boolean {
  const entry = findJarvisPersona(id);
  return !!entry?.elevenlabsVoiceId;
}

// Stable key for the system-voice override persisted alongside the persona.
export const JARVIS_SYSTEM_VOICE_KEY = 'jarvis_system_voice_name';

function readJarvisConfig(): Record<string, string> {
  try {
    const raw = localStorage.getItem('jarvis_config');
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return (parsed && typeof parsed === 'object') ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Resolve the saved Jarvis persona id. Falls back to DEFAULT_JARVIS_PERSONA
 * on first run (no saved config) so the canonical "Jarvis is the original"
 * experience is delivered out of the box without the user having to touch
 * Settings.
 */
export function getJarvisPersona(): JarvisPersonaId {
  try {
    const cfg = readJarvisConfig();
    const fromCfg = (cfg.voice_persona || '').trim();
    if (fromCfg && JARVIS_PERSONAS.some(p => p.id === fromCfg)) {
      return fromCfg as JarvisPersonaId;
    }
    const standalone = (localStorage.getItem('voice_persona') || '').trim();
    if (standalone && JARVIS_PERSONAS.some(p => p.id === standalone)) {
      return standalone as JarvisPersonaId;
    }
  } catch {
    // ignore — fall through to default
  }
  return DEFAULT_JARVIS_PERSONA;
}

/** Returns the matching persona catalog entry for an id, or null if none. */
export function findJarvisPersona(id: string): JarvisPersonaEntry | null {
  if (!id) return null;
  const trimmed = String(id).trim();
  for (const p of JARVIS_PERSONAS) {
    if (p.id === trimmed) return p;
  }
  return null;
}

/** Returns the system-voice name override saved by the UI (or '' if none). */
export function getJarvisSystemVoiceName(): string {
  try {
    const cfg = readJarvisConfig();
    const fromCfg = (cfg.jarvis_system_voice_name || '').trim();
    if (fromCfg) return fromCfg;
    const standalone = (localStorage.getItem(JARVIS_SYSTEM_VOICE_KEY) || '').trim();
    return standalone;
  } catch {
    return '';
  }
}

/**
 * Pick the best matching system voice for a persona from a provided
 * SpeechSynthesisVoice list. Returns the first regex name match, or the
 * first English voice, or `null` if no candidates.
 */
export function pickSystemVoiceForPersona(
  persona: JarvisPersonaId,
  voices: SpeechSynthesisVoice[],
): SpeechSynthesisVoice | null {
  const entry = findJarvisPersona(persona);
  if (!entry || !voices || voices.length === 0) return null;
  // Honor the user's manual override first (looked-up by name string match).
  const override = getJarvisSystemVoiceName();
  if (override) {
    const exact = voices.find(v => v.name.trim() === override);
    if (exact) return exact;
  }
  for (const re of entry.systemVoiceHint) {
    const hit = voices.find(v => re.test(v.name));
    if (hit) return hit;
  }
  const en = voices.filter(v => (v.lang || '').toLowerCase().startsWith('en'));
  return en[0] || voices[0] || null;
}
