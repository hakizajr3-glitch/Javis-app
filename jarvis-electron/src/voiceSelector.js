/**
 * Voice Selector — JS version for Electron renderer.
 * Maps localStorage.jarvis_config.voice_persona -> SpeechSynthesisVoice.
 */

function getPersona() {
  if (typeof localStorage === 'undefined') return 'jarvismale';
  try {
    var raw = localStorage.getItem('jarvis_config');
    if (raw) {
      var cfg = JSON.parse(raw);
      if (cfg && cfg.voice_persona === 'female') return 'female';
      if (cfg && cfg.voice_persona === 'male') return 'male';
      if (cfg && cfg.voice_persona === 'jarvismale') return 'jarvismale';
    }
  } catch (_) { /* fall through */ }
  return 'jarvismale';
}

var FEMALE_RE = /(female|samantha|karen|victoria|ava|allison|tessa|veena|zira|hazel|\+f\d)/i;
var MALE_RE   = /(male|daniel|alex|fred|tom|aaron|oliver|david|\+m\d)/i;

function pickVoice(voices, persona) {
  if (!voices || voices.length === 0) return null;
  var re = persona === 'female' ? FEMALE_RE : MALE_RE;
  var en = voices.filter(function(v) {
    return v.lang && v.lang.toLowerCase().indexOf('en') === 0;
  });
  var matchEn = null;
  for (var i = 0; i < en.length; i++) {
    if (re.test(en[i].name)) { matchEn = en[i]; break; }
  }
  if (matchEn) return matchEn;
  for (var j = 0; j < voices.length; j++) {
    if (re.test(voices[j].name)) return voices[j];
  }
  return en[0] || voices[0] || null;
}

var cachedVoices = null;
var pendingPromise = null;

function loadAllVoices(timeoutMs) {
  if (timeoutMs === undefined) timeoutMs = 1500;
  if (cachedVoices && cachedVoices.length > 0) return Promise.resolve(cachedVoices);
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return Promise.resolve([]);
  }
  var synth = window.speechSynthesis;
  var initial = synth.getVoices();
  if (initial.length > 0) {
    cachedVoices = initial;
    return Promise.resolve(initial);
  }
  if (pendingPromise) return pendingPromise;

  pendingPromise = new Promise(function(resolve) {
    var done = false;
    var finish = function(vs) {
      if (done) return;
      done = true;
      synth.removeEventListener('voiceschanged', onChanged);
      if (vs.length > 0) cachedVoices = vs;
      pendingPromise = null;
      resolve(vs);
    };
    var onChanged = function() { finish(synth.getVoices()); };
    synth.addEventListener('voiceschanged', onChanged);
    setTimeout(function() { finish(synth.getVoices()); }, timeoutMs);
  });

  return pendingPromise;
}

export async function getVoiceForPersona(persona) {
  var p = persona || getPersona();
  var voices = await loadAllVoices();
  return pickVoice(voices, p);
}

export async function applyPersonaToUtterance(utterance, persona) {
  var v = await getVoiceForPersona(persona);
  if (v) {
    utterance.voice = v;
    utterance.lang = v.lang;
    return true;
  }
  return false;
}

export { getPersona };
