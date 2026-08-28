/**
 * JARVIS AI Service — Centralized Gemini integration (Electron / JS version).
 */

// ---- Config ----
import { AIProviderConfig, getActiveModel, sanitizeModel, JARVIS_SYSTEM_INSTRUCTION } from './aiProviderConfig';
var DEFAULT_PRIMARY_MODEL = AIProviderConfig.fastModel;
var FALLBACK_MODELS = AIProviderConfig.fallbackModels;
var MAX_RETRIES_5XX = 3;
var RETRY_BACKOFF_BASE_MS = 800;

// ---- Helpers ----
function readApiKey() {
  try {
    var saved = localStorage.getItem('jarvis_config');
    var fromCfg = saved && JSON.parse(saved).gemini_api_key;
    if (fromCfg && String(fromCfg).trim()) return String(fromCfg).trim();
  } catch (_) {}
  try {
    var standalone = localStorage.getItem('gemini_api_key');
    if (standalone && String(standalone).trim()) return String(standalone).trim();
  } catch (_) {}
  return '';
}

function readModel() {
  // Precedence: explicit SystemConfigModal dropdown pick (model_fast)
  // wins over the Deep Reasoning toggle (reasoning_mode='deep') so the
  // user's saved model selection is always honored.
  try {
    var saved = localStorage.getItem('jarvis_config');
    var fromCfg = saved && JSON.parse(saved);
    if (fromCfg && fromCfg.model_fast) {
      // Migrate stale saved picks: a previously-saved model that is no
      // longer in the provider's available list (retired / quota-blocked,
      // e.g. gemini-2.0-flash-lite) falls back to the current default
      // instead of 429/404-ing on every request. When falling back, honor
      // the user's reasoning mode (deep → deepModel) rather than always
      // returning the fast model.
      var fallback = (fromCfg && fromCfg.reasoning_mode === 'deep') ? AIProviderConfig.deepModel : AIProviderConfig.fastModel;
      return sanitizeModel(fromCfg.model_fast, fallback);
    }
    if (fromCfg && fromCfg.reasoning_mode === 'deep') return AIProviderConfig.deepModel;
  } catch (_) {}
  return getActiveModel();
}

function sleep(ms) {
  return new Promise(function(r) { setTimeout(r, ms); });
}

// ---- AIService ----
var AIService = (function() {
  var instance;

  function AIService() {
    this.apiKey = '';
    this.primaryModel = DEFAULT_PRIMARY_MODEL;
    this.currentModel = DEFAULT_PRIMARY_MODEL;
    this.abortController = null;
  }

  AIService.prototype.refreshCredentials = function() {
    this.apiKey = readApiKey();
    this.primaryModel = readModel();
    this.currentModel = this.primaryModel;
  };

  AIService.prototype.getApiKey = function() {
    return this.apiKey || readApiKey();
  };

  AIService.prototype.getModel = function() {
    return this.currentModel;
  };

  AIService.prototype.testConnectivity = async function() {
    var key = this.getApiKey();
    if (!key) return 'missing_key';
    try {
      var url = 'https://generativelanguage.googleapis.com/v1beta/models/' + this.primaryModel + ':generateContent?key=' + key;
      var res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'ping' }] }], generationConfig: { maxOutputTokens: 1 } }),
        signal: AbortSignal.timeout(10000),
      });
      if (res.ok) return 'ok';
      if (res.status === 400 || res.status === 403 || res.status === 401) return 'invalid_key';
      if (res.status === 404) return 'model_unavailable';
      if (res.status === 429) return 'quota_exhausted';
      if (res.status === 402) return 'billing_required';
      return 'network_error';
    } catch (e) {
      return 'network_error';
    }
  };

  AIService.prototype.testModel = async function(modelName) {
    var key = this.getApiKey();
    if (!key) return 'missing_key';
    try {
      var url = 'https://generativelanguage.googleapis.com/v1beta/models/' + modelName + ':generateContent?key=' + key;
      var res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'test' }] }], generationConfig: { maxOutputTokens: 1 } }),
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) return 'ok';
      if (res.status === 404) return 'model_unavailable';
      if (res.status === 429) return 'quota_exhausted';
      if (res.status === 400 || res.status === 403) return 'invalid_key';
      return 'network_error';
    } catch (e) {
      return 'network_error';
    }
  };

  AIService.prototype.runDiagnostics = async function() {
    var self = this;
    var report = {
      config: false, apiKey: false, geminiConnectivity: 'unknown',
      modelAvailability: {}, quota: 'unknown', microphone: 'unknown',
      speaker: false, stt: false, tts: false, conversationManager: true,
      timestamp: Date.now(),
    };
    self.refreshCredentials();
    report.config = true;
    report.apiKey = !!self.getApiKey();
    if (report.apiKey) { report.geminiConnectivity = await self.testConnectivity(); }
    else { report.geminiConnectivity = 'missing_key'; }
    var allModels = [self.primaryModel].concat(FALLBACK_MODELS);
    for (var i = 0; i < allModels.length; i++) {
      var model = allModels[i];
      report.modelAvailability[model] = report.apiKey ? await self.testModel(model) : 'missing_key';
    }
    report.quota = report.geminiConnectivity === 'quota_exhausted' ? 'quota_exhausted' : 'ok';
    try {
      if (navigator && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        var stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(function(t) { t.stop(); });
        report.microphone = 'granted';
      } else { report.microphone = 'error'; }
    } catch (e) { report.microphone = (e && e.name === 'NotAllowedError') ? 'denied' : 'error'; }
    report.speaker = typeof window !== 'undefined' && 'speechSynthesis' in window;
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    report.stt = !!SR;
    report.tts = report.speaker;
    return report;
  };

  AIService.prototype.sendWithRetry = async function(model, key, messages, options) {
    var contents = messages.map(function(m) {
      return { role: m.role === 'ai' ? 'model' : 'user', parts: [{ text: m.content }] };
    });
    var url = 'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + key;
    var lastErr = null;
    for (var attempt = 0; attempt < MAX_RETRIES_5XX; attempt++) {
      if (options && options.signal && options.signal.aborted) {
        throw new AIServiceError('cancelled', 'Request was cancelled.');
      }
      var res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ systemInstruction: JARVIS_SYSTEM_INSTRUCTION, contents: contents }),
        signal: options ? options.signal : undefined,
      });
      if (res.ok) {
        var data = await res.json();
        var text = (data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0] && data.candidates[0].content.parts[0].text) || 'No response';
        if (options && options.onStreamToken) options.onStreamToken(text);
        return text;
      }
      if (res.status === 429) {
        // Recoverable; ConversationManager handles recovery. Throw silent
        // message so any caller that naively displays err.message stays quiet.
        throw new AIServiceError('quota_exhausted', '');
      }
      if (res.status === 400 || res.status === 401 || res.status === 403) {
        throw new AIServiceError('invalid_key', 'Gemini API key rejected (' + res.status + '). Please verify your key in Settings > Configuration.');
      }
      if (res.status === 404) {
        throw new AIServiceError('model_unavailable', 'Model "' + model + '" is not available. Trying fallback models...');
      }
      if (res.status >= 500) {
        var backoff = Math.min(8000, RETRY_BACKOFF_BASE_MS * Math.pow(2, attempt));
        console.warn('[AIService] ' + res.status + ' on ' + model + ' attempt ' + (attempt + 1) + '; retrying in ' + backoff + 'ms');
        await sleep(backoff);
        lastErr = new Error('Server error: ' + res.status);
        continue;
      }
      lastErr = new Error('Gemini API error: ' + res.status);
      break;
    }
    throw lastErr || new Error('Gemini request failed');
  };

  AIService.prototype.sendMessage = async function(messages, options) {
    var self = this;
    self.refreshCredentials();
    var key = self.getApiKey();
    if (!key) {
      throw new AIServiceError('missing_key', 'Gemini API key not configured. Open Settings > Configuration to add your key.');
    }
    var modelsToTry = [self.primaryModel].concat(FALLBACK_MODELS.filter(function(m) { return m !== self.primaryModel; }));
    var lastError = null;
    for (var i = 0; i < modelsToTry.length; i++) {
      var model = modelsToTry[i];
      try {
        self.currentModel = model;
        return await self.sendWithRetry(model, key, messages, options);
      } catch (e) {
        lastError = e;
        if (e instanceof AIServiceError) {
          if (e.code === 'missing_key' || e.code === 'invalid_key') throw e;
          if (e.code === 'quota_exhausted') continue;
          if (e.code === 'model_unavailable') continue;
        }
        continue;
      }
    }
    throw lastError || new AIServiceError('unknown', 'All Gemini models failed. Please try again later.');
  };

  AIService.prototype.cancel = function() {
    if (this.abortController) { this.abortController.abort(); this.abortController = null; }
  };

  return {
    getInstance: function() {
      if (!instance) instance = new AIService();
      return instance;
    }
  };
})();

// ---- Error Class ----
function AIServiceError(code, message) {
  this.code = code;
  this.name = 'AIServiceError';
  Error.call(this, message);
  if (Error.captureStackTrace) Error.captureStackTrace(this, AIServiceError);
}
AIServiceError.prototype = Object.create(Error.prototype);
AIServiceError.prototype.constructor = AIServiceError;

// ---- Exports ----
export { AIServiceError };
export var aiService = AIService.getInstance();

export async function runStartupDiagnostics() {
  var report = await aiService.runDiagnostics();
  var lines = [];
  var allPassed = true;
  function pass(label, ok, detail) {
    var mark = ok ? '✅' : '❌';
    if (!ok) allPassed = false;
    lines.push(mark + ' ' + label + (detail ? ': ' + detail : ''));
  }
  pass('Configuration loaded', report.config);
  pass('API key configured', report.apiKey);
  var labels = { ok: 'Connected', missing_key: 'No API key', invalid_key: 'Key rejected', model_unavailable: 'Model not available', quota_exhausted: 'Online (rate limited)', billing_required: 'Billing required', network_error: 'Network error' };
  // Quota is recoverable — not a startup failure. Mark as ✅.
  var connOk = report.geminiConnectivity === 'ok' || report.geminiConnectivity === 'quota_exhausted';
  pass('Gemini connectivity', connOk, labels[report.geminiConnectivity] || report.geminiConnectivity);
  // Per-model availability: also treat quota as a pass for parity with Tauri.
  var models = Object.keys(report.modelAvailability);
  for (var i = 0; i < models.length; i++) {
    var st = report.modelAvailability[models[i]];
    pass('Model: ' + models[i], st === 'ok' || st === 'quota_exhausted', st === 'quota_exhausted' ? 'rate limited' : st);
  }
  var micLabels = { granted: 'Permission granted', denied: 'Permission denied', error: 'Not available' };
  pass('Microphone', report.microphone === 'granted', micLabels[report.microphone] || report.microphone);
  pass('Speaker / TTS', report.speaker);
  pass('Speech Recognition (STT)', report.stt);
  return { report: report, summary: lines.join('\n'), allPassed: allPassed };
}

export function getStatusMessage(status) {
  var map = {
    missing_key: 'No API key configured. Open Settings > Configuration to add your Gemini API key.',
    invalid_key: 'API key was rejected. Please verify your key in Settings > Configuration.',
    model_unavailable: 'The selected Gemini model is not available. Try switching models in Settings.',
    quota_exhausted: '', // Recoverable — silent. Live diagnostics panel reflects the state.
    billing_required: 'Billing must be enabled on your Google AI Studio account.',
    network_error: 'Cannot reach Gemini API. Check your internet connection.',
  };
  return map[status] || '';
}
