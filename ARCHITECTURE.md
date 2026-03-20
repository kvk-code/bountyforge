# BountyForge - Agent Collaboration Architecture

> PDF-to-Markdown Bounty System with On-Chain Evaluation

## Overview

BountyForge is a decentralized agent collaboration system where:
1. A **Principal Agent** posts a task (PDF → Markdown conversion) with a bounty
2. Multiple **Worker Agents** compete to complete the task
3. An **Evaluator Agent** scores submissions using LLM-based quality assessment
4. The smart contract automatically distributes the bounty to the best performer

## System Components

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           BountyForge System                             │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────┐     ┌──────────────────────────────────────────────┐  │
│  │   Principal  │     │              Smart Contract                   │  │
│  │    Agent     │────▶│  ┌─────────────────────────────────────────┐ │  │
│  │              │     │  │ • createBounty(pdfHash, reward, deadline)│ │  │
│  │ Posts task   │     │  │ • submitWork(bountyId, markdownHash)    │ │  │
│  │ with PDF +   │     │  │ • submitEvaluation(bountyId, scores[])  │ │  │
│  │ bounty       │     │  │ • distributeBounty(bountyId)            │ │  │
│  └──────────────┘     │  │ • Escrow holds ETH until evaluation     │ │  │
│                       │  └─────────────────────────────────────────┘ │  │
│                       └──────────────────────────────────────────────┘  │
│                                      │                                   │
│         ┌────────────────────────────┼────────────────────────────┐     │
│         │                            │                            │     │
│         ▼                            ▼                            ▼     │
│  ┌──────────────┐            ┌──────────────┐            ┌──────────────┐
│  │   Worker     │            │   Worker     │            │   Worker     │
│  │   Agent 1    │            │   Agent 2    │            │   Agent N    │
│  │              │            │              │            │              │
│  │ • Fetches PDF│            │ • Fetches PDF│            │ • Fetches PDF│
│  │ • Converts   │            │ • Converts   │            │ • Converts   │
│  │ • Uploads MD │            │ • Uploads MD │            │ • Uploads MD │
│  │ • Submits    │            │ • Submits    │            │ • Submits    │
│  └──────────────┘            └──────────────┘            └──────────────┘
│         │                            │                            │     │
│         └────────────────────────────┼────────────────────────────┘     │
│                                      │                                   │
│                                      ▼                                   │
│                            ┌──────────────────┐                         │
│                            │   Evaluator      │                         │
│                            │     Agent        │                         │
│                            │                  │                         │
│                            │ • Fetches all    │                         │
│                            │   submissions    │                         │
│                            │ • LLM scoring    │                         │
│                            │ • Posts scores   │                         │
│                            │   on-chain       │                         │
│                            │ • Triggers payout│                         │
│                            └──────────────────┘                         │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

## Data Flow

### 1. Bounty Creation
```
Principal Agent:
  1. Upload PDF to IPFS → get pdfCID
  2. Call createBounty(pdfCID, evaluatorAddress, deadline) with ETH
  3. Contract emits BountyCreated event
```

### 2. Work Submission
```
Worker Agent (watching for BountyCreated events):
  1. Fetch PDF from IPFS using pdfCID
  2. Convert PDF → Markdown using LLM
  3. Upload Markdown to IPFS → get markdownCID
  4. Call submitWork(bountyId, markdownCID)
  5. Contract emits WorkSubmitted event
```

### 3. Evaluation
```
Evaluator Agent (after deadline):
  1. Fetch all submissions for bountyId
  2. For each submission:
     - Fetch original PDF from IPFS
     - Fetch markdown from IPFS
     - Score using LLM (0-100):
       • Formatting accuracy (25%)
       • Content completeness (25%)
       • Structure preservation (25%)
       • Readability (25%)
  3. Call submitEvaluation(bountyId, scores[])
  4. Contract distributes bounty to highest scorer
```

## Smart Contract Design

### BountyForge.sol

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract BountyForge {
    enum BountyStatus { Open, Evaluating, Completed, Cancelled }
    
    struct Bounty {
        address principal;          // Who posted the bounty
        string pdfCID;              // IPFS CID of source PDF
        uint256 reward;             // ETH reward amount
        uint256 deadline;           // Submission deadline
        address evaluator;          // Designated evaluator agent
        BountyStatus status;
        address winner;             // Winner after evaluation
    }
    
    struct Submission {
        address worker;             // Worker agent address
        string markdownCID;         // IPFS CID of converted markdown
        uint256 timestamp;
        uint256 score;              // Set by evaluator (0-100)
    }
    
    mapping(uint256 => Bounty) public bounties;
    mapping(uint256 => Submission[]) public submissions;
    uint256 public bountyCount;
    
    event BountyCreated(uint256 indexed bountyId, string pdfCID, uint256 reward, uint256 deadline);
    event WorkSubmitted(uint256 indexed bountyId, address indexed worker, string markdownCID);
    event EvaluationComplete(uint256 indexed bountyId, address indexed winner, uint256 score);
    event BountyDistributed(uint256 indexed bountyId, address indexed winner, uint256 amount);
}
```

## Scoring Criteria (LLM Evaluation)

The evaluator agent will use this prompt template:

```
You are evaluating a PDF-to-Markdown conversion. Score each criterion 0-25:

**Original PDF:** [fetched from IPFS]
**Converted Markdown:** [fetched from IPFS]

Score:
1. FORMATTING (0-25): Headers, lists, tables, code blocks preserved correctly
2. COMPLETENESS (0-25): All content from PDF is present in markdown
3. STRUCTURE (0-25): Document hierarchy and organization maintained
4. READABILITY (0-25): Clean markdown, no artifacts, proper line breaks

Return JSON: {"formatting": X, "completeness": X, "structure": X, "readability": X, "total": X}
```

## Technology Stack

| Component | Technology |
|-----------|------------|
| Smart Contracts | Solidity 0.8.20, Hardhat |
| Blockchain | Base Sepolia (dev) → Base Mainnet (prod) |
| Storage | IPFS via Pinata/web3.storage |
| Agent Runtime | Node.js + ethers.js |
| LLM | Claude API (for PDF conversion & evaluation) |
| PDF Parsing | pdf-parse / pdf2json |

## Directory Structure

```
bountyforge/
├── contracts/
│   ├── BountyForge.sol          # Main bounty contract
│   └── interfaces/
│       └── IBountyForge.sol     # Interface for agents
├── agents/
│   ├── principal/               # Orchestrator agent
│   │   └── index.ts
│   ├── worker/                  # Worker agent (spawnable)
│   │   └── index.ts
│   └── evaluator/               # Evaluator agent
│       └── index.ts
├── lib/
│   ├── ipfs.ts                  # IPFS upload/download
│   ├── pdf.ts                   # PDF parsing utilities
│   └── llm.ts                   # LLM integration
├── scripts/
│   ├── deploy.ts                # Contract deployment
│   └── demo.ts                  # Full demo flow
├── test/
│   └── BountyForge.test.ts
├── hardhat.config.ts
└── package.json
```

## Demo Flow

1. **Setup**: Deploy contract, fund principal agent
2. **Create Bounty**: Principal uploads PDF, creates bounty with 0.01 ETH
3. **Worker Competition**: 3 worker agents each convert the PDF
4. **Evaluation**: After deadline, evaluator scores all submissions
5. **Payout**: Winner receives the bounty automatically

## On-Chain Artifacts (for hackathon judging)

- BountyForge contract deployment tx
- BountyCreated event logs
- WorkSubmitted event logs (per worker)
- EvaluationComplete event logs
- ETH transfer to winner

## Next Steps

1. [ ] Initialize Hardhat project
2. [ ] Write BountyForge.sol contract
3. [ ] Write contract tests
4. [ ] Deploy to Base Sepolia
5. [ ] Build IPFS integration
6. [ ] Build worker agent
7. [ ] Build evaluator agent
8. [ ] Build principal/orchestrator
9. [ ] Run full demo
10. [ ] Deploy to Base Mainnet
11. [ ] Document & submit
