/**
 * JARVIS Conversation Manager — Shared conversation state (Electron / JS version).
 */

import { aiService, AIServiceError, getStatusMessage } from './aiService';

// ---- ConversationManager ----
var ConversationManager = (function() {
  var instance;

  function ConversationManager() {
    this.state = 'idle';
    this.messages = [];
    this.callbacks = {};
    this.abortController = null;
    this.retryCount = 0;
    this.maxRetries = 3;
  }

  ConversationManager.prototype.getState = function() { return this.state; };

  ConversationManager.prototype.setCallbacks = function(cb) {
    Object.assign(this.callbacks, cb);
  };

  function setState(self, newState) {
    if (self.state !== newState) {
      var prev = self.state;
      self.state = newState;
      console.log('[ConversationManager] ' + prev + ' → ' + newState);
      if (self.callbacks.onStateChange) self.callbacks.onStateChange(newState);
    }
  }

  ConversationManager.prototype.initialize = async function() {
    var self = this;
    if (self.state === 'listening' || self.state === 'thinking' || self.state === 'speaking') {
      console.log('[ConversationManager] Already active');
      return true;
    }
    setState(self, 'initializing');
    try {
      aiService.refreshCredentials();
      var key = aiService.getApiKey();
      if (!key) {
        self._handleError('No API key configured. Open Settings > Configuration to add your Gemini API key.', false);
        return false;
      }
      var connectivity = await aiService.testConnectivity();
      if (connectivity !== 'ok') {
        var msg = getStatusMessage(connectivity);
        self._handleError(msg || 'Gemini connectivity issue: ' + connectivity, connectivity === 'quota_exhausted' || connectivity === 'network_error');
        if (connectivity === 'missing_key' || connectivity === 'invalid_key') return false;
      }
      try {
        var stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(function(t) { t.stop(); });
      } catch (e) {
        var micMsg = (e && e.name === 'NotAllowedError') ? 'Microphone permission denied. Allow mic access in System Settings.' : 'Microphone not available.';
        self._handleError(micMsg, false);
        return false;
      }
      setState(self, 'listening');
      self.retryCount = 0;
      return true;
    } catch (e) {
      self._handleError('Initialization failed: ' + (e && e.message), false);
      return false;
    }
  };

  ConversationManager.prototype.sendMessage = async function(content) {
    var self = this;
    if (self.state === 'idle' || self.state === 'error') {
      var ok = await self.initialize();
      if (!ok) return;
    }
    var userMsg = { id: Date.now().toString(), role: 'user', content: content.trim(), timestamp: Date.now() };
    self.messages.push(userMsg);
    if (self.callbacks.onMessage) self.callbacks.onMessage(userMsg);
    setState(self, 'thinking');
    try {
      self.abortController = new AbortController();
      var history = self.messages.map(function(m) {
        return { role: m.role === 'assistant' ? 'ai' : 'user', content: m.content };
      });
      var response = await aiService.sendMessage(history, {
        signal: self.abortController.signal,
        onStreamToken: function(token) { if (self.callbacks.onStreamToken) self.callbacks.onStreamToken(token); },
      });
      var aiMsg = { id: (Date.now() + 1).toString(), role: 'assistant', content: response, timestamp: Date.now() };
      self.messages.push(aiMsg);
      if (self.callbacks.onMessage) self.callbacks.onMessage(aiMsg);
      self.retryCount = 0;
      setState(self, 'speaking');
      setTimeout(function() { if (self.state === 'speaking') setState(self, 'listening'); }, 500);
    } catch (e) {
      if (self.abortController && self.abortController.signal.aborted) { setState(self, 'listening'); return; }
      // Honor any quota_exhausted signal — even from legacy non-AIServiceError
      // throws (the Tauri geminiClient/aiManager files use Object.assign-style
      // throws that aren't `instanceof AIServiceError`).
      if (e && e.code === 'quota_exhausted') {
        self._handleError(e.message || '', true);
        setState(self, 'listening');
        return;
      }
      if (e instanceof AIServiceError) {
        if (e.code === 'quota_exhausted') { self._handleError(e.message, true); setState(self, 'listening'); return; }
        if (e.code === 'missing_key' || e.code === 'invalid_key') { self._handleError(e.message, false); return; }
      }
      if (self.retryCount < self.maxRetries) { self.retryCount++; setState(self, 'recovering'); setTimeout(function() { self.sendMessage(content); }, 1500); return; }
      self._handleError(e && e.message ? e.message : 'Request failed', false);
    } finally { self.abortController = null; }
  };

  ConversationManager.prototype.sendVoiceTranscript = async function(text) {
    if (this.callbacks.onTranscript) this.callbacks.onTranscript(text, true);
    await this.sendMessage(text);
  };

  ConversationManager.prototype.cancel = function() {
    if (this.abortController) { this.abortController.abort(); this.abortController = null; }
    setState(this, 'listening');
  };

  ConversationManager.prototype.terminate = function() {
    this.cancel();
    this.messages = [];
    this.retryCount = 0;
    setState(this, 'idle');
  };

  ConversationManager.prototype._handleError = function(message, recoverable) {
    console.error('[ConversationManager] Error:', message);
    if (!recoverable) setState(this, 'error');
    if (this.callbacks.onError) this.callbacks.onError(message, recoverable);
    if (recoverable) {
      var self = this;
      setTimeout(function() {
        if (self.state === 'error') { setState(self, 'recovering'); setTimeout(function() { if (self.state === 'recovering') setState(self, 'listening'); }, 2000); }
      }, 3000);
    }
  };

  ConversationManager.prototype.getMessages = function() { return this.messages.slice(); };
  ConversationManager.prototype.clearMessages = function() { this.messages = []; };

  return {
    getInstance: function() { if (!instance) instance = new ConversationManager(); return instance; }
  };
})();

// ---- Exports ----
export var conversationManager = ConversationManager.getInstance();
export function getConversationManager() { return conversationManager; }
