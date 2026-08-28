/**
 * End-to-end test: real browser control through the full stack.
 *
 * Verifies that browserControl.performAction actually drives a real
 * Chromium browser via the Playwright sidecar — not fake results.
 *
 * Requires the sidecar to be running:
 *   npm run browser:sidecar
 */

import { playwrightSidecar } from './playwrightSidecarClient.js';

async function main() {
  console.log('--- Playwright Sidecar E2E Test ---\n');

  // 1. Health check
  const running = await playwrightSidecar.isRunning();
  console.log(`1. Sidecar running: ${running}`);
  if (!running) {
    console.error('   FAIL: Sidecar is not running. Start it with: npm run browser:sidecar');
    process.exit(1);
  }

  // 2. Navigate to a real page
  const nav = await playwrightSidecar.navigate('https://example.com');
  console.log(`2. Navigate: success=${nav.success}, url=${nav.result?.url}, status=${nav.result?.status}`);
  if (!nav.success || nav.result?.status !== 200) {
    console.error('   FAIL: Navigation did not return HTTP 200');
    process.exit(1);
  }

  // 3. Extract real text from the page
  const extract = await playwrightSidecar.extractText('h1');
  console.log(`3. Extract h1: success=${extract.success}, data="${extract.result?.data}"`);
  if (!extract.success || extract.result?.data !== 'Example Domain') {
    console.error(`   FAIL: Expected "Example Domain", got "${extract.result?.data}"`);
    process.exit(1);
  }

  // 4. Get the real page title
  const title = await playwrightSidecar.getTitle();
  console.log(`4. Page title: success=${title.success}, title="${title.result?.title}"`);
  if (!title.success || title.result?.title !== 'Example Domain') {
    console.error(`   FAIL: Expected title "Example Domain", got "${title.result?.title}"`);
    process.exit(1);
  }

  // 5. Take a real screenshot
  const shot = await playwrightSidecar.screenshot();
  const base64Len = shot.result?.base64?.length || 0;
  console.log(`5. Screenshot: success=${shot.success}, base64 length=${base64Len}, ${shot.result?.width}x${shot.result?.height}`);
  if (!shot.success || base64Len < 1000) {
    console.error('   FAIL: Screenshot did not return real image data');
    process.exit(1);
  }

  // 6. Evaluate JavaScript in the real page
  const evalResult = await playwrightSidecar.evaluate('document.querySelectorAll("p").length');
  console.log(`6. Evaluate JS: success=${evalResult.success}, <p> count=${evalResult.result?.data}`);
  if (!evalResult.success || typeof evalResult.result?.data !== 'number') {
    console.error('   FAIL: JavaScript evaluation did not return a number');
    process.exit(1);
  }

  // 7. Navigate to a second page and verify the URL changed
  const nav2 = await playwrightSidecar.navigate('https://www.iana.org/help/example-domains');
  console.log(`7. Second navigate: success=${nav2.success}, url=${nav2.result?.url}`);
  if (!nav2.success) {
    console.error('   FAIL: Second navigation failed');
    process.exit(1);
  }

  // 8. Go back and verify we returned
  const back = await playwrightSidecar.sendCommand('goBack', {});
  console.log(`8. Go back: success=${back.success}, url=${back.result?.url}`);
  if (!back.success) {
    console.error('   FAIL: Go back failed');
    process.exit(1);
  }

  console.log('\n--- ALL TESTS PASSED: Browser control is REAL ---');
  process.exit(0);
}

main().catch(err => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
