/**
 * voiceConfig — JARVIS voice persona catalog, ElevenLabs key/voice resolvers,
 * and system-voice routing for non-ElevenLabs personas.
 * JS mirror of jarvis-tauri/src/elevenLabsConfig.ts.
 *
 * Architecture (per injection prompt):
 *   - Jarvis Male ('jarvismale')  → ElevenLabs only (voice ID IRHApOXLvnW57QJPQH2P)
 *   - Male Persona  ('male')       → Gemini Live API / SpeechSynthesis (NO ElevenLabs)
 *   - Female Persona ('female')    → Gemini Live API / SpeechSynthesis (NO ElevenLabs)
 */

/** @typedef {'jarvismale'|'male'|'female'} JarvisPersonaId */

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
];

// ---- ElevenLabs API key resolver ----

export function getElevenLabsApiKey() {
  try {
    const saved = localStorage.getItem('jarvis_config');
    if (saved) {
      const fromCfg = JSON.parse(saved).elevenlabs_api_key;
      if (fromCfg && String(fromCfg).trim()) return String(fromCfg).trim();
    }
  } catch (_) { /* ignore */ }
  try {
    const standalone = localStorage.getItem('elevenlabs_api_key');
    if (standalone && String(standalone).trim()) return String(standalone).trim();
  } catch (_) { /* ignore */ }
  try {
    // Vite env (if available in Electron renderer)
    if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_ELEVENLABS_API_KEY) {
      return String(import.meta.env.VITE_ELEVENLABS_API_KEY).trim();
    }
  } catch (_) { /* ignore */ }
  return '';
}

export function hasElevenLabsApiKey() {
  return getElevenLabsApiKey().trim().length > 0;
}

export function getElevenLabsModelId() {
  return 'eleven_flash_v2';
}

// ---- ElevenLabs voice ID resolver ----

export function getElevenLabsVoiceId() {
  try {
    const saved = localStorage.getItem('jarvis_config');
    if (saved) {
      const fromCfg = JSON.parse(saved).elevenlabs_voice_id;
      if (fromCfg && String(fromCfg).trim()) return String(fromCfg).trim();
    }
  } catch (_) { /* ignore */ }
  try {
    const standalone = localStorage.getItem('elevenlabs_voice_id');
    if (standalone && String(standalone).trim()) return String(standalone).trim();
  } catch (_) { /* ignore */ }
  // Persona binding (only jarvismale has an elevenlabsVoiceId)
  const persona = getJarvisPersona();
  const entry = findJarvisPersona(persona);
  if (entry && entry.elevenlabsVoiceId) return entry.elevenlabsVoiceId;
  // First catalog voice (Adam)
  return ELEVENLABS_VOICES[0].id;
}

// ---- JARVIS Personas catalog ----

export const JARVIS_PERSONAS = [
  {
    id: 'jarvismale',
    name: 'Jarvis Male Persona',
    shortDescription: 'Native English, British RP · erudite AI butler',
    description:
      "Native English, British Received Pronunciation (refined, London-educated). Male, 40–50. Studio quality. Persona: erudite AI butler, unflappable confidant. Composed, dryly witty, quietly warm. Deep, resonant timbre with unhurried, measured pacing and crisp articulation. Speaks with understated precision and subtle wit, never rushed, with a calm authoritative undertone — like a trusted advisor who's seen everything and remains entirely unbothered.",
    elevenlabsVoiceId: 'IRHApOXLvnW57QJPQH2P', // Adam — the canonical Jarvis voice
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
    description: 'Deep, professional tone.',
    // NO elevenlabsVoiceId — this persona runs on Gemini Live API / SpeechSynthesis
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
    description: 'Clear, helpful tone.',
    // NO elevenlabsVoiceId — this persona runs on Gemini Live API / SpeechSynthesis
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
];

export const DEFAULT_JARVIS_PERSONA = 'jarvismale';
export const JARVIS_SYSTEM_VOICE_KEY = 'jarvis_system_voice_name';

export function isElevenLabsPersona(id) {
  const entry = findJarvisPersona(id);
  return !!(entry && entry.elevenlabsVoiceId);
}

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

export function getJarvisPersona() {
  try {
    const cfg = readJarvisConfig();
    const fromCfg = (cfg.voice_persona || '').trim();
    if (fromCfg && JARVIS_PERSONAS.some(function (p) { return p.id === fromCfg; })) return fromCfg;
    const standalone = (localStorage.getItem('voice_persona') || '').trim();
    if (standalone && JARVIS_PERSONAS.some(function (p) { return p.id === standalone; })) return standalone;
  } catch (_) { /* ignore */ }
  return DEFAULT_JARVIS_PERSONA;
}

export function findJarvisPersona(id) {
  if (!id) return null;
  var trimmed = String(id).trim();
  for (var i = 0; i < JARVIS_PERSONAS.length; i++) {
    if (JARVIS_PERSONAS[i].id === trimmed) return JARVIS_PERSONAS[i];
  }
  return null;
}

export function getJarvisSystemVoiceName() {
  try {
    var cfg = readJarvisConfig();
    var fromCfg = (cfg.jarvis_system_voice_name || '').trim();
    if (fromCfg) return fromCfg;
    var standalone = (localStorage.getItem(JARVIS_SYSTEM_VOICE_KEY) || '').trim();
    return standalone;
  } catch (_) {
    return '';
  }
}

export function pickSystemVoiceForPersona(persona, voices) {
  var entry = findJarvisPersona(persona);
  if (!entry || !voices || voices.length === 0) return null;
  var override = getJarvisSystemVoiceName();
  if (override) {
    var exact = voices.find(function (v) { return v.name && v.name.trim() === override; });
    if (exact) return exact;
  }
  for (var i = 0; i < entry.systemVoiceHint.length; i++) {
    var re = entry.systemVoiceHint[i];
    var hit = voices.find(function (v) { return re.test(v.name); });
    if (hit) return hit;
  }
  var en = voices.filter(function (v) { return v.lang && v.lang.toLowerCase().startsWith('en'); });
  return en[0] || voices[0] || null;
}
