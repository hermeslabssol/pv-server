// Inject a Wallet-Standard-compliant mock Phantom wallet so we can drive the
// real connect+sign flow headlessly (no real Phantom needed). Returns a marker.
(() => {
  // Deterministic 32-byte pubkey + base58 address.
  const pk = new Uint8Array(32);
  for (let i = 0; i < 32; i++) pk[i] = (i * 7 + 3) & 0xff;
  const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  function b58(bytes) {
    let digits = [0];
    for (const b of bytes) {
      let carry = b;
      for (let j = 0; j < digits.length; j++) { carry += digits[j] << 8; digits[j] = carry % 58; carry = (carry / 58) | 0; }
      while (carry) { digits.push(carry % 58); carry = (carry / 58) | 0; }
    }
    let s = '';
    for (const b of bytes) { if (b === 0) s += '1'; else break; }
    for (let k = digits.length - 1; k >= 0; k--) s += B58[digits[k]];
    return s;
  }
  const address = b58(pk);

  const account = {
    address,
    publicKey: pk,
    chains: ['solana:mainnet', 'solana:devnet'],
    features: ['solana:signMessage', 'solana:signTransaction', 'solana:signAndSendTransaction'],
    label: 'Mock Phantom',
  };

  const listeners = {};
  const wallet = {
    version: '1.0.0',
    name: 'Phantom',
    icon: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
    chains: ['solana:mainnet', 'solana:devnet'],
    accounts: [account],
    features: {
      'standard:connect': {
        version: '1.0.0',
        connect: async () => { wallet.accounts = [account]; return { accounts: [account] }; },
      },
      'standard:disconnect': {
        version: '1.0.0',
        disconnect: async () => {},
      },
      'standard:events': {
        version: '1.0.0',
        on: (event, cb) => { (listeners[event] ||= []).push(cb); return () => {}; },
      },
      'solana:signMessage': {
        version: '1.0.0',
        signMessage: async (...inputs) => {
          const reqs = inputs.length === 1 && Array.isArray(inputs[0]) ? inputs[0] : inputs;
          return reqs.map((r) => {
            const sig = new Uint8Array(64);
            for (let i = 0; i < 64; i++) sig[i] = (i * 13 + 5) & 0xff;
            return { signedMessage: r.message, signature: sig };
          });
        },
      },
      'solana:signTransaction': {
        version: '1.0.0',
        signTransaction: async (...inputs) => inputs.map((r) => ({ signedTransaction: r.transaction })),
      },
      'solana:signAndSendTransaction': {
        version: '1.0.0',
        signAndSendTransaction: async () => [{ signature: new Uint8Array(64) }],
      },
    },
  };

  // Wallet-Standard registration (bidirectional handshake).
  const evtRegister = () => {
    try {
      window.dispatchEvent(new CustomEvent('wallet-standard:register-wallet', {
        detail: (api) => { try { api.register ? api.register(wallet) : api({ register: (w) => w }); } catch (e) {} },
      }));
    } catch (e) {}
  };
  window.addEventListener('wallet-standard:app-ready', (e) => {
    try { const reg = e.detail && e.detail.register; if (reg) reg(wallet); } catch (_) {}
  });
  evtRegister();

  // Legacy provider detection fallback (window.phantom.solana / window.solana).
  const legacy = {
    isPhantom: true,
    publicKey: { toBytes: () => pk, toString: () => address, toBase58: () => address },
    isConnected: true,
    connect: async () => ({ publicKey: legacy.publicKey }),
    disconnect: async () => {},
    on: (ev, cb) => { (listeners[ev] ||= []).push(cb); },
    off: () => {},
    signMessage: async (msg) => {
      const sig = new Uint8Array(64);
      for (let i = 0; i < 64; i++) sig[i] = (i * 13 + 5) & 0xff;
      return { signature: sig, publicKey: legacy.publicKey };
    },
    signTransaction: async (t) => t,
    signAllTransactions: async (t) => t,
  };
  try { window.phantom = { solana: legacy }; } catch (e) {}
  try { window.solana = legacy; } catch (e) {}

  return 'MOCK_WALLET_INJECTED:' + address;
})();
