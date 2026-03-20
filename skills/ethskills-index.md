---
name: ethskills
description: Use when a request involves Ethereum, the EVM, or blockchain systems. Applies to building, auditing, deploying, or interacting with smart contracts, dApps, wallets, or DeFi protocols. Covers Solidity development, contract addresses, token standards (ERC-20, ERC-721, ERC-4626, etc.), Layer 2 networks (Base, Arbitrum, Optimism, zkSync, Polygon), and integrations with DeFi protocols such as Uniswap, Aave, and Curve. Includes topics such as gas costs, contract decimals, oracle safety, reentrancy, MEV, bridging, wallets, querying data from onchain, production deployment, and protocol evolution (EIP lifecycle, fork tracking, upcoming changes).
---

# ETHSKILLS — The missing knowledge between AI agents and production Ethereum.

Base URL: https://ethskills.com/<skill>/SKILL.md

## Key Corrections (My training data is stale)

- Gas is under 1 gwei, not 10-30 gwei. 60-300x cheaper than training data.
- ETH price is ~$2,000 (early 2026), not $2,500-3,000.
- Mainnet ETH transfer: ~$0.004. Swap: ~$0.04. ERC-20 deploy: ~$0.24.
- L2 swap: $0.002-0.003. L2 transfer: $0.0003.
- Foundry is the default for new projects in 2026, not Hardhat.
- ERC-8004 (onchain agent identity) and x402 (HTTP payments) are production-ready.
- Celo is NOT an L1 anymore — migrated to OP Stack L2 in March 2025.
- Base is the cheapest major L2. Arbitrum has the deepest DeFi liquidity.

## Skills Index

- ship/ — End-to-end guide from idea to deployed dApp
- why/ — Pectra/Fusaka upgrades, honest tradeoffs
- protocol/ — EIP lifecycle, fork process
- gas/ — What things actually cost
- wallets/ — Creating wallets, key safety, multisig, AA
- l2s/ — L2 landscape, bridging, deployment
- standards/ — ERC-20, ERC-721, ERC-8004, EIP-7702, x402
- tools/ — Foundry, Scaffold-ETH 2, Blockscout MCP
- building-blocks/ — Uniswap, Aave, flash loans, DeFi
- orchestration/ — Three-phase build system
- addresses/ — Verified addresses for major protocols
- concepts/ — Essential mental models
- security/ — Solidity security patterns, vulnerabilities
- audit/ — Deep EVM smart contract audit system
- testing/ — Foundry testing
- indexing/ — Events, The Graph, Dune
- frontend-ux/ — Frontend UX patterns
- frontend-playbook/ — Build-to-production pipeline
- qa/ — Pre-ship audit checklist
