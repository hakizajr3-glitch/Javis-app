import React, { useState, useRef, useEffect, useCallback } from 'react';
import { VideoOff, Video, Loader2, AlertCircle, RefreshCw } from 'lucide-react';

type CameraState = 'offline' | 'requesting' | 'active' | 'error';

interface LeftSidebarProps {
  headlines?: { id: number; title: string; time: string }[];
}

const CameraWidget: React.FC = () => {
  const [state, setState] = useState<CameraState>('offline');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const attachStream = useCallback(() => {
    const el = videoRef.current;
    const stream = streamRef.current;
    if (el && stream) {
      el.srcObject = stream;
      el.play().catch(() => {});
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

  useEffect(() => {
    if (state === 'active') attachStream();
  }, [state, attachStream]);

  const startCamera = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setState('error');
      setErrorMessage('Camera API not available');
      return;
    }
    setState('requesting');
    setErrorMessage(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        audio: false,
      });
      streamRef.current = stream;
      setState('active');
    } catch (e: any) {
      stopStream();
      setState('error');
      const name = e?.name || 'Error';
      if (name === 'NotAllowedError' || name === 'SecurityError')
        setErrorMessage('Camera permission denied');
      else if (name === 'NotFoundError' || name === 'OverconstrainedError')
        setErrorMessage('No camera detected');
      else if (name === 'NotReadableError')
        setErrorMessage('Camera in use by another app');
      else
        setErrorMessage(name);
    }
  }, [stopStream]);

  const toggleCamera = useCallback(() => {
    if (state === 'requesting') return;
    if (state === 'active') {
      stopStream();
      setState('offline');
      setErrorMessage(null);
    } else {
      void startCamera();
    }
  }, [state, startCamera, stopStream]);

  useEffect(() => {
    return () => stopStream();
  }, [stopStream]);

  const cornerButton = (() => {
    const base = 'absolute bottom-2 right-2 p-1.5 rounded-md border transition-all';
    if (state === 'requesting') {
      return (
        <button type="button" aria-label="Requesting camera" disabled
          className={`${base} bg-stonic-surface/80 border-stonic-b1 cursor-wait`}>
          <Loader2 size={10} className="text-stonic-primary animate-spin" />
        </button>
      );
    }
    if (state === 'active') {
      return (
        <button type="button" aria-label="Stop camera" onClick={toggleCamera}
          className={`${base} bg-stonic-accent/15 border-stonic-accent/40 hover:bg-stonic-accent/25`}>
          <Video size={10} className="text-stonic-accent" />
        </button>
      );
    }
    return (
      <button type="button" aria-label="Turn on camera" onClick={toggleCamera}
        className={`${base} bg-stonic-surface/80 border-stonic-b1 hover:border-stonic-primary/40 hover:bg-stonic-primary/10`}>
        <VideoOff size={10} className="text-stonic-textDim hover:text-stonic-primary transition-colors" />
      </button>
    );
  })();

  return (
    <div className="bg-stonic-card border border-stonic-b1 rounded-xl p-3 relative overflow-hidden">
      <div className="relative aspect-video rounded-lg overflow-hidden bg-stonic-surface/50 border border-stonic-b1">
        {state === 'active' && (
          <video ref={videoRef} autoPlay muted playsInline
            aria-label="Webcam preview"
            className="absolute inset-0 w-full h-full object-cover"
            style={{ transform: 'scaleX(-1)' }}
          />
        )}
        {state !== 'active' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 pointer-events-none">
            {state === 'requesting' && (
              <>
                <Loader2 size={22} className="text-stonic-primary animate-spin opacity-70" />
                <span className="text-[9px] text-stonic-textDim lowercase tracking-wide font-mono-tech">requesting camera</span>
              </>
            )}
            {state === 'error' && (
              <>
                <AlertCircle size={22} className="text-stonic-error opacity-80" />
                <span className="text-[9px] text-stonic-error lowercase tracking-wide font-mono-tech text-center px-2">{errorMessage ?? 'camera error'}</span>
                <span className="text-[8px] text-stonic-textDim lowercase tracking-wide font-mono-tech">click to retry</span>
              </>
            )}
            {state === 'offline' && (
              <>
                <VideoOff size={24} className="text-stonic-textDim mb-1 opacity-30" />
                <span className="text-[9px] text-stonic-textDim lowercase tracking-wide font-mono-tech">camera offline</span>
              </>
            )}
          </div>
        )}
        {state === 'active' && (
          <div className="absolute top-2 left-2 flex items-center gap-1.5 px-1.5 py-0.5 rounded bg-stonic-surface/80 border border-stonic-accent/30">
            <div className="w-1.5 h-1.5 rounded-full bg-stonic-accent animate-pulse shadow-[0_0_6px_rgba(0,245,212,0.8)]" />
            <span className="text-[8px] text-stonic-accent tracking-wider font-mono-tech">LIVE</span>
          </div>
        )}
        {cornerButton}
      </div>
      <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-stonic-primary/20 rounded-tl-lg" />
      <div className="absolute top-0 right-0 w-2 h-2 border-t border-r border-stonic-primary/20 rounded-tr-lg" />
      <div className="absolute bottom-0 left-0 w-2 h-2 border-b border-l border-stonic-primary/20 rounded-bl-lg" />
      <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-stonic-primary/20 rounded-br-lg" />
    </div>
  );
};

const defaultHeadlines = [
  { id: 1, title: 'AI breakthrough in quantum computing announced', time: '2h ago' },
  { id: 2, title: 'Global markets respond to new economic policies', time: '4h ago' },
  { id: 3, title: 'SpaceX launches next-gen satellite constellation', time: '5h ago' },
  { id: 4, title: 'New renewable energy milestone reached', time: '6h ago' },
];

const TodayHeadlines: React.FC<{ headlines?: LeftSidebarProps['headlines'] }> = ({ headlines = defaultHeadlines }) => {
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
          <div key={item.id} className="py-1.5 border-b border-stonic-b1 last:border-0">
            <p className="text-[9px] text-stonic-textDim line-clamp-1 font-mono-tech">{item.title}</p>
          </div>
        ))}
      </div>
      <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-stonic-primary/20 rounded-tl-lg" />
      <div className="absolute top-0 right-0 w-2 h-2 border-t border-r border-stonic-primary/20 rounded-tr-lg" />
      <div className="absolute bottom-0 left-0 w-2 h-2 border-b border-l border-stonic-primary/20 rounded-bl-lg" />
      <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-stonic-primary/20 rounded-br-lg" />
    </div>
  );
};

export const LeftSidebar: React.FC<LeftSidebarProps> = ({ headlines }) => {
  return (
    <div className="w-[280px] flex flex-col gap-4 shrink-0">
      <CameraWidget />
      <TodayHeadlines headlines={headlines} />
    </div>
  );
};
