/**
 * PairingQR — QR code based device pairing component.
 *
 * Tier 2C.6
 *
 * Displays a QR code that a mobile device can scan to pair with this
 * JARVIS instance. Shows paired devices and allows revoking access.
 */

import { useState, useEffect, useCallback } from 'react';

interface PairedDevice {
  id: string;
  name: string;
  type: string;
  platform: string;
  trustStatus: string;
  pairingState: string;
  capabilities: string[];
  lastSeen: string;
  isSelf: boolean;
}

interface PairingResponse {
  token: string;
  qrCode: string;
  expiresAt: string;
  deviceId: string;
}

export function PairingQR({ onClose }: { onClose?: () => void }) {
  const [pairing, setPairing] = useState<PairingResponse | null>(null);
  const [devices, setDevices] = useState<PairedDevice[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deviceName, setDeviceName] = useState('My Phone');
  const [timeLeft, setTimeLeft] = useState<number>(0);

  // Generate a pairing token
  const generateToken = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/pairing/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceName,
          deviceType: 'mobile',
          platform: 'unknown',
        }),
      });
      if (!res.ok) throw new Error('Failed to generate pairing token');
      const data = await res.json();
      setPairing(data);
      setTimeLeft(300); // 5 minutes
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [deviceName]);

  // Fetch paired devices
  const fetchDevices = useCallback(async () => {
    try {
      const res = await fetch('/api/pairing/devices');
      if (!res.ok) return;
      const data = await res.json();
      setDevices(data.devices || []);
    } catch {
      // Ignore — might not be connected to the API server
    }
  }, []);

  // Revoke a device
  const revokeDevice = async (deviceId: string) => {
    try {
      await fetch('/api/pairing/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId }),
      });
      await fetchDevices();
    } catch (err: any) {
      setError(err.message);
    }
  };

  // Countdown timer
  useEffect(() => {
    if (!pairing || timeLeft <= 0) return;
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          setPairing(null);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [pairing, timeLeft]);

  // Fetch devices on mount
  useEffect(() => {
    fetchDevices();
  }, [fetchDevices]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div style={{
      padding: '24px',
      maxWidth: '480px',
      margin: '0 auto',
      color: '#e0e0e0',
      fontFamily: 'Inter, sans-serif',
    }}>
      <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '16px' }}>
        Device Pairing
      </h2>

      {error && (
        <div style={{
          padding: '8px 12px',
          background: 'rgba(239, 68, 68, 0.15)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          borderRadius: '6px',
          marginBottom: '16px',
          fontSize: '13px',
        }}>
          {error}
        </div>
      )}

      {/* QR Generation Section */}
      <div style={{ marginBottom: '24px' }}>
        <label style={{ display: 'block', fontSize: '13px', marginBottom: '6px', color: '#888' }}>
          Device Name
        </label>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
          <input
            type="text"
            value={deviceName}
            onChange={e => setDeviceName(e.target.value)}
            style={{
              flex: 1,
              padding: '8px 12px',
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '6px',
              color: '#e0e0e0',
              fontSize: '13px',
            }}
          />
          <button
            onClick={generateToken}
            disabled={loading || !deviceName}
            style={{
              padding: '8px 16px',
              background: 'rgba(99, 102, 241, 0.2)',
              border: '1px solid rgba(99, 102, 241, 0.4)',
              borderRadius: '6px',
              color: '#a5b4fc',
              fontSize: '13px',
              cursor: loading ? 'wait' : 'pointer',
            }}
          >
            {loading ? 'Generating...' : 'Generate QR'}
          </button>
        </div>

        {pairing && timeLeft > 0 && (
          <div style={{
            padding: '16px',
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '8px',
            textAlign: 'center',
          }}>
            <div style={{
              width: '200px',
              height: '200px',
              margin: '0 auto 12px',
              background: '#fff',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '12px',
            }}>
              {/* QR code placeholder — in production, render the actual QR */}
              <div style={{
                width: '100%',
                height: '100%',
                background: `url(${pairing.qrCode}) center/contain no-repeat`,
              }} />
            </div>
            <div style={{ fontSize: '13px', color: '#888', marginBottom: '4px' }}>
              Scan with your mobile device
            </div>
            <div style={{ fontSize: '12px', color: timeLeft < 60 ? '#ef4444' : '#666' }}>
              Expires in {formatTime(timeLeft)}
            </div>
          </div>
        )}
      </div>

      {/* Paired Devices List */}
      <div>
        <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px', color: '#aaa' }}>
          Paired Devices ({devices.length})
        </h3>
        {devices.length === 0 ? (
          <div style={{ fontSize: '13px', color: '#666', padding: '12px' }}>
            No devices paired yet.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {devices.map(device => (
              <div
                key={device.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 12px',
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  borderRadius: '6px',
                }}
              >
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 500 }}>
                    {device.name}
                    {device.isSelf && (
                      <span style={{ marginLeft: '8px', fontSize: '11px', color: '#666' }}>
                        (this device)
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '11px', color: '#666', marginTop: '2px' }}>
                    {device.type} · {device.platform} · {device.trustStatus}
                  </div>
                </div>
                {!device.isSelf && device.pairingState === 'paired' && (
                  <button
                    onClick={() => revokeDevice(device.id)}
                    style={{
                      padding: '4px 10px',
                      background: 'rgba(239, 68, 68, 0.1)',
                      border: '1px solid rgba(239, 68, 68, 0.2)',
                      borderRadius: '4px',
                      color: '#ef4444',
                      fontSize: '11px',
                      cursor: 'pointer',
                    }}
                  >
                    Revoke
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {onClose && (
        <button
          onClick={onClose}
          style={{
            marginTop: '24px',
            width: '100%',
            padding: '10px',
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '6px',
            color: '#888',
            fontSize: '13px',
            cursor: 'pointer',
          }}
        >
          Close
        </button>
      )}
    </div>
  );
}
