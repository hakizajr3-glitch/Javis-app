/**
 * Pairing API route — QR code based device pairing.
 *
 * Tier 2C.6
 *
 * Flow:
 * 1. Desktop generates a pairing token via POST /api/pairing/token
 * 2. Token is encoded as a QR code (returned as data URL)
 * 3. Mobile app scans the QR code and sends POST /api/pairing/verify
 * 4. Server verifies the token and pairs the device
 */

import { Router, Request, Response } from 'express';
import { deviceFabric } from '../../harness/deviceFabric.js';

const router = Router();

// ─── QR Code generation ────────────────────────────────────────────────────

/**
 * Generate a simple QR code data URL from text.
 * This is a minimal implementation — in production, use the `qrcode`
 * npm package for proper QR encoding.
 */
function generateQRDataURL(text: string): string {
  // For now, encode the pairing data as a data URL that the mobile app
  // can parse. A full QR code library would be used in production.
  const payload = JSON.stringify({
    type: 'jarvis-pairing',
    token: text,
    timestamp: Date.now(),
  });
  const encoded = Buffer.from(payload).toString('base64');
  return `data:application/json;base64,${encoded}`;
}

// ─── Routes ────────────────────────────────────────────────────────────────

/**
 * POST /api/pairing/token
 * Generate a pairing token and QR code for a new device.
 *
 * Body: { deviceName: string, deviceType?: string }
 * Returns: { token, qrCode, expiresAt, deviceId }
 */
router.post('/token', async (req: Request, res: Response) => {
  try {
    const { deviceName, deviceType, platform } = req.body;

    if (!deviceName) {
      return res.status(400).json({ error: 'deviceName is required' });
    }

    // Register the device as unknown/unpaired
    const deviceId = deviceFabric.registerDevice({
      name: deviceName,
      type: deviceType || 'mobile',
      platform: platform || 'unknown',
      owner: 'pending',
      capabilities: [],
      connectionMethods: ['cloud'],
      trustStatus: 'unverified',
      pairingState: 'pairing',
      metadata: { requestedAt: new Date().toISOString() },
    });

    // Create a short-lived pairing token (5 minute TTL)
    const pairingToken = deviceFabric.createPairingToken(deviceId, 5);
    if (!pairingToken) {
      return res.status(500).json({ error: 'Failed to create pairing token' });
    }

    // Generate QR code
    const qrCode = generateQRDataURL(pairingToken.token);

    res.json({
      token: pairingToken.token,
      qrCode,
      expiresAt: pairingToken.expiresAt,
      deviceId,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/pairing/verify
 * Verify a pairing token (called by the mobile app after scanning the QR).
 *
 * Body: { token: string, deviceInfo: { name, platform, capabilities } }
 * Returns: { success, deviceId, message }
 */
router.post('/verify', async (req: Request, res: Response) => {
  try {
    const { token, deviceInfo } = req.body;

    if (!token) {
      return res.status(400).json({ error: 'token is required' });
    }

    const result = deviceFabric.verifyPairingToken(token);
    if (!result.valid) {
      return res.status(400).json({
        success: false,
        message: result.reason || 'Invalid token',
      });
    }

    // Update device info from the mobile app
    if (deviceInfo && result.deviceId) {
      const device = deviceFabric.getDevice(result.deviceId);
      if (device) {
        // Update device metadata with info from the paired device
        device.name = deviceInfo.name || device.name;
        device.platform = deviceInfo.platform || device.platform;
        device.capabilities = deviceInfo.capabilities || device.capabilities;
        device.owner = deviceInfo.owner || 'mobile-user';
        device.lastSeen = new Date();
      }
    }

    res.json({
      success: true,
      deviceId: result.deviceId,
      message: 'Device paired successfully',
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/pairing/revoke
 * Revoke a device's pairing.
 *
 * Body: { deviceId: string }
 */
router.post('/revoke', async (req: Request, res: Response) => {
  try {
    const { deviceId } = req.body;
    if (!deviceId) {
      return res.status(400).json({ error: 'deviceId is required' });
    }

    const revoked = deviceFabric.revokePairing(deviceId);
    if (!revoked) {
      return res.status(404).json({ error: 'Device not found' });
    }

    res.json({ success: true, message: 'Device pairing revoked' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/pairing/devices
 * List all paired/trusted devices.
 */
router.get('/devices', async (_req: Request, res: Response) => {
  try {
    const devices = deviceFabric.listDevices();
    res.json({
      devices: devices.map(d => ({
        id: d.id,
        name: d.name,
        type: d.type,
        platform: d.platform,
        trustStatus: d.trustStatus,
        pairingState: d.pairingState,
        capabilities: d.capabilities.map(c => c.name),
        lastSeen: d.lastSeen,
        isSelf: d.metadata?.isSelf || false,
      })),
      stats: deviceFabric.getStats(),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/pairing/status
 * Get the device fabric status.
 */
router.get('/status', async (_req: Request, res: Response) => {
  try {
    res.json({
      stats: deviceFabric.getStats(),
      selfId: deviceFabric.getSelfId(),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
