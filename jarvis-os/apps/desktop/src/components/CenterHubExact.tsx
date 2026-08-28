import React, { useState, useEffect, useRef } from "react";
import { Plus, Folder, FolderOpen, Paperclip, Brain, Clock, User, Loader2, Zap, Layers, ExternalLink, Sparkles, Monitor, Globe, MessageSquare, Play, Square, X, ChevronRight } from "lucide-react";

// TypeScript declarations
declare global {
  interface Window {
    electronAPI?: {
      onAIMessage?: (callback: (message: any) => void) => () => void;
      sendCommand?: (command: string) => void;
    };
    isElectron?: boolean;
  }
}

type OrbState = 'idle' | 'listening' | 'processing' | 'speaking';

const WS_URL = `ws://${window.location.hostname}:8000/ws/desktop`;
let wsConnection: WebSocket | null = null;
let wsConnected = false;

const connectWebSocket = (onMessage: (message: any) => void) => {
  // Prevent multiple connections
  if (wsConnection?.readyState === WebSocket.OPEN || wsConnected) {
    console.log('[WebSocket] Already connected, skipping');
    return;
  }
  
  console.log('[WebSocket] Connecting to:', WS_URL);
  wsConnected = true;
  wsConnection = new WebSocket(WS_URL);
  
  wsConnection.onopen = () => {
    console.log('[WebSocket] Connected to AI Engine');
  };
  
  wsConnection.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data);
      console.log('[WebSocket] Message received:', message.type);
      onMessage(message);
    } catch (e) {
      console.error('[WebSocket] Parse error:', e);
    }
  };
  
  wsConnection.onerror = (err) => {
    console.error('[WebSocket] Error:', err);
  };
  
  wsConnection.onclose = () => {
    console.log('[WebSocket] Disconnected');
    wsConnected = false;
    wsConnection = null;
  };
};

const sendViaWebSocket = (type: string, payload: any) => {
  if (wsConnection?.readyState === WebSocket.OPEN) {
    wsConnection.send(JSON.stringify({ type, payload, timestamp: Date.now() }));
  } else {
    console.log('[WebSocket] Not connected, connecting...');
    connectWebSocket((msg) => {
      // This won't work well, so just log
      console.log('[WebSocket] Connected but message already sent');
    });
  }
};

// 11Labs TTS API Key (from Vite env or fallback to empty for browser TTS)
const ELEVENLABS_API_KEY = import.meta.env.VITE_ELEVENLABS_API_KEY || '';
const ELEVENLABS_VOICE_ID = 'EXAVITQu4vr4xnSDxMaL'; // Sarah - Mature, Reassuring, Confident

// TTS Function with 11Labs support
const speakText = async (
  text: string, 
  onStart?: () => void, 
  onEnd?: () => void,
  onAudioLevel?: (level: number) => void
) => {
  console.log('[TTS] Using 11Labs voice:', ELEVENLABS_VOICE_ID);
  console.log('[TTS] Speaking:', text.substring(0, 100));
  
  // Use 11Labs if API key is provided
  if (ELEVENLABS_API_KEY) {
    try {
      onStart?.();
      
      // Call 11Labs TTS API
      const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`, {
        method: 'POST',
        headers: {
          'Accept': 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': ELEVENLABS_API_KEY,
        },
        body: JSON.stringify({
          text: text,
          model_id: 'eleven_flash_v2',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75
          }
        })
      });
      
      console.log('[TTS] 11Labs response status:', response.status);
      
      if (response.ok) {
        console.log('[TTS] 11Labs success, playing audio');
        const audioBlob = await response.blob();
        const audioUrl = URL.createObjectURL(audioBlob);
        const audio = new Audio(audioUrl);
        
        const audioInterval = setInterval(() => {
          onAudioLevel?.(0.3 + Math.random() * 0.4);
        }, 100);
        
        audio.onended = () => {
          clearInterval(audioInterval);
          onAudioLevel?.(0);
          onEnd?.();
          URL.revokeObjectURL(audioUrl);
          console.log('[TTS] 11Labs playback ended');
        };
        
        audio.onerror = (e) => {
          console.error('[TTS] Audio play error:', e);
          clearInterval(audioInterval);
          onAudioLevel?.(0);
          onEnd?.();
        };
        
        audio.play();
        return;
      } else {
        const errorText = await response.text();
        console.error('[TTS] 11Labs API error:', response.status, errorText);
      }
    } catch (err) {
      console.error('[TTS] 11Labs error:', err);
    }
  }
  
  // Fallback to browser speech synthesis
  console.log('[TTS] Falling back to browser TTS');
  if (!('speechSynthesis' in window)) {
    console.warn('[TTS] Speech synthesis not supported');
    onEnd?.();
    return;
  }
  
  window.speechSynthesis.cancel();
  
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 1.0;
  utterance.pitch = 0.9;
  utterance.volume = 1.0;
  
  let voices = window.speechSynthesis.getVoices();
  if (voices.length === 0) {
    console.log('[TTS] Voices not loaded, using default');
  } else {
    const preferredVoice = voices.find(v => 
      v.name.includes('Samantha') || 
      v.name.includes('Daniel') || 
      v.name.includes('Google UK English Male') ||
      v.name.includes('Microsoft David') ||
      v.name.includes('Alex') ||
      v.lang === 'en-US'
    );
    if (preferredVoice) {
      utterance.voice = preferredVoice;
      console.log('[TTS] Using voice:', preferredVoice.name);
    }
  }
  
  utterance.onstart = () => {
    console.log('[TTS] Browser speech started');
    onStart?.();
  };
  
  utterance.onend = () => {
    console.log('[TTS] Browser speech ended');
    onAudioLevel?.(0);
    onEnd?.();
  };
  
  utterance.onerror = (e) => {
    console.error('[TTS] Browser speech error:', e);
    onAudioLevel?.(0);
    onEnd?.();
  };
  
  window.speechSynthesis.speak(utterance);
};

// Connection Lines Component - FUNNEL Design with Blue Trunk
const ConnectionLines: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);
  const particlesRef = useRef<{t: number; speed: number; lineIndex: number}[]>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    particlesRef.current = [];
    for (let lineIdx = 0; lineIdx < 4; lineIdx++) {
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
      ];

      const cardHeight = 56;
      const cardGap = 8;
      const totalCardSpace = (cardHeight * 4) + (cardGap * 3);
      const startY = (height - totalCardSpace) / 2;
      
      const cardYPositions = [
        startY + cardHeight * 0.5,
        startY + cardHeight * 1.5 + cardGap,
        startY + cardHeight * 2.5 + cardGap * 2,
        startY + cardHeight * 3.5 + cardGap * 3,
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

        if (i === 1) {
          const outT = 1 - t;
          const oneMinusT = 1 - outT;
          const cp1x = cardX + (funnelX - cardX) * 0.5;
          const cp1y = startYPos;
          const cp2x = funnelX - (funnelX - cardX) * 0.3;
          const cp2y = funnelY;
          
          const x = oneMinusT * oneMinusT * oneMinusT * cardX +
              3 * oneMinusT * oneMinusT * outT * cp1x +
              3 * oneMinusT * outT * outT * cp2x +
              outT * outT * outT * funnelX;
          const y = oneMinusT * oneMinusT * oneMinusT * startYPos +
              3 * oneMinusT * oneMinusT * outT * cp1y +
              3 * oneMinusT * outT * outT * cp2y +
              outT * outT * outT * funnelY;

          const colors = ['#00d8ee', '#ef4444', '#3b82f6', '#ffffff'];
          ctx.fillStyle = colors[i];
          ctx.shadowColor = colors[i];
          ctx.shadowBlur = 8;
          ctx.beginPath();
          ctx.arc(x, y, 3, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
          return;
        }

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

        const colors = ['#00d8ee', '#ef4444', '#3b82f6', '#ffffff'];
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

interface Particle {
  x: number;
  y: number;
  z: number;
  baseX: number;
  baseY: number;
  baseZ: number;
  size: number;
  opacity: number;
}

// 3D Dense Particle Sphere Component
const ParticleSphere: React.FC<{ state: OrbState; audioLevel?: number }> = ({ state, audioLevel = 0 }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);
  const rotationRef = useRef(0);
  const particlesRef = useRef<Particle[]>([]);
  const pulseRef = useRef(0);
  const vortexRef = useRef(0);

  useEffect(() => {
    const particles: Particle[] = [];
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

    const noise = (x: number, y: number, z: number, t: number) => {
      return Math.sin(x * 0.1 + t) * Math.cos(y * 0.1 + t * 0.7) * Math.sin(z * 0.1 + t * 0.5);
    };

    const animate = () => {
      const rect = canvas.getBoundingClientRect();
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;

      ctx.clearRect(0, 0, rect.width, rect.height);

      rotationRef.current += state === 'idle' ? 0.0015 : 0.006;
      pulseRef.current += 0.05;
      vortexRef.current += state !== 'idle' ? 0.02 : 0.005;

      const baseAudioLevel = Math.max(0, Math.min(1, audioLevel || 0));
      const boostedAudio = Math.pow(baseAudioLevel, 0.5) * 1.5;

      const distortionAmount = state === 'idle' ? boostedAudio * 30 + 2 : 
                               state === 'listening' ? 10 + boostedAudio * 40 : 
                               state === 'processing' ? 20 : 
                               state === 'speaking' ? 15 + boostedAudio * 25 : 10;
      const vortexStrength = state === 'listening' ? 0.3 + boostedAudio * 1.0 : 
                             state === 'processing' ? 0.5 : 
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
        
        let color: string;
        let glowColor: string;
        
        if (state === 'listening') {
          const intensity = 0.6 + 0.4 * Math.sin(pulseRef.current * 0.4 + index * 0.01);
          const r = 0, g = 200 + intensity * 55, b = 238;
          color = `rgba(${r}, ${g}, ${b}, ${p.currentOpacity * edgeFade})`;
          glowColor = `rgba(0, 216, 238, ${p.currentOpacity * 0.3})`;
        } else if (state === 'processing') {
          const intensity = 0.7 + 0.3 * Math.sin(pulseRef.current * 0.6 + index * 0.02);
          const v = Math.floor(200 + intensity * 55);
          color = `rgba(${v}, ${v}, 255, ${p.currentOpacity * edgeFade})`;
          glowColor = `rgba(255, 255, 255, ${p.currentOpacity * 0.4})`;
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
      } else if (state === 'processing') {
        const pulse = 0.5 + 0.3 * Math.sin(time * 1.2);
        ringGradient.addColorStop(0, 'rgba(0, 245, 212, 0)');
        ringGradient.addColorStop(0.7, `rgba(0, 245, 212, ${pulse * 0.7})`);
        ringGradient.addColorStop(0.9, `rgba(255, 255, 255, ${pulse})`);
        ringGradient.addColorStop(1, 'rgba(0, 245, 212, 0)');
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
        const intensity = state === 'processing' ? 0.15 : 0.1;
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
  const [isListening, setIsListening] = useState(false);
  const [aiActive, setAiActive] = useState(false);
  const [initializing, setInitializing] = useState(false);
  const [orbState, setOrbState] = useState<OrbState>('idle');
  const [messages, setMessages] = useState<Array<{type: 'user' | 'ai', text: string}>>([]);
  const [currentTranscript, setCurrentTranscript] = useState('');
  const [audioLevel, setAudioLevel] = useState(0);
  
  // Browser Environment State
  const [browserEnvs, setBrowserEnvs] = useState<Array<{
    id: string;
    name: string;
    status: string;
    url: string | null;
    streaming: boolean;
    screenshot: string | null;
  }>>([]);
  const [activeEnvId, setActiveEnvId] = useState<string | null>(null);
  const [showEnvCreator, setShowEnvCreator] = useState(false);
  const [newEnvName, setNewEnvName] = useState('');
  
  const recognitionRef = useRef<any>(null);
  const transcriptRef = useRef<string>('');
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const microphoneRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const animationFrameRef = useRef<number>(0);
  const isProcessingRef = useRef<boolean>(false);
  const subscriptionRef = useRef<(() => void) | null>(null);
  const processedMessagesRef = useRef<Set<string>>(new Set());
  const lastResponseRef = useRef<string>('');
  const lastResponseTimeRef = useRef<number>(0);
  const aiInitializedRef = useRef<boolean>(false);
  const messageHashSetRef = useRef<Set<string>>(new Set());

  const startListening = () => {
    if (!recognitionRef.current) {
      console.log('[Voice] Recognition not initialized');
      return;
    }
    if (isListening) {
      console.log('[Voice] Already listening');
      return;
    }
    if (!aiActive) {
      console.log('[Voice] AI not active');
      return;
    }
    
    try {
      recognitionRef.current.start();
      console.log('[Voice] Started listening');
    } catch (e: any) {
      if (e.name === 'InvalidStateError') {
        console.log('[Voice] Already running, restarting...');
        try {
          recognitionRef.current.stop();
          setTimeout(() => startListening(), 100);
        } catch (e2) {}
      } else {
        console.error('[Voice] Start error:', e);
      }
    }
  };

  const handleInitialize = () => {
    if (aiActive) {
      setAiActive(false);
      setOrbState('idle');
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      stopAudioVisualization();
    } else {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.getVoices();
        console.log('[TTS] Voices loaded:', window.speechSynthesis.getVoices().length);
      }
      
      setInitializing(true);
      setOrbState('processing');
      
      setTimeout(() => {
        setInitializing(false);
        setAiActive(true);
        setOrbState('idle');
        
        // J.A.R.V.I.S speaks first to greet you
        const greeting = "Hello! I am J.A.R.V.I.S., your intelligent AI assistant. I am now fully active and ready to help you. Feel free to speak to me at any time. How may I assist you today?";
        
        setOrbState('speaking');
        speakText(greeting, 
          () => setOrbState('speaking'),
          () => {
            setOrbState('idle');
            // Start listening after speaking
            setTimeout(() => startListening(), 500);
          },
          (level) => setAudioLevel(level)
        );
      }, 2000);
    }
  };

  // Keep listening after AI finishes speaking
  const continueConversation = () => {
    if (aiActive) {
      setTimeout(() => startListening(), 300);
    }
  };

  useEffect(() => {
    // Only connect once when component mounts
    if (aiInitializedRef.current) {
      console.log('[AI] Already initialized, skipping');
      return;
    }
    aiInitializedRef.current = true;
    
    console.log('[AI] Setting up message handler');
    
    const handleAIMessage = (message: any) => {
      console.log('[AI] Message received:', message.type, '- payload keys:', Object.keys(message.payload || {}));
      
      if (message.type === 'response' && message.payload?.response) {
        const aiText = message.payload.response;
        
        // Create a simple hash of the response text
        const responseHash = aiText.substring(0, 30).trim();
        
        // Check if we've seen this exact response recently
        if (messageHashSetRef.current.has(responseHash)) {
          console.log('[AI] DUPLICATE MESSAGE DETECTED - ignoring:', responseHash);
          return;
        }
        
        // Add to set and clean old entries
        messageHashSetRef.current.add(responseHash);
        setTimeout(() => {
          messageHashSetRef.current.delete(responseHash);
        }, 5000);
        
        // Check if already processing
        if (isProcessingRef.current) {
          console.log('[AI] Already processing, ignoring duplicate');
          return;
        }
        
        isProcessingRef.current = true;
        
        console.log('[AI] Processing NEW response:', aiText.substring(0, 50));
        
        setMessages(prev => [...prev, { type: 'ai', text: aiText }]);
        setOrbState('speaking');
        
        speakText(aiText, 
          () => setOrbState('speaking'),
          () => {
            setOrbState('idle');
            setIsListening(false);
            setAudioLevel(0);
            isProcessingRef.current = false;
            // Automatically start listening again
            if (aiActive) {
              setTimeout(() => startListening(), 300);
            }
          },
          (level) => setAudioLevel(level)
        );
      } else if (message.type === 'agent_update') {
        const status = message.payload?.status;
        if (status === 'working') {
          setOrbState('processing');
        }
      }
      // Browser Environment Handlers
      else if (message.type === 'browser_environment_created') {
        const { env_id, name } = message.payload;
        setBrowserEnvs(prev => [...prev, {
          id: env_id,
          name: name || `Environment-${env_id}`,
          status: 'active',
          url: null,
          streaming: false,
          screenshot: null
        }]);
        setActiveEnvId(env_id);
        console.log('[Browser] Environment created:', env_id);
      }
      else if (message.type === 'browser_environments_list') {
        const environments = message.payload.environments || [];
        setBrowserEnvs(environments.map((env: any) => ({
          id: env.id,
          name: env.name,
          status: env.status,
          url: env.url,
          streaming: env.streaming,
          screenshot: null
        })));
      }
      else if (message.type === 'browser_environment_closed') {
        const { env_id } = message.payload;
        setBrowserEnvs(prev => prev.filter(env => env.id !== env_id));
        if (activeEnvId === env_id) {
          setActiveEnvId(null);
        }
        console.log('[Browser] Environment closed:', env_id);
      }
      else if (message.type === 'browser_action_result') {
        const { env_id, action, result } = message.payload;
        console.log('[Browser] Action result:', action, result);
        // Update environment URL if navigate was successful
        if (action === 'navigate' && result.success) {
          setBrowserEnvs(prev => prev.map(env => 
            env.id === env_id ? { ...env, url: result.output?.url || env.url } : env
          ));
        }
      }
      else if (message.type === 'environment_screenshot') {
        const { env_id, screenshot, url, timestamp } = message.payload;
        setBrowserEnvs(prev => prev.map(env => 
          env.id === env_id 
            ? { ...env, screenshot: `data:image/jpeg;base64,${screenshot}`, url: url || env.url }
            : env
        ));
      }
      else if (message.type === 'screenshot_stream_started') {
        const { env_id } = message.payload;
        setBrowserEnvs(prev => prev.map(env => 
          env.id === env_id ? { ...env, streaming: true } : env
        ));
      }
      else if (message.type === 'screenshot_stream_stopped') {
        const { env_id } = message.payload;
        setBrowserEnvs(prev => prev.map(env => 
          env.id === env_id ? { ...env, streaming: false } : env
        ));
      }
    };

    // Check if running in Electron - ONLY use Electron API, never WebSocket
    const isElectron = typeof window !== 'undefined' && window.electronAPI?.onAIMessage;
    
    if (isElectron && window.electronAPI?.onAIMessage) {
      console.log('[AI] Using Electron API (no WebSocket needed)');
      const unsubscribe = window.electronAPI.onAIMessage(handleAIMessage);
      subscriptionRef.current = unsubscribe;
      
      return () => {
        unsubscribe?.();
        subscriptionRef.current = null;
      };
    } else {
      // Only use WebSocket for browser (NOT Electron)
      console.log('[AI] Using WebSocket for browser only');
      connectWebSocket(handleAIMessage);
    }
  }, []); // Empty dependency - only run once

  // Send command function
  const sendCommand = (command: string) => {
    if (window.electronAPI?.sendCommand) {
      window.electronAPI.sendCommand(command);
    } else {
      sendViaWebSocket('user_command', { command, context: {} });
    }
  };

  // Browser Environment Control Functions
  const createBrowserEnvironment = (name?: string) => {
    sendViaWebSocket('create_browser_environment', {
      name: name || `Browser-${browserEnvs.length + 1}`,
      headless: false,
      viewport: { width: 1920, height: 1080 }
    });
    setShowEnvCreator(false);
    setNewEnvName('');
  };

  const closeBrowserEnvironment = (envId: string) => {
    sendViaWebSocket('close_browser_environment', { env_id: envId });
  };

  const executeInEnvironment = (envId: string, action: string, params: any) => {
    sendViaWebSocket('execute_in_environment', {
      env_id: envId,
      action,
      params
    });
  };

  const startScreenshotStream = (envId: string) => {
    sendViaWebSocket('start_screenshot_stream', {
      env_id: envId,
      interval: 1.0
    });
  };

  const stopScreenshotStream = (envId: string) => {
    sendViaWebSocket('stop_screenshot_stream', { env_id: envId });
  };

  const openYouTubeInEnvironment = (envId: string, query?: string) => {
    if (query) {
      executeInEnvironment(envId, 'play_youtube_video', {
        query,
        enable_captions: true
      });
    } else {
      executeInEnvironment(envId, 'navigate', { url: 'https://youtube.com' });
    }
    startScreenshotStream(envId);
  };

  const sendWhatsAppMessage = (envId: string, contact: string, message: string) => {
    executeInEnvironment(envId, 'send_whatsapp_message', { contact, message });
    startScreenshotStream(envId);
  };

  const startAudioVisualization = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      audioContextRef.current = new AudioContext();
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 512;
      analyserRef.current.smoothingTimeConstant = 0.2;
      microphoneRef.current = audioContextRef.current.createMediaStreamSource(stream);
      microphoneRef.current.connect(analyserRef.current);
      
      const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
      
      const updateAudioLevel = () => {
        if (!analyserRef.current || !isListening) return;
        analyserRef.current.getByteFrequencyData(dataArray);
        
        let max = 0;
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          if (dataArray[i] > max) max = dataArray[i];
          sum += dataArray[i];
        }
        
        const average = sum / dataArray.length;
        
        // Boost significantly for visible orb reaction
        const normalized = Math.min(1, (average / 255) * 4);
        const peakBoost = Math.min(1, (max / 255) * 3);
        const combined = Math.max(normalized, peakBoost * 0.7);
        
        setAudioLevel(combined);
        
        if (isListening) {
          animationFrameRef.current = requestAnimationFrame(updateAudioLevel);
        }
      };
      
      updateAudioLevel();
    } catch (err) {
      console.error('Microphone access error:', err);
      // Fallback: simulate audio level for testing
      setAudioLevel(0.3);
    }
  };
  
  const stopAudioVisualization = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    if (microphoneRef.current) {
      microphoneRef.current.disconnect();
      microphoneRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    setAudioLevel(0);
  };

  useEffect(() => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = true;
      recognitionRef.current.lang = 'en-US';
      
      recognitionRef.current.onstart = () => {
        console.log('[Voice] Listening started');
        setIsListening(true);
        setOrbState('listening');
        setCurrentTranscript('');
        startAudioVisualization();
      };
      
      recognitionRef.current.onresult = (event: any) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          if (event.results[i].isFinal) {
            transcript += event.results[i][0].transcript;
          }
        }
        if (transcript) {
          console.log('[Voice] Final transcript:', transcript);
          transcriptRef.current = transcript;
          setCurrentTranscript(transcript);
          
          // Send the final transcript
          if (!isProcessingRef.current) {
            isProcessingRef.current = true;
            console.log('[Voice] Sending to AI:', transcript);
            setMessages(prev => [...prev, { type: 'user', text: transcript }]);
            setOrbState('processing');
            
            // Stop listening while processing
            try {
              recognitionRef.current?.stop();
            } catch (e) {}
            stopAudioVisualization();
            setIsListening(false);
            
            sendCommand(transcript);
          }
        }
      };
      
      recognitionRef.current.onend = () => {
        console.log('[Voice] Listening ended');
        
        if (aiActive) {
          // Restart listening if AI is still active
          setTimeout(() => startListening(), 200);
        }
      };
      
      recognitionRef.current.onerror = (e: any) => {
        console.error('[Voice] Error:', e.error);
        setIsListening(false);
        
        // Always try to restart listening on any error
        if (aiActive) {
          console.log('[Voice] Restarting listening in 1 second...');
          setTimeout(() => startListening(), 1000);
        }
      };
    } else {
      console.log('[Voice] Speech recognition not supported');
    }
  }, []);

  const handleVoiceToggle = () => {
    if (!recognitionRef.current) {
      alert('Speech recognition not supported in this browser');
      return;
    }
    
    if (!isListening) {
      try {
        recognitionRef.current.start();
      } catch (e) {
        console.error('Speech recognition error:', e);
      }
    } else {
      recognitionRef.current.stop();
      setIsListening(false);
      setOrbState('idle');
    }
  };

  const getStatusText = () => {
    if (initializing) return 'INITIALIZING...';
    if (orbState === 'listening') return currentTranscript || 'LISTENING...';
    if (orbState === 'processing') return 'PROCESSING...';
    if (orbState === 'speaking') return 'J.R.R.V.I.S SPEAKING';
    if (aiActive) return 'SYSTEM ACTIVE';
    return 'STANDBY MODE';
  };

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex-1 flex min-h-0">
        {/* Left Sidebar */}
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

        {/* Center Cards */}
        <div className="flex flex-col justify-center relative z-20 mr-0">
          <div className="flex flex-col gap-2">
            <button className="relative px-4 py-3 rounded-lg flex items-center gap-3 transition-all duration-300 glass-card border border-cyan-400/30 hover:border-cyan-400/50">
              <div className="w-8 h-8 rounded-lg bg-cyan-400/10 border border-cyan-400/30 flex items-center justify-center">
                <Paperclip size={16} className="text-cyan-400" />
              </div>
              <div className="flex flex-col items-start">
                <span className="text-[10px] font-bold tracking-wider text-stonic-text font-mono-tech">ADD FILES</span>
                <span className="text-[7px] text-cyan-400/80 tracking-wider font-mono-tech">MULTIMODAL INPUT</span>
              </div>
            </button>

            <button className="relative px-4 py-3 rounded-lg flex items-center gap-3 transition-all duration-300 glass-card border border-red-400/40 shadow-[0_0_15px_rgba(239,68,68,0.15)] hover:shadow-[0_0_20px_rgba(239,68,68,0.25)]">
              <div className="w-8 h-8 rounded-lg bg-red-400/10 border border-red-400/40 flex items-center justify-center">
                <Brain size={16} className="text-red-400" />
              </div>
              <div className="flex flex-col items-start">
                <span className="text-[10px] font-bold tracking-wider text-stonic-text font-mono-tech">MEMORY</span>
                <span className="text-[7px] text-red-400/80 tracking-wider font-mono-tech">SYSTEM ACCESS</span>
              </div>
            </button>

            <button className="relative px-4 py-3 rounded-lg flex items-center gap-3 transition-all duration-300 glass-card border border-blue-400/30 hover:border-blue-400/50">
              <div className="w-8 h-8 rounded-lg bg-blue-400/10 border border-blue-400/30 flex items-center justify-center">
                <Clock size={16} className="text-blue-400" />
              </div>
              <div className="flex flex-col items-start">
                <span className="text-[10px] font-bold tracking-wider text-stonic-text font-mono-tech">HISTORY</span>
                <span className="text-[7px] text-blue-400/80 tracking-wider font-mono-tech">SYSTEM ACCESS</span>
              </div>
            </button>

            <button className="relative px-4 py-3 rounded-lg flex items-center gap-3 transition-all duration-300 glass-card border border-slate-400/30 hover:border-slate-400/50">
              <div className="w-8 h-8 rounded-lg bg-slate-400/10 border border-slate-400/30 flex items-center justify-center">
                <User size={16} className="text-slate-300" />
              </div>
              <div className="flex flex-col items-start">
                <span className="text-[10px] font-bold tracking-wider text-stonic-text font-mono-tech">USER</span>
                <span className="text-[7px] text-slate-400/80 tracking-wider font-mono-tech">SYSTEM ACCESS</span>
              </div>
            </button>
          </div>
        </div>

        {/* Connection Lines */}
        <div className="w-[280px] relative -ml-2">
          <ConnectionLines />
        </div>

        {/* Right Panel */}
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

      {/* Browser Environment Manager */}
      <div className="mt-4 bg-stonic-card border border-stonic-b1 rounded-xl p-3 relative overflow-hidden h-[240px]">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-[8px] font-bold text-stonic-primary tracking-wider font-mono-tech">BROWSER ENVIRONMENTS</span>
            <span className="text-[7px] text-stonic-textDim px-1.5 py-0.5 rounded bg-stonic-surface/50 font-mono-tech">
              {browserEnvs.length} ACTIVE
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <button 
              onClick={() => setShowEnvCreator(!showEnvCreator)}
              className="px-2 py-1 rounded-md bg-stonic-primary/20 border border-stonic-primary/40 text-[8px] text-stonic-primary hover:bg-stonic-primary/30 transition-colors font-mono-tech flex items-center gap-1"
            >
              <Monitor size={10} />
              NEW ENV
            </button>
          </div>
        </div>

        {/* Environment Creator */}
        {showEnvCreator && (
          <div className="mb-3 p-2 bg-stonic-surface/50 rounded-lg border border-stonic-b1/50">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newEnvName}
                onChange={(e) => setNewEnvName(e.target.value)}
                placeholder="Environment name..."
                className="flex-1 px-2 py-1.5 rounded bg-stonic-card border border-stonic-b1 text-[10px] text-stonic-text placeholder:text-stonic-textDim/50 focus:outline-none focus:border-stonic-primary font-mono-tech"
                onKeyPress={(e) => e.key === 'Enter' && createBrowserEnvironment(newEnvName)}
              />
              <button
                onClick={() => createBrowserEnvironment(newEnvName)}
                className="px-3 py-1.5 rounded bg-stonic-primary/20 border border-stonic-primary/40 text-[9px] text-stonic-primary hover:bg-stonic-primary/30 font-mono-tech"
              >
                CREATE
              </button>
              <button
                onClick={() => setShowEnvCreator(false)}
                className="p-1.5 rounded hover:bg-stonic-surface text-stonic-textDim"
              >
                <X size={12} />
              </button>
            </div>
          </div>
        )}

        {/* Environment List */}
        {browserEnvs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-[160px]">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-stonic-surface to-stonic-surfaceHover border border-stonic-b1/50 flex items-center justify-center shadow-[0_0_15px_rgba(0,212,255,0.1)] mb-3">
              <Globe size={20} className="text-stonic-textDim" />
            </div>
            <h3 className="text-xs font-semibold text-stonic-text mb-1 tracking-wide font-orbitron">
              BROWSER ENVIRONMENTS
            </h3>
            <p className="text-[9px] text-stonic-textDim text-center max-w-xs leading-relaxed font-mono-tech mb-3">
              Create isolated browser instances to automate YouTube, WhatsApp, and more.
            </p>
            <button
              onClick={() => setShowEnvCreator(true)}
              className="px-4 py-2 rounded-lg bg-stonic-primary/20 border border-stonic-primary/40 text-[10px] text-stonic-primary hover:bg-stonic-primary/30 transition-all font-mono-tech flex items-center gap-2"
            >
              <Monitor size={12} />
              CREATE ENVIRONMENT
            </button>
          </div>
        ) : (
          <div className="flex gap-3 overflow-x-auto h-[160px] pb-2 scrollbar-hide">
            {browserEnvs.map((env) => (
              <div
                key={env.id}
                onClick={() => setActiveEnvId(env.id === activeEnvId ? null : env.id)}
                className={`flex-shrink-0 w-[280px] bg-stonic-surface/50 rounded-lg border overflow-hidden transition-all ${
                  activeEnvId === env.id 
                    ? 'border-stonic-primary shadow-[0_0_10px_rgba(0,216,238,0.2)]' 
                    : 'border-stonic-b1/50 hover:border-stonic-b1'
                }`}
              >
                {/* Environment Header */}
                <div className="flex items-center justify-between px-2 py-1.5 bg-stonic-card border-b border-stonic-b1/50">
                  <div className="flex items-center gap-1.5">
                    <div className={`w-2 h-2 rounded-full ${env.streaming ? 'bg-green-500 animate-pulse' : 'bg-stonic-textDim'}`} />
                    <span className="text-[9px] font-medium text-stonic-text font-mono-tech truncate max-w-[120px]">
                      {env.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    {env.streaming ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          stopScreenshotStream(env.id);
                        }}
                        className="p-1 rounded hover:bg-stonic-surface text-stonic-textDim"
                        title="Stop stream"
                      >
                        <Square size={10} />
                      </button>
                    ) : (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          startScreenshotStream(env.id);
                        }}
                        className="p-1 rounded hover:bg-stonic-surface text-stonic-primary"
                        title="Start stream"
                      >
                        <Play size={10} />
                      </button>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        closeBrowserEnvironment(env.id);
                      }}
                      className="p-1 rounded hover:bg-red-500/20 text-stonic-textDim hover:text-red-400"
                      title="Close environment"
                    >
                      <X size={10} />
                    </button>
                  </div>
                </div>

                {/* Screenshot or Preview */}
                <div className="h-[100px] bg-stonic-bg relative">
                  {env.screenshot ? (
                    <img
                      src={env.screenshot}
                      alt={`${env.name} preview`}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full">
                      <Globe size={24} className="text-stonic-textDim/50 mb-1" />
                      <span className="text-[8px] text-stonic-textDim font-mono-tech">No preview</span>
                    </div>
                  )}
                  
                  {/* URL Overlay */}
                  {env.url && (
                    <div className="absolute bottom-0 left-0 right-0 px-2 py-1 bg-gradient-to-t from-black/70 to-transparent">
                      <span className="text-[7px] text-stonic-textDim font-mono-tech truncate block">
                        {env.url}
                      </span>
                    </div>
                  )}
                </div>

                {/* Quick Actions */}
                {activeEnvId === env.id && (
                  <div className="px-2 py-2 border-t border-stonic-b1/50 bg-stonic-card/50">
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => openYouTubeInEnvironment(env.id)}
                        className="flex-1 px-2 py-1.5 rounded bg-red-500/20 border border-red-500/40 text-[8px] text-red-400 hover:bg-red-500/30 transition-colors font-mono-tech flex items-center justify-center gap-1"
                      >
                        <Play size={8} />
                        YOUTUBE
                      </button>
                      <button
                        onClick={() => executeInEnvironment(env.id, 'open_whatsapp_web', {})}
                        className="flex-1 px-2 py-1.5 rounded bg-green-500/20 border border-green-500/40 text-[8px] text-green-400 hover:bg-green-500/30 transition-colors font-mono-tech flex items-center justify-center gap-1"
                      >
                        <MessageSquare size={8} />
                        WHATSAPP
                      </button>
                      <button
                        onClick={() => executeInEnvironment(env.id, 'navigate', { url: 'https://google.com' })}
                        className="flex-1 px-2 py-1.5 rounded bg-blue-500/20 border border-blue-500/40 text-[8px] text-blue-400 hover:bg-blue-500/30 transition-colors font-mono-tech flex items-center justify-center gap-1"
                      >
                        <Globe size={8} />
                        GOOGLE
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
