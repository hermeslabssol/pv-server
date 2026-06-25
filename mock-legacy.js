// Legacy-only Phantom provider (window.phantom.solana / window.solana).
// No wallet-standard registration (that crashes the standard lib with a bad mock).
// PhantomWalletAdapter detects this provider on connect().
(() => {
  const pk = new Uint8Array(32);
  for (let i = 0; i < 32; i++) pk[i] = (i * 7 + 3) & 0xff;
  const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  function b58(bytes) {
    let digits = [0];
    for (const b of bytes) { let carry = b; for (let j = 0; j < digits.length; j++) { carry += digits[j] << 8; digits[j] = carry % 58; carry = (carry / 58) | 0; } while (carry) { digits.push(carry % 58); carry = (carry / 58) | 0; } }
    let s = ''; for (const b of bytes) { if (b === 0) s += '1'; else break; }
    for (let k = digits.length - 1; k >= 0; k--) s += B58[digits[k]]; return s;
  }
  const address = b58(pk);

  // Minimal PublicKey-like object the wallet-adapter wraps.
  const publicKey = {
    _bn: address,
    toBytes: () => pk,
    toBuffer: () => pk,
    toString: () => address,
    toBase58: () => address,
    equals: (o) => o && o.toBase58 && o.toBase58() === address,
  };

  const handlers = {};
  const provider = {
    isPhantom: true,
    publicKey,
    isConnected: true,
    _handleDisconnect: () => {},
    connect: async () => { setTimeout(() => (handlers.connect || []).forEach(f => f(publicKey)), 0); return { publicKey }; },
    disconnect: async () => {},
    on: (ev, cb) => { (handlers[ev] ||= []).push(cb); },
    off: (ev, cb) => { handlers[ev] = (handlers[ev] || []).filter(f => f !== cb); },
    removeAllListeners: () => { for (const k in handlers) handlers[k] = []; },
    signMessage: async (message) => {
      const sig = new Uint8Array(64);
      for (let i = 0; i < 64; i++) sig[i] = (i * 13 + 5) & 0xff;
      return { signature: sig, publicKey };
    },
    signTransaction: async (t) => t,
    signAllTransactions: async (t) => t,
    signAndSendTransaction: async () => ({ signature: 'mocksig' }),
    request: async ({ method }) => {
      if (method === 'connect') return { publicKey };
      if (method === 'signMessage') { const s = new Uint8Array(64); return { signature: s }; }
      return null;
    },
  };

  try { window.phantom = { solana: provider }; } catch (e) {}
  try { window.solana = provider; } catch (e) {}
  return 'LEGACY_MOCK:' + address;
})();
