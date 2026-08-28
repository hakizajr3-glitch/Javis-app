// Browser-safe crypto shim — provides randomBytes via Web Crypto API.
// Node's `crypto` module is not available in the browser, but jarvis-core's
// securityLayer calls crypto.randomBytes() at module load time. This shim
// redirects those calls to the Web Crypto API (globalThis.crypto).
const webCrypto = globalThis.crypto;

export function randomBytes(size: number): Buffer {
  const arr = new Uint8Array(size);
  webCrypto.getRandomValues(arr);
  return arr as unknown as Buffer;
}

export function createHash(algorithm: string) {
  // Minimal shim — uses SubtleCrypto for digest. Only digest() is supported.
  return {
    update(_data: any) { return this; },
    async digest() {
      throw new Error('createHash.digest not supported in browser shim — use crypto.subtle.digest directly');
    },
  };
}

export default { randomBytes, createHash, webCrypto };
