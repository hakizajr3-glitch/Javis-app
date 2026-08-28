/**
 * ElevenLabsConfig — Single source of truth for ElevenLabs runtime resolution.
 *
 * Resolution priority (highest → lowest):
 *   1. localStorage.jarvis_config.elevenlabs_api_key   (Settings UI)
 *   2. localStorage.elevenlabs_api_key                 (standalone mirror slot)
 *   3. import.meta.env.VITE_ELEVENLABS_API_KEY         (build-time .env)
 *   4. ""   → graceful degradation, callers must use browser TTS fallback
 *
 * Voice ID resolution: jarvis_config.elevenlabs_voice_id → standalone
 * elevenlabs_voice_id → env override → default (Bella). Mirror of
 * jarvis-tauri/src/elevenLabsConfig.ts. Keep both files in sync.
 */

const STANDALONE_KEY = 'elevenlabs_api_key';
const STANDALONE_VOICE_KEY = 'elevenlabs_voice_id';
const DEFAULT_VOICE_ID = 'hbB2qXyS2GMyyZIZyhAH'; // Bella — user's verified universal female
const DEFAULT_MODEL_ID = 'eleven_flash_v2_5';

// Curated ElevenLabs voice catalog. IDs are the user-provided, verified
// production identifiers — the same string you'd copy from the ElevenLabs
// Voice Library URL.
export const ELEVENLABS_VOICES = [
  {
    id: 'IRHApOXLvnW57QJPQH2P',
    name: 'Adam',
    description: 'Deep, steady, and versatile; ideal for documentaries, tutorials, and male-voiced narration.',
    gender: 'male',
  },
  {
    id: 'pg7Nd5b8Y3tnfSndq5lh',
    name: 'Josh',
    description: 'Clear, authoritative, and warm; widely used for motivational or educational videos.',
    gender: 'male',
  },
  {
    id: 'hbB2qXyS2GMyyZIZyhAH',
    name: 'Bella',
    description: 'Calm, articulate, and expressive; great for stable female narration with natural pauses.',
    gender: 'female',
  },
];

// Jarvis persona catalog — surfaced in SystemConfigModal as the Voice
// Persona cards. Each persona carries its own ElevenLabs voiceId so the
// modal can retarget TTS at the same time the persona is picked.
export const JARVIS_PERSONAS = [
  {
    id: 'jarvismale',
    name: 'Jarvis Male Persona',
    shortDescription: 'Native English, British RP · erudite AI butler',
    description:
      'Native English, British Received Pronunciation (refined, London-educated). Male, 40–50. Studio quality. Persona: erudite AI butler, unflappable confidant. Composed, dryly witty, quietly warm. Deep, resonant timbre with unhurried, measured pacing and crisp articulation. Speaks with understated precision and subtle wit, never rushed, with a calm authoritative undertone — like a trusted advisor who’s seen everything and remains entirely unbothered.',
    voiceId: 'IRHApOXLvnW57QJPQH2P', // Adam
  },
  {
    id: 'male',
    name: 'Male Persona',
    shortDescription: 'Clear, authoritative, and warm',
    description: 'Deep, professional tone.',
    voiceId: 'pg7Nd5b8Y3tnfSndq5lh', // Josh
  },
  {
    id: 'female',
    name: 'Female Persona',
    shortDescription: 'Calm, articulate, and expressive',
    description: 'Clear, helpful tone.',
    voiceId: 'hbB2qXyS2GMyyZIZyhAH', // Bella
  },
];

// First-run default — the "ready to work out of the box" experience so
// first-time users hear Jarvis immediately.
export const DEFAULT_JARVIS_PERSONA = 'jarvismale';

function readJarvisConfig() {
  try {
    const raw = localStorage.getItem('jarvis_config');
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return (parsed && typeof parsed === 'object') ? parsed : {};
  } catch (_) {
    return {};
  }
}

/** Secure getter: returns trimmed key from the highest-priority source, or ''. */
export function getElevenLabsApiKey() {
  try {
    const cfg = readJarvisConfig();
    const fromJarvisConfig = (cfg.elevenlabs_api_key || '').trim();
    if (fromJarvisConfig) return fromJarvisConfig;

    const standalone = (localStorage.getItem(STANDALONE_KEY) || '').trim();
    if (standalone) return standalone;

    const envKey = (import.meta?.env?.VITE_ELEVENLABS_API_KEY || '').trim();
    if (envKey) return envKey;
  } catch (_) {
    // localStorage / import.meta may not exist in some test contexts
  }
  return '';
}

/** Returns true if a usable key is available from any source. */
export function hasElevenLabsApiKey() {
  return getElevenLabsApiKey().length > 0;
}

/**
 * Voice ID: localStorage (jarvis_config + standalone slot) → env override → default.
 */
export function getElevenLabsVoiceId() {
  try {
    const cfg = readJarvisConfig();
    const fromJarvisConfig = (cfg.elevenlabs_voice_id || '').trim();
    if (fromJarvisConfig) return fromJarvisConfig;

    const standalone = (localStorage.getItem(STANDALONE_VOICE_KEY) || '').trim();
    if (standalone) return standalone;

    const envVoice = (import.meta?.env?.VITE_ELEVENLABS_VOICE_ID || '').trim();
    if (envVoice) return envVoice;
  } catch (_) {
    // ignore
  }
  return DEFAULT_VOICE_ID;
}

/** Returns the matching catalog entry for an ID, or null if none. */
export function findElevenLabsVoice(id) {
  if (!id) return null;
  const trimmed = String(id).trim();
  for (let i = 0; i < ELEVENLABS_VOICES.length; i++) {
    if (ELEVENLABS_VOICES[i].id === trimmed) return ELEVENLABS_VOICES[i];
  }
  return null;
}

/** Canonical preset ID list (used by the modal dropdown to render <option>s). */
export function getElevenLabsVoicePresets() {
  return ELEVENLABS_VOICES;
}

/** Model ID: env override > inline default. */
export function getElevenLabsModelId() {
  try {
    const envModel = import.meta?.env?.VITE_ELEVENLABS_MODEL_ID;
    if (envModel && typeof envModel === 'string' && envModel.trim()) {
      return envModel.trim();
    }
  } catch (_) {
    // ignore
  }
  return DEFAULT_MODEL_ID;
}

/**
 * Resolve the saved Jarvis persona id. Falls back to DEFAULT_JARVIS_PERSONA
 * on first run (no saved config) so the canonical "Jarvis is the original"
 * experience is delivered out of the box without the user having to touch
 * Settings.
 */
export function getJarvisPersona() {
  try {
    const cfg = readJarvisConfig();
    const fromCfg = (cfg.voice_persona || '').trim();
    if (fromCfg && JARVIS_PERSONAS.some((p) => p.id === fromCfg)) return fromCfg;
    const standalone = (localStorage.getItem('voice_persona') || '').trim();
    if (standalone && JARVIS_PERSONAS.some((p) => p.id === standalone)) return standalone;
  } catch (_) {
    // ignore — fall through to default
  }
  return DEFAULT_JARVIS_PERSONA;
}

/** Returns the matching persona catalog entry for an id, or null if none. */
export function findJarvisPersona(id) {
  if (!id) return null;
  const trimmed = String(id).trim();
  for (let i = 0; i < JARVIS_PERSONAS.length; i++) {
    if (JARVIS_PERSONAS[i].id === trimmed) return JARVIS_PERSONAS[i];
  }
  return null;
}

/**
 * Persona → ElevenLabs voice ID. Used by the modal to auto-retarget the
 * TTS voice when a new persona is selected *and* by external callers
 * (voicePipelineFixed.ts, elevenLabsVoice.ts) that want to look up the
 * voice id bound to the currently-active persona.
 */
export function getVoiceIdForPersona(persona) {
  const entry = JARVIS_PERSONAS.find((p) => p.id === persona);
  return entry ? entry.voiceId : DEFAULT_VOICE_ID;
}

export const ELEVENLABS_DEFAULTS = Object.freeze({
  voiceId: DEFAULT_VOICE_ID,
  modelId: DEFAULT_MODEL_ID,
});
