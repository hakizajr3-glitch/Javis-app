import React, { useState, useEffect, useRef, useCallback } from "react";
import { Plus, Folder, FolderOpen, Paperclip, Brain, Clock, User, Settings, Loader2, Zap, Layers, ExternalLink, Sparkles, X, AlertTriangle } from "lucide-react";
import { SystemModal } from './SystemModal';
import { SystemConfigModal } from './SystemConfigModal';
import { conversationManager } from '../conversationManager';
import { runStartupDiagnostics } from '../aiService';

const ConnectionLines = () => {
  const canvasRef = useRef(null);
  const animationRef = useRef(0);
  const particlesRef = useRef([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    particlesRef.current = [];
    for (let lineIdx = 0; lineIdx < 5; lineIdx++) {
      for (let i = 0; i < 5; i++) {
        particlesRef.current.push({
          t: i / 5,
          speed: 0.01 + Math.random() * 0.005,
          lineIndex: lineIdx,
        });
      }
    }

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * 2;
      canvas.height = rect.height * 2;
      ctx.scale(2, 2);
    };
    resize();
    window.addEventListener('resize', resize);

    const animate = () => {
      const rect = canvas.getBoundingClientRect();
      const width = rect.width;
      const height = rect.height;
      ctx.clearRect(0, 0, width, height);

      const lineColors = [
        { main: 'rgba(0, 216, 238, 0.7)', glow: 'rgba(0, 216, 238, 0.4)' },
        { main: 'rgba(239, 68, 68, 0.7)', glow: 'rgba(239, 68, 68, 0.4)' },
        { main: 'rgba(59, 130, 246, 0.7)', glow: 'rgba(59, 130, 246, 0.4)' },
        { main: 'rgba(200, 210, 230, 0.6)', glow: 'rgba(200, 210, 230, 0.3)' },
        { main: 'rgba(245, 158, 11, 0.7)', glow: 'rgba(245, 158, 11, 0.4)' },
      ];

      const cardHeight = 56;
      const cardGap = 8;
      const totalCardSpace = (cardHeight * 5) + (cardGap * 4);
      const startY = (height - totalCardSpace) / 2;

      const cardYPositions = [
        startY + cardHeight * 0.5,
        startY + cardHeight * 1.5 + cardGap,
        startY + cardHeight * 2.5 + cardGap * 2,
        startY + cardHeight * 3.5 + cardGap * 3,
        startY + cardHeight * 4.5 + cardGap * 4,
      ];
      const cardX = 0;

      const funnelX = width * 0.45;
      const funnelY = height * 0.5;

      const aiX = width;
      const aiY = height * 0.5;

      lineColors.forEach((color, i) => {
        const startYPos = cardYPositions[i];

        ctx.beginPath();
        ctx.moveTo(cardX, startYPos);

        const cp1x = cardX + (funnelX - cardX) * 0.5;
        const cp1y = startYPos;
        const cp2x = funnelX - (funnelX - cardX) * 0.3;
        const cp2y = funnelY;

        ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, funnelX, funnelY);

        ctx.strokeStyle = color.main;
        ctx.lineWidth = i === 1 ? 2.5 : 2;
        ctx.lineCap = 'round';
        ctx.shadowColor = color.glow;
        ctx.shadowBlur = 10;
        ctx.stroke();
        ctx.shadowBlur = 0;
      });

      ctx.beginPath();
      ctx.moveTo(funnelX, funnelY);
      ctx.lineTo(aiX, aiY);
      ctx.strokeStyle = 'rgba(0, 216, 238, 0.95)';
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.shadowColor = 'rgba(0, 216, 238, 0.5)';
      ctx.shadowBlur = 15;
      ctx.stroke();
      ctx.shadowBlur = 0;

      ctx.beginPath();
      ctx.moveTo(funnelX, funnelY);
      ctx.lineTo(aiX, aiY);
      ctx.strokeStyle = 'rgba(0, 245, 255, 0.3)';
      ctx.lineWidth = 10;
      ctx.shadowColor = 'rgba(0, 216, 238, 0.4)';
      ctx.shadowBlur = 20;
      ctx.stroke();
      ctx.shadowBlur = 0;

      ctx.fillStyle = '#00d8ee';
      ctx.shadowColor = 'rgba(0, 216, 238, 0.8)';
      ctx.shadowBlur = 15;
      ctx.beginPath();
      ctx.arc(funnelX, funnelY, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      particlesRef.current.forEach((p) => {
        p.t += p.speed;
        if (p.t > 1) p.t = 0;

        const i = p.lineIndex;
        const startYPos = cardYPositions[i];
        const t = p.t;

        const oneMinusT = 1 - t;
        const cp1x = cardX + (funnelX - cardX) * 0.5;
        const cp1y = startYPos;
        const cp2x = funnelX - (funnelX - cardX) * 0.3;
        const cp2y = funnelY;

        const x = oneMinusT * oneMinusT * oneMinusT * cardX +
            3 * oneMinusT * oneMinusT * t * cp1x +
            3 * oneMinusT * t * t * cp2x +
            t * t * t * funnelX;
        const y = oneMinusT * oneMinusT * oneMinusT * startYPos +
            3 * oneMinusT * oneMinusT * t * cp1y +
            3 * oneMinusT * t * t * cp2y +
            t * t * t * funnelY;

        const colors = ['#00d8ee', '#ef4444', '#3b82f6', '#ffffff', '#f59e0b'];
        ctx.fillStyle = colors[i];
        ctx.shadowColor = colors[i];
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      });

      const trunkParticles = 5;
      for (let i = 0; i < trunkParticles; i++) {
        const trunkT = ((Date.now() / 1000 * 0.4) + (i / trunkParticles)) % 1;
        const trunkX = funnelX + (aiX - funnelX) * trunkT;

        const alpha = trunkT < 0.2 ? trunkT / 0.2 : (trunkT > 0.8 ? (1 - trunkT) / 0.2 : 1);

        ctx.fillStyle = `rgba(0, 216, 238, ${alpha})`;
        ctx.shadowColor = 'rgba(0, 216, 238, 0.8)';
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.arc(trunkX, aiY, 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      animationRef.current = requestAnimationFrame(animate);
    };

    animate();
    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animationRef.current);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ zIndex: 10 }}
    />
  );
};

const ParticleSphere = ({ state, audioLevel = 0 }) => {
  const canvasRef = useRef(null);
  const animationRef = useRef(0);
  const rotationRef = useRef(0);
  const particlesRef = useRef([]);
  const pulseRef = useRef(0);
  const vortexRef = useRef(0);

  useEffect(() => {
    const particles = [];
    const particleCount = 600;
    const radius = 75;
    const phi = Math.PI * (3 - Math.sqrt(5));

    for (let i = 0; i < particleCount; i++) {
      const y = 1 - (i / (particleCount - 1)) * 2;
      const radiusAtY = Math.sqrt(1 - y * y) * radius;
      const theta = phi * i;

      const x = Math.cos(theta) * radiusAtY;
      const z = Math.sin(theta) * radiusAtY;

      particles.push({
        x, y: y * radius, z,
        baseX: x, baseY: y * radius, baseZ: z,
        size: Math.random() * 1.2 + 0.8,
        opacity: Math.random() * 0.4 + 0.5,
      });
    }
    particlesRef.current = particles;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * 2;
      canvas.height = rect.height * 2;
      ctx.scale(2, 2);
    };
    resize();
    window.addEventListener('resize', resize);

    const noise = (x, y, z, t) => {
      return Math.sin(x * 0.1 + t) * Math.cos(y * 0.1 + t * 0.7) * Math.sin(z * 0.1 + t * 0.5);
    };

    const animate = () => {
      const rect = canvas.getBoundingClientRect();
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;

      ctx.clearRect(0, 0, rect.width, rect.height);

      const active = state !== 'idle';
      rotationRef.current += active ? 0.006 : 0.0015;
      pulseRef.current += 0.05;
      vortexRef.current += active ? 0.02 : 0.005;

      const baseAudioLevel = Math.max(0, Math.min(1, audioLevel || 0));
      const boostedAudio = Math.pow(baseAudioLevel, 0.5) * 1.5;

      const distortionAmount = state === 'idle' ? boostedAudio * 30 + 2 :
                               state === 'listening' ? 10 + boostedAudio * 40 :
                               state === 'transcribing' ? 12 + boostedAudio * 50 :
                               state === 'thinking' ? 25 :
                               state === 'executing' ? 25 :
                               state === 'speaking' ? 15 + boostedAudio * 25 : 10;
      const vortexStrength = state === 'listening' ? 0.3 + boostedAudio * 1.0 :
                              state === 'transcribing' ? 0.4 + boostedAudio * 1.2 :
                              state === 'thinking' ? 0.6 :
                              state === 'executing' ? 0.5 :
                              state === 'speaking' ? 0.2 + boostedAudio * 0.6 : 0;
      const dynamicScale = 1 + boostedAudio * 0.5;

      const sortedParticles = [...particlesRef.current].map(p => {
        const cos = Math.cos(rotationRef.current);
        const sin = Math.sin(rotationRef.current);
        let rx = p.baseX * cos - p.baseZ * sin;
        let rz = p.baseX * sin + p.baseZ * cos;
        let ry = p.baseY;

        const distFromCenter = Math.sqrt(p.baseX ** 2 + p.baseY ** 2 + p.baseZ ** 2) / 75;

        let distortion = 0;
        if (state !== 'idle') {
          const t = pulseRef.current * 0.1;
          const n = noise(p.baseX, p.baseY, p.baseZ, t);
          distortion = n * distortionAmount * (1 - distFromCenter * 0.3);
        }

        if (vortexStrength > 0 && state !== 'idle') {
          const vortexAngle = vortexRef.current + distFromCenter * 2;
          const vortexRadius = 1 + Math.sin(vortexRef.current * 2 + distFromCenter * 3) * 0.2 * vortexStrength;

          rx = rx * vortexRadius;
          ry = ry * vortexRadius;
          rz = rz * vortexRadius;

          const spiralCos = Math.cos(vortexAngle * 0.1);
          const spiralSin = Math.sin(vortexAngle * 0.1);
          const tempX = rx;
          rx = tempX * spiralCos - rz * spiralSin;
          rz = tempX * spiralSin + rz * spiralCos;
        }

        const radius = (75 + distortion) * dynamicScale;
        const currentRadius = Math.sqrt(rx ** 2 + ry ** 2 + rz ** 2);
        const scale = radius / currentRadius;

        rx *= scale;
        ry *= scale;
        rz *= scale;

        let currentOpacity = p.opacity;
        if (state === 'idle') {
          currentOpacity *= (0.7 + 0.3 * Math.sin(pulseRef.current * 0.05 + p.baseY * 0.03));
        } else {
          const pulse = 0.5 + 0.5 * Math.sin(pulseRef.current * 0.3 + distFromCenter * 5);
          currentOpacity *= (0.8 + pulse * 0.4);
        }

        return {
          ...p,
          x: rx,
          y: ry,
          z: rz,
          currentOpacity,
        };
      }).sort((a, b) => b.z - a.z);

      sortedParticles.forEach((p, index) => {
        const scale = 200 / (200 + p.z);
        const x = centerX + p.x * scale;
        const y = centerY + p.y * scale;
        const size = p.size * scale;

        const edgeFade = Math.max(0, Math.min(1, (p.z + 75) / 30));

        let color;
        let glowColor;

        if (state === 'listening') {
          const intensity = 0.6 + 0.4 * Math.sin(pulseRef.current * 0.4 + index * 0.01);
          color = `rgba(0, ${Math.floor(200 + intensity * 55)}, 238, ${p.currentOpacity * edgeFade})`;
          glowColor = `rgba(0, 216, 238, ${p.currentOpacity * 0.3})`;
        } else if (state === 'transcribing') {
          const intensity = 0.7 + 0.3 * Math.sin(pulseRef.current * 0.5 + index * 0.015);
          color = `rgba(0, ${Math.floor(180 + intensity * 60)}, ${Math.floor(230 + intensity * 25)}, ${p.currentOpacity * edgeFade})`;
          glowColor = `rgba(100, 200, 255, ${p.currentOpacity * 0.35})`;
        } else if (state === 'thinking') {
          const intensity = 0.6 + 0.4 * Math.sin(pulseRef.current * 0.7 + index * 0.02);
          const v = Math.floor(200 + intensity * 55);
          color = `rgba(${v}, ${v}, 255, ${p.currentOpacity * edgeFade})`;
          glowColor = `rgba(180, 180, 255, ${p.currentOpacity * 0.4})`;
        } else if (state === 'executing') {
          const intensity = 0.5 + 0.5 * Math.sin(pulseRef.current * 0.5 + index * 0.01);
          color = `rgba(${Math.floor(255 * intensity)}, ${Math.floor(200 * intensity)}, 100, ${p.currentOpacity * edgeFade})`;
          glowColor = `rgba(255, 200, 100, ${p.currentOpacity * 0.35})`;
        } else if (state === 'speaking') {
          const intensity = 0.5 + 0.5 * Math.sin(pulseRef.current * 0.3 + index * 0.015);
          color = `rgba(0, 245, 212, ${p.currentOpacity * intensity * edgeFade})`;
          glowColor = `rgba(0, 245, 212, ${p.currentOpacity * 0.35})`;
        } else {
          const heightFactor = (p.y + 75) / 150;
          const r = Math.floor(180 + heightFactor * 20);
          const g = Math.floor(210 + heightFactor * 45);
          const b = Math.floor(238 + heightFactor * 17);
          color = `rgba(${r}, ${g}, ${b}, ${p.currentOpacity * 0.8 * edgeFade})`;
          glowColor = `rgba(0, 216, 238, ${p.currentOpacity * 0.15})`;
        }

        if (p.z > -30) {
          ctx.fillStyle = glowColor;
          ctx.beginPath();
          ctx.arc(x, y, size * 3, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fill();
      });

      const time = pulseRef.current;

      const ringGradient = ctx.createRadialGradient(centerX, centerY, 70, centerX, centerY, 85);

      if (state === 'idle') {
        const pulse = 0.15 + 0.05 * Math.sin(time * 0.3);
        ringGradient.addColorStop(0, 'rgba(255, 255, 255, 0)');
        ringGradient.addColorStop(0.7, `rgba(200, 230, 255, ${pulse * 0.5})`);
        ringGradient.addColorStop(0.9, `rgba(255, 255, 255, ${pulse})`);
        ringGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
      } else if (state === 'listening') {
        const pulse = 0.4 + 0.2 * Math.sin(time * 0.8);
        ringGradient.addColorStop(0, 'rgba(0, 216, 238, 0)');
        ringGradient.addColorStop(0.7, `rgba(0, 216, 238, ${pulse * 0.6})`);
        ringGradient.addColorStop(0.9, `rgba(0, 216, 238, ${pulse})`);
        ringGradient.addColorStop(1, 'rgba(0, 216, 238, 0)');
      } else if (state === 'transcribing') {
        const pulse = 0.5 + 0.25 * Math.sin(time * 1.0);
        ringGradient.addColorStop(0, 'rgba(100, 200, 255, 0)');
        ringGradient.addColorStop(0.7, `rgba(100, 200, 255, ${pulse * 0.7})`);
        ringGradient.addColorStop(0.9, `rgba(180, 230, 255, ${pulse})`);
        ringGradient.addColorStop(1, 'rgba(100, 200, 255, 0)');
      } else if (state === 'thinking') {
        const pulse = 0.5 + 0.3 * Math.sin(time * 1.2);
        ringGradient.addColorStop(0, 'rgba(180, 180, 255, 0)');
        ringGradient.addColorStop(0.7, `rgba(200, 200, 255, ${pulse * 0.7})`);
        ringGradient.addColorStop(0.9, `rgba(255, 255, 255, ${pulse})`);
        ringGradient.addColorStop(1, 'rgba(180, 180, 255, 0)');
      } else if (state === 'executing') {
        const pulse = 0.45 + 0.2 * Math.sin(time * 0.9);
        ringGradient.addColorStop(0, 'rgba(255, 200, 100, 0)');
        ringGradient.addColorStop(0.7, `rgba(255, 200, 100, ${pulse * 0.6})`);
        ringGradient.addColorStop(0.9, `rgba(255, 220, 150, ${pulse})`);
        ringGradient.addColorStop(1, 'rgba(255, 200, 100, 0)');
      } else {
        const pulse = 0.35 + 0.15 * Math.sin(time * 0.5);
        ringGradient.addColorStop(0, 'rgba(0, 245, 212, 0)');
        ringGradient.addColorStop(0.7, `rgba(0, 245, 212, ${pulse * 0.6})`);
        ringGradient.addColorStop(0.9, `rgba(0, 245, 212, ${pulse})`);
        ringGradient.addColorStop(1, 'rgba(0, 245, 212, 0)');
      }

      ctx.fillStyle = ringGradient;
      ctx.beginPath();
      ctx.arc(centerX, centerY, 85, 0, Math.PI * 2);
      ctx.fill();

      const outerGlow = ctx.createRadialGradient(centerX, centerY, 80, centerX, centerY, 120);
      if (state === 'idle') {
        outerGlow.addColorStop(0, 'rgba(0, 216, 238, 0.03)');
        outerGlow.addColorStop(1, 'rgba(0, 216, 238, 0)');
      } else {
        const intensity = state === 'thinking' || state === 'transcribing' ? 0.15 : 0.1;
        outerGlow.addColorStop(0, `rgba(0, 216, 238, ${intensity})`);
        outerGlow.addColorStop(0.5, `rgba(0, 216, 238, ${intensity * 0.5})`);
        outerGlow.addColorStop(1, 'rgba(0, 216, 238, 0)');
      }
      ctx.fillStyle = outerGlow;
      ctx.beginPath();
      ctx.arc(centerX, centerY, 120, 0, Math.PI * 2);
      ctx.fill();

      animationRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animationRef.current);
    };
  }, [state, audioLevel]);

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full"
      style={{
        filter: state !== 'idle'
          ? 'drop-shadow(0 0 30px rgba(0, 216, 238, 0.6))'
          : 'drop-shadow(0 0 15px rgba(0, 216, 238, 0.2))'
      }}
    />
  );
};

export const CenterHubExact = () => {
  const [aiActive, setAiActive] = useState(false);
  const [initializing, setInitializing] = useState(false);
  const [orbState, setOrbState] = useState('idle');
  const [currentTranscript, setCurrentTranscript] = useState('');
  const [audioLevel, setAudioLevel] = useState(0);
  const [errorMessage, setErrorMessage] = useState(null);
  const recognitionRef = useRef(null);
  const [modalType, setModalType] = useState(null);
  const fileInputRef = useRef(null);

  // Sync orb state from conversationManager
  useEffect(() => {
    const handler = () => {
      const cs = conversationManager.getState();
      const mapping = {
        idle: 'idle', initializing: 'listening', listening: 'listening',
        transcribing: 'transcribing', thinking: 'thinking', executing: 'executing',
        speaking: 'speaking', error: 'idle', recovering: 'listening',
      };
      setOrbState(mapping[cs] || 'idle');
    };
    conversationManager.setCallbacks({ onStateChange: handler, onTranscript: (text, isFinal) => { if (isFinal) setCurrentTranscript(text); } });
  }, []);

  const handleInitialize = useCallback(async () => {
    if (aiActive) {
      // TERMINATE — full shutdown sequence
      // 1. Stop speech recognition
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch (_) {}
        recognitionRef.current = null;
      }
      // 2. Stop TTS / speech synthesis (so JARVIS doesn't keep talking)
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      // 3. Cancel in-flight AI requests + clear conversation state
      conversationManager.terminate();
      // 4. Reset UI
      setAiActive(false);
      setOrbState('idle');
      setCurrentTranscript('');
      setErrorMessage(null);
    } else {
      setInitializing(true);
      setOrbState('initializing');
      setErrorMessage(null);

      try {
        await runStartupDiagnostics();
      } catch (e) {
        console.warn('[CenterHub] Diagnostics failed:', e);
      }

      const ok = await conversationManager.initialize();
      if (!ok) {
        setInitializing(false);
        setOrbState('idle');
        setAiActive(false);
        return;
      }

      try {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (SpeechRecognition) {
          const recognition = new SpeechRecognition();
          recognition.continuous = true;
          recognition.interimResults = true;
          recognition.lang = 'en-US';


          recognition.onresult = (event) => {
            let interim = '', final = '';
            for (let i = event.resultIndex; i < event.results.length; i++) {
              const transcript = event.results[i][0].transcript;
              if (event.results[i].isFinal) final += transcript;
              else interim += transcript;
            }
            const text = final || interim;
            if (text) {
              setCurrentTranscript(text);
              setOrbState(final ? 'transcribing' : 'listening');
              setAudioLevel(Math.random() * 0.5 + 0.3);
              if (final.trim()) conversationManager.sendVoiceTranscript(final.trim());
            }
          };          recognition.onerror = (event) => {
            if (event.error === 'no-speech') return;
            if (['network', 'not-allowed', 'service-not-allowed'].includes(event.error)) {
              setErrorMessage('Voice input needs mic permission. Check System Settings > Privacy > Microphone.');
              return;
            }
            setErrorMessage(`Speech recognition: ${event.error}`);
          };

          recognition.onend = () => {
            // Only auto-restart if the ref is still live — after
            // TERMINATE we null it so this check prevents a race.
            if (recognitionRef.current) {
              try { recognition.start(); } catch (_) {}
            }
          };

          recognition.start();
          recognitionRef.current = recognition;
        }
      } catch (e) {
        console.warn('[CenterHub] Speech recognition start failed:', e);
      }

      setInitializing(false);
      setAiActive(true);
    }
  }, [aiActive]);

  const getStatusText = () => {
    if (initializing) return 'INITIALIZING...';
    switch (orbState) {
      case 'listening': return currentTranscript || 'LISTENING...';
      case 'transcribing': return currentTranscript || 'TRANSCRIBING...';
      case 'thinking': return 'THINKING...';
      case 'executing': return 'EXECUTING...';
      case 'speaking': return 'J.A.R.V.I.S SPEAKING';
      default:
        if (aiActive) return 'SYSTEM ACTIVE';
        return 'STANDBY MODE';
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex-1 flex min-h-0">
        <div className="flex flex-col justify-center mr-4">
          <div className="bg-stonic-surface/80 backdrop-blur-sm border border-stonic-b1/50 rounded-[28px] px-3 py-5 flex flex-col items-center gap-4">
            <button className="w-14 h-14 rounded-2xl bg-stonic-card/50 border border-stonic-primary/60 flex flex-col items-center justify-center gap-1 shadow-[0_0_20px_rgba(0,216,238,0.25)] hover:shadow-[0_0_25px_rgba(0,216,238,0.4)] transition-all">
              <Plus size={20} className="text-stonic-primary" />
              <span className="text-[7px] font-bold tracking-wider text-stonic-primary font-mono-tech">IMPORT</span>
            </button>

            <div className="w-10 h-px bg-stonic-b1/50" />

            <button className="w-14 h-14 rounded-2xl bg-stonic-card/30 border border-stonic-b1/30 flex flex-col items-center justify-center gap-1 opacity-50 hover:opacity-70 transition-opacity">
              <Folder size={18} className="text-stonic-textDim/60" />
              <span className="text-[6px] font-bold tracking-wider text-stonic-textDim/60 font-mono-tech text-center leading-tight">
                STONIC_<br/>DSKTP
              </span>
            </button>

            <div className="w-10 h-px bg-stonic-b1/50" />

            <button className="w-14 h-14 rounded-2xl bg-stonic-card/30 border border-stonic-b1/30 flex flex-col items-center justify-center gap-1 opacity-50 hover:opacity-70 transition-opacity">
              <FolderOpen size={18} className="text-stonic-textDim/60" />
              <span className="text-[6px] font-bold tracking-wider text-stonic-textDim/60 font-mono-tech text-center leading-tight">
                MY AI<br/>DOCS
              </span>
            </button>
          </div>
        </div>

        <div className="flex flex-col justify-center relative z-20 mr-0">
          <div className="flex flex-col gap-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="relative px-4 py-3 rounded-lg flex items-center gap-3 transition-all duration-300 glass-card border border-cyan-400/30 hover:border-cyan-400/50 cursor-pointer"
            >
              <div className="w-8 h-8 rounded-lg bg-cyan-400/10 border border-cyan-400/30 flex items-center justify-center">
                <Paperclip size={16} className="text-cyan-400" />
              </div>
              <div className="flex flex-col items-start">
                <span className="text-[10px] font-bold tracking-wider text-stonic-text font-mono-tech">ADD FILES</span>
                <span className="text-[7px] text-cyan-400/80 tracking-wider font-mono-tech">MULTIMODAL INPUT</span>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  const files = e.target.files;
                  if (files && files.length > 0) {
                    console.log('[CenterHub] Files selected:', Array.from(files).map(f => f.name).join(', '));
                  }
                }}
              />
            </button>

            <button
              onClick={() => setModalType('memory')}
              className="relative px-4 py-3 rounded-lg flex items-center gap-3 transition-all duration-300 glass-card border border-red-400/40 shadow-[0_0_15px_rgba(239,68,68,0.15)] hover:shadow-[0_0_20px_rgba(239,68,68,0.25)] cursor-pointer"
            >
              <div className="w-8 h-8 rounded-lg bg-red-400/10 border border-red-400/40 flex items-center justify-center">
                <Brain size={16} className="text-red-400" />
              </div>
              <div className="flex flex-col items-start">
                <span className="text-[10px] font-bold tracking-wider text-stonic-text font-mono-tech">MEMORY</span>
                <span className="text-[7px] text-red-400/80 tracking-wider font-mono-tech">SYSTEM ACCESS</span>
              </div>
            </button>

            <button
              onClick={() => setModalType('history')}
              className="relative px-4 py-3 rounded-lg flex items-center gap-3 transition-all duration-300 glass-card border border-blue-400/30 hover:border-blue-400/50 cursor-pointer"
            >
              <div className="w-8 h-8 rounded-lg bg-blue-400/10 border border-blue-400/30 flex items-center justify-center">
                <Clock size={16} className="text-blue-400" />
              </div>
              <div className="flex flex-col items-start">
                <span className="text-[10px] font-bold tracking-wider text-stonic-text font-mono-tech">HISTORY</span>
                <span className="text-[7px] text-blue-400/80 tracking-wider font-mono-tech">SYSTEM ACCESS</span>
              </div>
            </button>

            <button
              onClick={() => setModalType('user')}
              className="relative px-4 py-3 rounded-lg flex items-center gap-3 transition-all duration-300 glass-card border border-slate-400/30 hover:border-slate-400/50 cursor-pointer"
            >
              <div className="w-8 h-8 rounded-lg bg-slate-400/10 border border-slate-400/30 flex items-center justify-center">
                <User size={16} className="text-slate-300" />
              </div>
              <div className="flex flex-col items-start">
                <span className="text-[10px] font-bold tracking-wider text-stonic-text font-mono-tech">USER</span>
                <span className="text-[7px] text-slate-400/80 tracking-wider font-mono-tech">SYSTEM ACCESS</span>
              </div>
            </button>

            <button
              onClick={() => setModalType('settings')}
              className="relative px-4 py-3 rounded-lg flex items-center gap-3 transition-all duration-300 glass-card border border-amber-400/30 hover:border-amber-400/50 cursor-pointer"
            >
              <div className="w-8 h-8 rounded-lg bg-amber-400/10 border border-amber-400/30 flex items-center justify-center">
                <Settings size={16} className="text-amber-300" />
              </div>
              <div className="flex flex-col items-start">
                <span className="text-[10px] font-bold tracking-wider text-stonic-text font-mono-tech">SETTINGS</span>
                <span className="text-[7px] text-amber-400/80 tracking-wider font-mono-tech">CONFIGURATION</span>
              </div>
            </button>
          </div>
        </div>

        <div className="w-[280px] relative -ml-2">
          <ConnectionLines />
        </div>

        <div className="flex-1 flex flex-col relative bg-stonic-card border border-stonic-b1 rounded-xl -ml-2">
          <div className="flex-1 relative min-h-0 flex items-center justify-center">
            <ParticleSphere state={orbState} audioLevel={audioLevel} />

            <div className="absolute inset-0 flex flex-col items-center justify-end pb-16 pointer-events-none">
              <span className="text-[9px] text-stonic-textDim tracking-[0.25em] uppercase font-mono-tech">
                {getStatusText()}
              </span>
            </div>
          </div>

          <div className="flex justify-center py-3">
            <button
              onClick={handleInitialize}
              disabled={initializing}
              className={`
                px-6 py-2 rounded-full text-[10px] font-semibold tracking-wider border
                transition-all duration-500 flex items-center gap-2 font-mono-tech
                ${initializing
                  ? 'border-stonic-b2 text-stonic-textMuted cursor-wait'
                  : aiActive
                    ? 'border-red-500/50 text-red-400 bg-red-500/10 hover:bg-red-500/20'
                    : 'border-stonic-primary/50 text-stonic-primary hover:border-stonic-primary hover:bg-stonic-primary/10 hover:shadow-[0_0_20px_rgba(0,216,238,0.3)]'
                }
              `}
            >
              {initializing ? (
                <><Loader2 size={12} className="animate-spin" /><span>INITIALIZING...</span></>
              ) : aiActive ? (
                <><Zap size={12} /><span>TERMINATE</span></>
              ) : (
                <><Zap size={12} /><span>INITIALIZE AI</span></>
              )}
            </button>
          </div>
        </div>

      </div>

      {errorMessage && (
        <div className="mt-2 bg-red-500/15 border border-red-500/40 rounded-xl px-4 py-2 flex items-center gap-2 animate-in fade-in slide-in-from-top-1 duration-200">
          <span className="text-[10px] text-red-400 font-mono-tech flex-1">{errorMessage}</span>
          <button onClick={() => setErrorMessage(null)} className="text-red-400/60 hover:text-red-400">
            <X size={12} />
          </button>
        </div>
      )}

      <div className="mt-4 bg-stonic-card border border-stonic-b1 rounded-xl p-3 relative overflow-hidden h-[180px]">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-[8px] font-bold text-stonic-primary tracking-wider font-mono-tech">VISUAL HUB</span>
            <span className="text-[7px] text-stonic-textDim px-1 py-0.5 rounded bg-stonic-surface/50 font-mono-tech">READY</span>
          </div>
          <button className="w-6 h-6 rounded-md bg-stonic-surface/50 border border-stonic-b1 flex items-center justify-center hover:bg-stonic-hover transition-colors">
            <ExternalLink size={10} className="text-stonic-textDim" />
          </button>
        </div>

        <div className="flex flex-col items-center justify-center h-full -mt-1">
          <div className="relative">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-stonic-surface to-stonic-surfaceHover border border-stonic-b1/50 flex items-center justify-center shadow-[0_0_15px_rgba(0,212,255,0.1)] mb-2">
              <Layers size={18} className="text-stonic-textDim" />
            </div>
            <div className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-stonic-surface border border-stonic-primary/30 flex items-center justify-center">
              <Sparkles size={6} className="text-stonic-primary" />
            </div>
          </div>

          <h3 className="text-xs font-semibold text-stonic-text mb-1 tracking-wide font-orbitron">
            VISUAL INTELLIGENCE HUB
          </h3>

          <p className="text-[9px] text-stonic-textDim text-center max-w-xs leading-relaxed font-mono-tech mb-2">
            Images, Flowcharts, Mindmaps materialize here.
          </p>

          <div className="flex items-center gap-1.5 text-[8px] text-stonic-textDim uppercase tracking-wider font-mono-tech">
            <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
            <span>System Ready</span>
            <span className="text-stonic-b1">|</span>
            <span className="text-stonic-primary">Awaiting Data Input</span>
          </div>
        </div>
      </div>

      {modalType === 'settings' ? (
        <SystemConfigModal
          isOpen={true}
          onClose={() => setModalType(null)}
        />
      ) : (
        <SystemModal
          isOpen={modalType !== null}
          onClose={() => setModalType(null)}
          type={modalType}
        />
      )}
    </div>
  );
};
