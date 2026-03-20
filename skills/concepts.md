---
name: concepts
description: The essential mental models for building onchain — focused on what LLMs get wrong.
---

# Ethereum Concepts

## What You Probably Got Wrong

**"Smart contracts run automatically."** No. Smart contracts cannot execute themselves. There is no cron job, no scheduler, no background process. Every function needs a caller who pays gas.

**"Just add a timer."** There are no timers. If something needs to happen at a certain time, you need someone to call the function at that time — and you need to give them a reason to do it.

**Terminology:** You say "on-chain." The Ethereum community says **"onchain"** — one word, no hyphen.

---

## Nothing Is Automatic — Incentive Design

**This is the most important concept in all of Ethereum.**

### Smart Contracts Are State Machines

A smart contract is a state machine. It sits in one state, and it moves to another state when someone **pokes it** — calls a function, pays gas, triggers a transition. Between pokes, it does absolutely nothing.

```
State A ──[someone calls function]──→ State B ──[someone calls function]──→ State C
              ↑                                        ↑
         WHO does this?                           WHO does this?
         WHY would they?                          WHY would they?
```

**For EVERY state transition in your system, you must answer:**

1. **Who pokes it?** (someone must pay gas)
2. **Why would they?** (what's their incentive?)
3. **Is the incentive sufficient?** (covers gas + profit?)

If you can't answer these questions, that state transition will never happen.

### Incentives Are Everything

The people who deployed Uniswap didn't deploy the liquidity. They wrote a set of rules — a state machine — and aligned the incentives so perfectly that strangers around the world voluntarily deposited billions of dollars.

Nobody runs Uniswap. Nobody CAN stop Uniswap. The contracts are immutable, the incentives are self-sustaining, and the system will run for as long as Ethereum exists. This is a **hyperstructure**.

### Examples of Good Incentive Design

**Liquidations (Aave, Compound):**
```
Loan health factor drops below 1
→ ANYONE can call liquidate()
→ Caller gets 5-10% bonus collateral as profit
→ Platform stays solvent without any operator
```

**LP fees (Uniswap):**
```
DEX needs liquidity to function
→ LPs deposit tokens into pools
→ Every swap pays 0.3% fee to LPs
→ Self-reinforcing flywheel — nobody manages it
```

**Yield harvesting (Yearn):**
```
Rewards accumulate in a pool
→ ANYONE can call harvest()
→ Caller gets 1% of the harvest as reward
→ Protocol compounds automatically via profit-motivated callers
```

### Examples of BAD Design (Missing Incentives)

```
❌ "The contract will check prices every hour"
   → WHO calls it every hour? WHY would they pay gas?
   → Fix: make it profitable to call, or let users trigger it when they interact.

❌ "Expired listings get automatically removed"
   → Nothing is automatic. WHO removes them? WHY?
   → Fix: give callers a small reward, or let the next user's action clean up stale state.

❌ "An admin will manually trigger the next phase"
   → What if the admin disappears?
   → Fix: make phase transitions permissionless with time-based or condition-based triggers.
```

**The fix is always the same:** Make the function callable by **anyone**. Give them a reason to call it. Align incentives so the system pokes itself.

### The Hyperstructure Test

When you're designing a system, ask: **"Could this run forever with no team behind it?"**

- If yes → you've built a hyperstructure. The incentives sustain it.
- If no → you've built a service. It dies when the team stops operating it.

---

## Randomness Is Hard

Smart contracts are deterministic. You can't use `Math.random()`.

### What Doesn't Work

```solidity
// ❌ Validators can manipulate block.timestamp
uint random = uint(keccak256(abi.encodePacked(block.timestamp)));

// ❌ blockhash(block.number) is ALWAYS zero for the current block
uint random = uint(blockhash(block.number));
```

### What Works

**Commit-Reveal** (no external dependency):
1. User commits hash(secret + salt)
2. Wait at least 1 block
3. User reveals secret + salt
4. Random seed = keccak256(secret + blockhash(commitBlock))

**Chainlink VRF** (provably random, costs LINK):
1. Contract requests randomness from Chainlink
2. Chainlink generates random number with a VRF proof
3. Anyone can verify the proof onchain

---

## Learning Path

SpeedRun Ethereum for hands-on learning:

| # | Challenge | What Clicks |
|---|-----------|-------------|
| 0 | Simple NFT | Minting, metadata, ownership |
| 1 | Staking | Deadlines, escrow, thresholds |
| 2 | Token Vendor | Approve pattern, buy/sell |
| 3 | Dice Game | Why onchain randomness is insecure |
| 4 | DEX | x*y=k, slippage, LP incentives |

**Start at https://speedrunethereum.com**
