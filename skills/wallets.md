---
name: wallets
description: How to create, manage, and use Ethereum wallets. Covers EOAs, smart contract wallets, multisig (Safe), and account abstraction.
---

# Wallets on Ethereum

## What You Probably Got Wrong

**EIP-7702 is live.** Since Pectra (May 7, 2025), regular EOAs can delegate execution to smart-contract code without migrating wallets.

**Most secure storage:** Hardware wallets alone are single points of failure. An audited multisig smart contract (e.g. Safe) is more secure.

---

## Safe (Gnosis Safe) Multisig

### Key Addresses (v1.4.1, deterministic across chains)

| Contract | Address |
|----------|---------|
| Safe Singleton | `0x41675C099F32341bf84BFc5382aF534df5C7461a` |
| Safe Proxy Factory | `0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67` |
| MultiSend | `0x38869bf66a61cF6bDB996A6aE40D5853Fd43B526` |

### Safe for AI Agents

**Pattern:** 1-of-2 Safe
- Owner 1: Agent's wallet (hot, automated)
- Owner 2: Human's wallet (cold, recovery)
- Threshold: 1 (agent can act alone)

Benefits: If agent key is compromised, human removes it. Human can always recover funds.

---

## NEVER COMMIT SECRETS TO GIT

**This is the #1 way AI agents lose funds and leak credentials.** Bots scrape GitHub in real-time and exploit leaked secrets within seconds.

**This applies to ALL secrets:**
- **Wallet private keys** — funds drained instantly
- **API keys** — Alchemy, Infura, Etherscan
- **RPC URLs with embedded keys**

### Prevention

```bash
# .gitignore (MUST exist in every project)
.env
.env.*
*.key
*.pem
broadcast/
cache/
```

```bash
# Verify before every commit
git diff --cached --name-only | grep -iE '\.env|key|secret|private'
```

### If You Already Committed a Key

1. **Assume it's compromised.**
2. **Transfer all funds immediately** to a new wallet.
3. **Rotate the key.**
4. **Clean Git history** with `git filter-repo` or BFG Repo Cleaner.

---

## CRITICAL Guardrails for AI Agents

### Key Safety Rules

1. **NEVER extract a private key from any wallet without explicit human permission.**
2. **NEVER store private keys in:** chat logs, plain text files, Git repos.
3. **NEVER move funds without human confirmation.**
4. **Use a dedicated wallet with limited funds** for agent operations.
5. **Double-check addresses.** Use `ethers.getAddress()` for checksum validation.
6. **Test on testnet first.**

### Storage Options (Worst to Best)

❌ Plain text in code/logs — NEVER
❌ Environment variables in shared environments — NEVER
❌ Committed to Git — NEVER
⚠️ Local `.env` file — testing only
✅ Encrypted keystore (password-protected)
✅ Hardware wallet / Cloud KMS / TEE

### Safe Transaction Pattern

```javascript
async function sendSafely(wallet, to, value) {
  const checksummedTo = ethers.getAddress(to); // validates
  const gasEstimate = await wallet.estimateGas({ to: checksummedTo, value });
  const feeData = await wallet.provider.getFeeData();
  const gasCost = gasEstimate * feeData.maxFeePerGas;
  
  if (totalCostUSD > 10) {
    // Show details and wait for human approval
  }
  
  const tx = await wallet.sendTransaction({
    to: checksummedTo,
    value,
    gasLimit: gasEstimate * 120n / 100n, // 20% buffer
    maxFeePerGas: feeData.maxFeePerGas,
    maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
  });
  
  const receipt = await tx.wait();
  return receipt;
}
```

---

## Creating a Wallet for Agent Operations

```javascript
import { ethers } from "ethers";

// Generate a new random wallet
const wallet = ethers.Wallet.createRandom();

console.log("Address:", wallet.address);
console.log("Private Key:", wallet.privateKey);
console.log("Mnemonic:", wallet.mnemonic.phrase);

// CRITICAL: Save these securely, NEVER commit to git
```

For testnet faucets:
- **Base Sepolia:** https://www.alchemy.com/faucets/base-sepolia
- **Sepolia ETH:** https://sepoliafaucet.com/

---

## Further Reading

- **Safe docs:** https://docs.safe.global/
- **EIP-7702 spec:** https://eips.ethereum.org/EIPS/eip-7702
- **ERC-4337 spec:** https://eips.ethereum.org/EIPS/eip-4337
