import { spawn } from 'child_process'
import { createServer } from 'vite'
import patchInfoPlist from './scripts/patch-info-plist.js'

async function start() {
  // Self-heal macOS permission strings + ad-hoc sign before Electron is spawned,
  // otherwise navigator.mediaDevices.getUserMedia is silently denied.
  try { patchInfoPlist.main() } catch (e) { console.warn('[run-dev] patch-info-plist failed:', e?.message || e) }

  const server = await createServer({ configFile: './vite.config.js' })
  await server.listen()
  const { port } = server.config.server

  const electron = spawn('npx', ['electron', '.', '--no-sandbox'], {
    stdio: 'inherit',
    env: { ...process.env, VITE_DEV_SERVER_URL: `http://localhost:${port}` },
  })

  electron.on('close', () => {
    server.close()
    process.exit()
  })
}

start()
