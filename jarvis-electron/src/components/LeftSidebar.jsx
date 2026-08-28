import React, { useState, useRef, useEffect, useCallback } from 'react';
import { VideoOff, Video, Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { GeminiLiveSession } from '../geminiLiveSession';

const CameraWidget = () => {
  const [state, setState] = useState('offline');
  const [errorMessage, setErrorMessage] = useState(null);
  const [diagnostics, setDiagnostics] = useState(() => ({
    mediaDevicesAvailable: typeof navigator !== 'undefined' && !!navigator.mediaDevices,
    getUserMediaAvailable: typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getUserMedia === 'function',
    secureContext: typeof window !== 'undefined' && window.isSecureContext,
    lastErrorName: null,
    lastErrorMessage: null,
  }));
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const liveRef = useRef(null);
  const [liveVision, setLiveVision] = useState(false);
  const [liveState, setLiveState] = useState('idle');

  // Bind the stream to the <video> element via a callback ref so we attach
  // srcObject at the exact moment the DOM node exists. This avoids the race
  // between React's effect lifecycle and the browser's media pipeline that
  // caused the video to stay black even though the camera LED was on.
  const setVideoRef = useCallback((node) => 
  {
    videoRef.current = node;
    if (node && streamRef.current && node.srcObject !== streamRef.current) {
      node.srcObject = streamRef.current;
      node.onloadedmetadata = () => {
        node.play().catch(() => {});
      };
    }
  }, []);

  const stopStream = useCallback(() => {
    const stream = streamRef.current;
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  // Stream binding is now handled by the callback ref above.

  const startCamera = useCallback(async () => {
    setDiagnostics((prev) => ({
      ...prev,
      mediaDevicesAvailable: typeof navigator !== 'undefined' && !!navigator.mediaDevices,
      getUserMediaAvailable: typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getUserMedia === 'function',
      secureContext: typeof window !== 'undefined' && window.isSecureContext,
    }));
    if (!navigator.mediaDevices?.getUserMedia) {
      setState('error');
      setErrorMessage('Camera API not available in this browser');
      return;
    }
    setState('requesting');
    setErrorMessage(null);

    // Try a chain of constraint sets. Some macOS/WebKit environments
    // (especially Tauri/WkWebView and Electron) reject overly specific
    // constraints or require audio to be requested together with video for
    // the permission prompt to surface. We start broad and fall back.
    const constraints = [
      { video: true, audio: false },
      { video: true, audio: true },
      { video: { width: { ideal: 320 }, height: { ideal: 240 } }, audio: false },
    ];

    let firstError = null;
    for (const c of constraints) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia(c);
        streamRef.current = stream;
        setState('active');
        setDiagnostics((prev) => ({ ...prev, lastErrorName: null, lastErrorMessage: null }));
        return;
      } catch (e) {
        if (!firstError) firstError = e;
      }
    }

    // All attempts failed — surface the first error because it is usually
    // the most informative (NotAllowedError, NotFoundError, etc.).
    stopStream();
    const e = firstError;
    const name = e?.name || 'Error';
    const message = e?.message || String(e);
    setDiagnostics((prev) => ({ ...prev, lastErrorName: name, lastErrorMessage: message }));
    setState('error');
    if (name === 'NotAllowedError' || name === 'SecurityError') {
      setErrorMessage('Camera permission denied');
    } else if (name === 'NotFoundError' || name === 'OverconstrainedError') {
      setErrorMessage('No camera detected');
    } else if (name === 'NotReadableError') {
      setErrorMessage('Camera in use by another app');
    } else {
      setErrorMessage(name);
    }
  }, [stopStream]);

  const toggleCamera = useCallback(() => {
    if (state === 'requesting') return;
    if (state === 'active') {
      liveRef.current?.stop();
      setLiveVision(false);
      stopStream();
      setState('offline');
      setErrorMessage(null);
    } else {
      void startCamera();
    }
  }, [state, startCamera, stopStream]);

  useEffect(() => {
    return () => {
      liveRef.current?.stop();
      stopStream();
    };
  }, [stopStream]);

  // Reset Live Vision UI state whenever the user turns the toggle off.
  useEffect(() => {
    if (!liveVision) setLiveState('idle');
  }, [liveVision]);

  // Manage Gemini Live Vision session: start when the camera is active and
  // the user has toggled Live Vision on; stop when either condition drops.
  useEffect(() => {
    if (state !== 'active' || !liveVision) return;
    const apiKey = localStorage.getItem('gemini_api_key') || '';
    if (!apiKey) {
      setErrorMessage('Gemini API key required for Live Vision');
      setLiveState('error');
      return;
    }
    if (!videoRef.current) return;

    const session = new GeminiLiveSession();
    liveRef.current = session;

    session
      .start(apiKey, videoRef.current, {
        onStateChange: setLiveState,
        onError: (msg) => {
          setErrorMessage(msg);
          setLiveState('error');
        },
        onTranscript: (text) => console.log('[Live Vision]', text),
      })
      .catch((err) => {
        setLiveState('error');
        setErrorMessage(err.message || 'Live Vision failed to start');
      });

    return () => session.stop();
  }, [state, liveVision]);

  const cornerButton = (() => {
    const base =
      'absolute bottom-2 right-2 p-1.5 rounded-md border transition-all';
    if (state === 'requesting') {
      return (
        <button
          type="button"
          aria-label="Requesting camera"
          disabled
          className={`${base} bg-stonic-surface/80 border-stonic-b1 cursor-wait`}
        >
          <Loader2 size={10} className="text-stonic-primary animate-spin" />
        </button>
      );
    }
    if (state === 'active') {
      return (
        <button
          type="button"
          aria-label="Stop camera"
          onClick={toggleCamera}
          className={`${base} bg-stonic-accent/15 border-stonic-accent/40 hover:bg-stonic-accent/25`}
        >
          <Video size={10} className="text-stonic-accent" />
        </button>
      );
    }
    return (
      <button
        type="button"
        aria-label="Turn on camera"
        onClick={toggleCamera}
        className={`${base} bg-stonic-surface/80 border-stonic-b1 hover:border-stonic-primary/40 hover:bg-stonic-primary/10`}
      >
        <VideoOff size={10} className="text-stonic-textDim hover:text-stonic-primary transition-colors" />
      </button>
    );
  })();

  return (
    <div className="bg-stonic-card border border-stonic-b1 rounded-xl p-3 relative overflow-hidden">
      <div className="relative aspect-video rounded-lg overflow-hidden bg-stonic-surface/50 border border-stonic-b1">
        {state === 'active' && (
          <video
            ref={setVideoRef}
            autoPlay
            muted
            playsInline
            aria-label="Webcam preview"
            className="absolute inset-0 w-full h-full object-cover"
            style={{ transform: 'scaleX(-1)' }}
          />
        )}

        {state !== 'active' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 pointer-events-none">
            {state === 'requesting' && (
              <>
                <Loader2
                  size={22}
                  className="text-stonic-primary animate-spin opacity-70"
                />
                <span className="text-[9px] text-stonic-textDim lowercase tracking-wide font-mono-tech">
                  requesting camera
                </span>
              </>
            )}
            {state === 'error' && (
              <>
                <AlertCircle size={22} className="text-stonic-error opacity-80" />
                <span className="text-[9px] text-stonic-error lowercase tracking-wide font-mono-tech text-center px-2">
                  {errorMessage ?? 'camera error'}
                </span>
                {/* TCC-denied? Show a one-click deep link straight to macOS
                    System Settings → Camera so the user has a self-serve
                    recovery path. Touching nothing else — the existing
                    pointer-events-none on the parent overlay still blocks
                    clicks on the text spans; this anchor opts back in via
                    pointer-events-auto. */}
                {(errorMessage ?? '').toLowerCase().includes('permission') && (
                  <button
                    type="button"
                    onClick={() => {
                      // Setting window.location.href to an x-apple.systempreferences URL
                      // is the most-reliable way to launch System Settings from WkWebView
                      // and Electron BrowserWindow on macOS — anchor tags nested under
                      // pointer-events-none parents occasionally miss the renderer
                      // hit-test; this onClick fires through cleanly.
                      window.location.href =
                        'x-apple.systempreferences:com.apple.preference.security?Privacy_Camera';
                    }}
                    className="text-[9px] text-stonic-primary hover:text-stonic-accent lowercase tracking-wide font-mono-tech pointer-events-auto cursor-pointer underline underline-offset-2 decoration-stonic-primary/40 bg-transparent border-0 p-0"
                  >
                    open system camera settings →
                  </button>
                )}
                <span className="text-[8px] text-stonic-textDim lowercase tracking-wide font-mono-tech">
                  click to retry
                </span>
              </>
            )}
            {state === 'offline' && (
              <>
                <VideoOff
                  size={24}
                  className="text-stonic-textDim mb-1 opacity-30"
                />
                <span className="text-[9px] text-stonic-textDim lowercase tracking-wide font-mono-tech">
                  camera offline
                </span>
              </>
            )}
          </div>
        )}

        {state === 'active' && (
          <div className="absolute top-2 left-2 flex items-center gap-1.5 px-1.5 py-0.5 rounded bg-stonic-surface/80 border border-stonic-accent/30">
            <div className="w-1.5 h-1.5 rounded-full bg-stonic-accent animate-pulse shadow-[0_0_6px_rgba(0,245,212,0.8)]" />
            <span className="text-[8px] text-stonic-accent tracking-wider font-mono-tech">
              LIVE
            </span>
          </div>
        )}

        {cornerButton}
      </div>

      {/* Camera diagnostics panel — visible inline so users can debug camera
          permission/secure-context issues without opening DevTools. */}
      <div className="mt-2 p-2 rounded-lg bg-stonic-surface/40 border border-stonic-b1/50 font-mono-tech text-[8px] leading-4 text-stonic-textDim">
        <div className="flex items-center justify-between">
          <span>mediaDevices:</span>
          <span className={diagnostics.mediaDevicesAvailable ? 'text-stonic-accent' : 'text-stonic-error'}>
            {diagnostics.mediaDevicesAvailable ? 'yes' : 'no'}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span>getUserMedia:</span>
          <span className={diagnostics.getUserMediaAvailable ? 'text-stonic-accent' : 'text-stonic-error'}>
            {diagnostics.getUserMediaAvailable ? 'yes' : 'no'}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span>secureContext:</span>
          <span className={diagnostics.secureContext ? 'text-stonic-accent' : 'text-stonic-error'}>
            {diagnostics.secureContext ? 'yes' : 'no'}
          </span>
        </div>
        {diagnostics.lastErrorName && (
          <div className="mt-1 pt-1 border-t border-stonic-b1/30">
            <div className="flex items-center justify-between">
              <span>errorName:</span>
              <span className="text-stonic-error">{diagnostics.lastErrorName}</span>
            </div>
            <div className="truncate" title={diagnostics.lastErrorMessage ?? undefined}>
              {diagnostics.lastErrorMessage}
            </div>
          </div>
        )}
      </div>

      {/* Live Vision toggle — only meaningful while the camera is active. */}
      {state === 'active' && (
        <div className="mt-2 flex items-center justify-between p-2 rounded-lg bg-stonic-surface/40 border border-stonic-b1/50">
          <div className="flex flex-col">
            <span className="text-[9px] text-stonic-textDim font-mono-tech">Live Vision</span>
            <span className="text-[8px] text-stonic-textDim/70 font-mono-tech">
              {liveState === 'connecting' && 'connecting…'}
              {liveState === 'connected' && 'connected'}
              {liveState === 'error' && 'error'}
              {liveState === 'idle' && 'off'}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setLiveVision((prev) => !prev)}
            className={`text-[9px] px-2 py-1 rounded border font-mono-tech transition-colors ${
              liveVision
                ? 'bg-stonic-accent/20 border-stonic-accent text-stonic-accent'
                : 'bg-stonic-surface/50 border-stonic-b1 text-stonic-textDim hover:text-stonic-primary'
            }`}
          >
            {liveVision ? 'On' : 'Off'}
          </button>
        </div>
      )}

      <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-stonic-primary/20 rounded-tl-lg" />
      <div className="absolute top-0 right-0 w-2 h-2 border-t border-r border-stonic-primary/20 rounded-tr-lg" />
      <div className="absolute bottom-0 left-0 w-2 h-2 border-b border-l border-stonic-primary/20 rounded-bl-lg" />
      <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-stonic-primary/20 rounded-br-lg" />
    </div>
  );
};

const TodayHeadlines = () => {
  const headlines = [
    { id: 1, title: 'AI breakthrough in quantum computing announced', time: '2h ago' },
    { id: 2, title: 'Global markets respond to new economic policies', time: '4h ago' },
    { id: 3, title: 'SpaceX launches next-gen satellite constellation', time: '5h ago' },
    { id: 4, title: 'New renewable energy milestone reached', time: '6h ago' },
  ];

  return (
    <div className="bg-stonic-card border border-stonic-b1 rounded-xl p-3 flex-1 flex flex-col min-h-0 relative overflow-hidden">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[11px] font-bold text-stonic-primary tracking-wide font-mono-tech">Today Headlines</h3>
        <div className="flex items-center gap-1">
          <button className="p-1 rounded hover:bg-stonic-hover transition-colors">
            <RefreshCw size={9} className="text-stonic-textDim" />
          </button>
        </div>
      </div>

      <div className="flex-1 space-y-2">
        {headlines.map((item) => (
          <div
            key={item.id}
            className="py-1.5 border-b border-stonic-b1 last:border-0"
          >
            <p className="text-[9px] text-stonic-textDim line-clamp-1 font-mono-tech">
              {item.title}
            </p>
          </div>
        ))}
        <div className="py-1.5 border-b border-stonic-b1">
          <div className="h-2 bg-stonic-hover/50 rounded w-4/5" />
        </div>
        <div className="py-1.5 border-b border-stonic-b1">
          <div className="h-2 bg-stonic-hover/50 rounded w-3/5" />
        </div>
        <div className="py-1.5 border-b border-stonic-b1">
          <div className="h-2 bg-stonic-hover/50 rounded w-2/3" />
        </div>
      </div>

      <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-stonic-primary/20 rounded-tl-lg" />
      <div className="absolute top-0 right-0 w-2 h-2 border-t border-r border-stonic-primary/20 rounded-tr-lg" />
      <div className="absolute bottom-0 left-0 w-2 h-2 border-b border-l border-stonic-primary/20 rounded-bl-lg" />
      <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-stonic-primary/20 rounded-br-lg" />
    </div>
  );
};

export const LeftSidebar = () => {
  return (
    <div className="w-[280px] flex flex-col gap-4 shrink-0">
      <CameraWidget />
      <TodayHeadlines />
    </div>
  );
};
