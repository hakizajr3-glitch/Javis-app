/**
 * Playwright Sidecar Server
 *
 * A standalone Node.js HTTP server that wraps Playwright browser automation.
 * The Tauri desktop app spawns this as a sidecar process on startup (or on
 * first browser-control request). The TypeScript BrowserControl client
 * connects to it via HTTP and sends commands.
 *
 * Protocol:
 *   POST /command   { action: "navigate", params: { url } }   → { success, result }
 *   GET  /health    → { status: "ok", browserReady: true }
 *   POST /shutdown  → { status: "shutting down" }
 *
 * Supported actions:
 *   navigate, click, type, scroll, select, submit, extract, screenshot,
 *   evaluate, waitFor, goBack, goForward, getTitle, getUrl, close
 *
 * Usage:
 *   node playwrightSidecar.ts [--port 19222] [--headed]
 */

import http from 'http';
import { chromium, Browser, BrowserContext, Page } from 'playwright';

// ─── State ───────────────────────────────────────────────────────────────────

let browser: Browser | null = null;
let context: BrowserContext | null = null;
let page: Page | null = null;
let server: http.Server | null = null;
let requestCount = 0;

const PORT = parseInt(process.argv.find(a => a.startsWith('--port='))?.split('=')[1] || '19222', 10);
const HEADED = process.argv.includes('--headed');

// ─── Browser lifecycle ───────────────────────────────────────────────────────

async function ensureBrowser(): Promise<void> {
  if (browser && browser.isConnected()) {
    if (!page) {
      context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
      page = await context.newPage();
    }
    return;
  }
  browser = await chromium.launch({
    headless: !HEADED,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  page = await context.newPage();
  console.log(`[PlaywrightSidecar] Browser launched (headless=${!HEADED})`);
}

async function closeBrowser(): Promise<void> {
  if (page) { try { await page.close(); } catch (_) {} page = null; }
  if (context) { try { await context.close(); } catch (_) {} context = null; }
  if (browser) { try { await browser.close(); } catch (_) {} browser = null; }
}

// ─── Action handlers ─────────────────────────────────────────────────────────

interface CommandRequest {
  action: string;
  params: Record<string, any>;
}

interface CommandResponse {
  success: boolean;
  result?: any;
  error?: string;
}

async function handleCommand(req: CommandRequest): Promise<CommandResponse> {
  await ensureBrowser();
  if (!page) throw new Error('Browser page not available');

  const { action, params } = req;

  switch (action) {
    // ── Navigation ───────────────────────────────────────────────────────
    case 'navigate': {
      const url = params.url;
      if (!url) throw new Error('navigate requires "url" param');
      const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      return { success: true, result: { url: page.url(), status: response?.status() } };
    }
    case 'goBack': {
      await page.goBack();
      return { success: true, result: { url: page.url() } };
    }
    case 'goForward': {
      await page.goForward();
      return { success: true, result: { url: page.url() } };
    }
    case 'reload': {
      await page.reload();
      return { success: true, result: { url: page.url() } };
    }

    // ── Interaction ──────────────────────────────────────────────────────
    case 'click': {
      const selector = params.selector;
      if (!selector) throw new Error('click requires "selector" param');
      await page.click(selector, { timeout: params.timeout || 10000 });
      return { success: true, result: { clicked: true, selector } };
    }
    case 'clickText': {
      const text = params.text;
      if (!text) throw new Error('clickText requires "text" param');
      await page.getByText(text).first().click({ timeout: params.timeout || 10000 });
      return { success: true, result: { clicked: true, text } };
    }
    case 'type': {
      const selector = params.selector;
      const text = params.text;
      if (!selector || text === undefined) throw new Error('type requires "selector" and "text" params');
      await page.fill(selector, text, { timeout: params.timeout || 10000 });
      return { success: true, result: { typed: true, selector, text } };
    }
    case 'press': {
      const key = params.key;
      if (!key) throw new Error('press requires "key" param');
      if (params.selector) {
        await page.press(params.selector, key);
      } else {
        await page.keyboard.press(key);
      }
      return { success: true, result: { pressed: true, key } };
    }
    case 'scroll': {
      const direction = params.direction || 'down';
      const amount = params.amount || 500;
      const delta = direction === 'up' || direction === 'left' ? -amount : amount;
      if (direction === 'up' || direction === 'down') {
        await page.mouse.wheel(0, delta);
      } else {
        await page.mouse.wheel(delta, 0);
      }
      return { success: true, result: { scrolled: true, direction, amount } };
    }
    case 'select': {
      const selector = params.selector;
      const value = params.value;
      if (!selector || value === undefined) throw new Error('select requires "selector" and "value" params');
      await page.selectOption(selector, value);
      return { success: true, result: { selected: true, selector, value } };
    }
    case 'submit': {
      if (params.selector) {
        await page.locator(params.selector).press('Enter');
      } else {
        await page.keyboard.press('Enter');
      }
      return { success: true, result: { submitted: true } };
    }
    case 'hover': {
      const selector = params.selector;
      if (!selector) throw new Error('hover requires "selector" param');
      await page.hover(selector);
      return { success: true, result: { hovered: true, selector } };
    }

    // ── Data extraction ──────────────────────────────────────────────────
    case 'extract': {
      const selector = params.selector;
      const extractType = params.extractType || 'text';
      if (!selector) throw new Error('extract requires "selector" param');
      if (extractType === 'text') {
        const text = await page.textContent(selector);
        return { success: true, result: { extracted: true, selector, data: text } };
      }
      if (extractType === 'attribute') {
        const attr = params.attribute;
        if (!attr) throw new Error('extract attribute requires "attribute" param');
        const value = await page.getAttribute(selector, attr);
        return { success: true, result: { extracted: true, selector, attribute: attr, data: value } };
      }
      if (extractType === 'html') {
        const html = await page.innerHTML(selector);
        return { success: true, result: { extracted: true, selector, data: html } };
      }
      if (extractType === 'all') {
        const elements = await page.locator(selector).all();
        const data = await Promise.all(elements.map(el => el.textContent()));
        return { success: true, result: { extracted: true, selector, data } };
      }
      throw new Error(`Unknown extract type: ${extractType}`);
    }
    case 'evaluate': {
      const script = params.script;
      if (!script) throw new Error('evaluate requires "script" param');
      const result = await page.evaluate(script);
      return { success: true, result: { evaluated: true, data: result } };
    }
    case 'getTitle': {
      const title = await page.title();
      return { success: true, result: { title } };
    }
    case 'getUrl': {
      return { success: true, result: { url: page.url() } };
    }
    case 'getContent': {
      const html = await page.content();
      return { success: true, result: { html } };
    }

    // ── Screenshot ───────────────────────────────────────────────────────
    case 'screenshot': {
      const fullPage = params.fullPage ?? false;
      const buffer = await page.screenshot({ fullPage, type: 'png' });
      const base64 = buffer.toString('base64');
      return { success: true, result: { screenshot: true, base64, width: page.viewportSize()?.width, height: page.viewportSize()?.height } };
    }

    // ── Waiting ──────────────────────────────────────────────────────────
    case 'waitFor': {
      const selector = params.selector;
      const timeout = params.timeout || 10000;
      if (selector) {
        await page.waitForSelector(selector, { timeout });
        return { success: true, result: { waited: true, selector } };
      }
      const ms = params.ms || 1000;
      await page.waitForTimeout(ms);
      return { success: true, result: { waited: true, ms } };
    }
    case 'waitForLoad': {
      await page.waitForLoadState('networkidle', { timeout: params.timeout || 30000 });
      return { success: true, result: { loaded: true } };
    }

    // ── Tabs / pages ─────────────────────────────────────────────────────
    case 'newTab': {
      const newPage = await context!.newPage();
      page = newPage;
      if (params.url) {
        await page.goto(params.url, { waitUntil: 'domcontentloaded' });
      }
      return { success: true, result: { url: page.url() } };
    }
    case 'closeTab': {
      if (page) {
        await page.close();
        const pages = context!.pages();
        page = pages[pages.length - 1] || null;
      }
      return { success: true, result: { closed: true } };
    }
    case 'listTabs': {
      const pages = context!.pages();
      return { success: true, result: { tabs: pages.map((p, i) => ({ index: i, url: p.url() })) } };
    }

    // ── Lifecycle ────────────────────────────────────────────────────────
    case 'close': {
      await closeBrowser();
      return { success: true, result: { closed: true } };
    }

    default:
      throw new Error(`Unknown action: ${action}`);
  }
}

// ─── HTTP Server ─────────────────────────────────────────────────────────────

function parseBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 10 * 1024 * 1024) reject(new Error('Body too large')); });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function sendJSON(res: http.ServerResponse, status: number, data: any): void {
  const json = JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(json);
}

server = http.createServer(async (req, res) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return;
  }

  const url = req.url || '';

  // Health check
  if (url === '/health' && req.method === 'GET') {
    sendJSON(res, 200, {
      status: 'ok',
      browserReady: !!(browser && browser.isConnected()),
      port: PORT,
      requests: requestCount,
    });
    return;
  }

  // Shutdown
  if (url === '/shutdown' && req.method === 'POST') {
    sendJSON(res, 200, { status: 'shutting down' });
    setTimeout(async () => {
      await closeBrowser();
      server?.close();
      process.exit(0);
    }, 100);
    return;
  }

  // Command endpoint
  if (url === '/command' && req.method === 'POST') {
    requestCount++;
    try {
      const body = await parseBody(req);
      const cmd: CommandRequest = JSON.parse(body);
      const result = await handleCommand(cmd);
      sendJSON(res, 200, result);
    } catch (err: any) {
      sendJSON(res, 200, { success: false, error: err?.message || String(err) });
    }
    return;
  }

  // 404
  sendJSON(res, 404, { error: 'Not found', url });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[PlaywrightSidecar] Listening on http://127.0.0.1:${PORT}`);
  console.log(`[PlaywrightSidecar] Headed=${HEADED}, Chromium ready on first command`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('[PlaywrightSidecar] SIGTERM received');
  await closeBrowser();
  server?.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('[PlaywrightSidecar] SIGINT received');
  await closeBrowser();
  server?.close();
  process.exit(0);
});

process.on('uncaughtException', (err) => {
  console.error('[PlaywrightSidecar] Uncaught exception:', err);
});

process.on('unhandledRejection', (err) => {
  console.error('[PlaywrightSidecar] Unhandled rejection:', err);
});
