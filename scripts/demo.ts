/**
 * BountyForge Demo Script
 * 
 * Demonstrates the full bounty workflow:
 * 1. Principal creates a bounty with a sample PDF
 * 2. Multiple workers compete to convert the PDF
 * 3. Evaluator scores submissions and triggers payout
 */

import { ethers } from 'ethers';
import * as fs from 'fs';
import * as path from 'path';
import 'dotenv/config';

import { PrincipalAgent } from '../agents/principal';
import { WorkerAgent } from '../agents/worker';
import { EvaluatorAgent } from '../agents/evaluator';
import { IPFSClient } from '../lib/ipfs';
import { formatETH, parseETH, NETWORKS } from '../lib/contract';

// Configuration
const CONFIG = {
  rpcUrl: process.env.RPC_URL || NETWORKS.baseSepolia.rpcUrl,
  contractAddress: process.env.CONTRACT_ADDRESS || '',
  
  // All agents use the same key for demo (in production, they'd be separate)
  privateKey: process.env.PRIVATE_KEY || '',
  
  // IPFS
  pinataApiKey: process.env.PINATA_API_KEY,
  pinataSecretKey: process.env.PINATA_SECRET_KEY,
  
  // LLM
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  
  // Demo settings
  bountyReward: '0.005',      // ETH
  deadlineMinutes: 2,         // Short deadline for demo
  numWorkers: 2,              // Number of workers to simulate
};

// Sample PDF content (we'll create a simple one for demo)
const SAMPLE_PDF_CONTENT = `
# BountyForge Demo Document

This is a sample document for demonstrating the PDF-to-Markdown conversion bounty system.

## Section 1: Introduction

BountyForge is a decentralized agent collaboration system where:

1. A Principal Agent posts a PDF conversion task with an ETH bounty
2. Multiple Worker Agents compete to convert the PDF to Markdown
3. An Evaluator Agent scores submissions using LLM-based quality assessment
4. The smart contract automatically distributes the bounty to the best performer

## Section 2: Key Features

- **Decentralized**: No central authority controls the bounty system
- **Trustless**: Smart contracts enforce fair payouts
- **Transparent**: All submissions and scores are on-chain
- **AI-Powered**: LLM evaluation ensures quality conversions

## Section 3: Technical Details

### Smart Contract

The BountyForge contract handles:
- Bounty creation and escrow
- Work submission tracking
- Score submission and winner determination
- Automatic ETH distribution

### Agent Architecture

| Agent | Role |
|-------|------|
| Principal | Creates bounties, posts PDFs |
| Worker | Converts PDFs to Markdown |
| Evaluator | Scores submissions |

## Conclusion

This demo shows how AI agents can collaborate on-chain to complete tasks with verifiable outcomes.
`;

async function createSamplePDF(): Promise<Buffer> {
  // For demo, we'll just use the text content
  // In production, this would be an actual PDF
  return Buffer.from(SAMPLE_PDF_CONTENT, 'utf-8');
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║              BOUNTYFORGE DEMO                              ║');
  console.log('║     Decentralized PDF-to-Markdown Bounty System            ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log();

  // Validate configuration
  if (!CONFIG.privateKey) {
    console.error('ERROR: PRIVATE_KEY not set in environment');
    process.exit(1);
  }
  if (!CONFIG.contractAddress) {
    console.error('ERROR: CONTRACT_ADDRESS not set in environment');
    process.exit(1);
  }

  const provider = new ethers.JsonRpcProvider(CONFIG.rpcUrl);
  const wallet = new ethers.Wallet(CONFIG.privateKey, provider);
  
  console.log('Configuration:');
  console.log(`  Network: ${CONFIG.rpcUrl}`);
  console.log(`  Contract: ${CONFIG.contractAddress}`);
  console.log(`  Account: ${wallet.address}`);
  
  const balance = await provider.getBalance(wallet.address);
  console.log(`  Balance: ${formatETH(balance)} ETH`);
  console.log();

  // Create IPFS client
  const ipfs = new IPFSClient({
    pinataApiKey: CONFIG.pinataApiKey,
    pinataSecretKey: CONFIG.pinataSecretKey,
  });

  // ═══════════════════════════════════════════════════════════════════
  // PHASE 1: Principal creates a bounty
  // ═══════════════════════════════════════════════════════════════════
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('PHASE 1: Creating Bounty');
  console.log('═══════════════════════════════════════════════════════════════');

  const principal = new PrincipalAgent({
    privateKey: CONFIG.privateKey,
    rpcUrl: CONFIG.rpcUrl,
    contractAddress: CONFIG.contractAddress,
    evaluatorAddress: wallet.address,  // Same wallet for demo
    ipfs: {
      pinataApiKey: CONFIG.pinataApiKey,
      pinataSecretKey: CONFIG.pinataSecretKey,
    },
  });

  // Create sample PDF
  console.log('Creating sample document...');
  const sampleContent = await createSamplePDF();
  
  // Upload to IPFS
  console.log('Uploading to IPFS...');
  const uploadResult = await ipfs.uploadBuffer(sampleContent, 'sample.txt', {
    name: 'BountyForge Demo Document',
  });
  console.log(`  CID: ${uploadResult.cid}`);

  // Create bounty
  console.log('Creating bounty on-chain...');
  const bountyId = await principal.createBounty({
    pdfCID: uploadResult.cid,
    reward: CONFIG.bountyReward,
    deadlineMinutes: CONFIG.deadlineMinutes,
  });
  console.log(`  Bounty ID: ${bountyId}`);

  // Get bounty info
  const bountyInfo = await principal.getBountyInfo(bountyId);
  console.log(`  Status: ${bountyInfo.status}`);
  console.log(`  Reward: ${formatETH(bountyInfo.bounty.reward)} ETH`);
  console.log(`  Deadline: ${new Date(Number(bountyInfo.bounty.deadline) * 1000).toISOString()}`);
  console.log();

  // ═══════════════════════════════════════════════════════════════════
  // PHASE 2: Workers submit conversions
  // ═══════════════════════════════════════════════════════════════════
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('PHASE 2: Workers Submitting Work');
  console.log('═══════════════════════════════════════════════════════════════');

  // Simulate multiple workers (in real scenario, these would be separate agents)
  const workerSubmissions = [];
  
  for (let i = 1; i <= CONFIG.numWorkers; i++) {
    console.log(`\nWorker ${i} submitting...`);
    
    // Each worker produces slightly different output
    const markdown = `# Worker ${i} Conversion\n\n${SAMPLE_PDF_CONTENT}\n\n---\n*Converted by Worker ${i}*`;
    
    // Upload markdown to IPFS
    const mdResult = await ipfs.uploadString(markdown, `worker-${i}.md`, {
      name: `BountyForge Worker ${i} Submission`,
      keyvalues: {
        bountyId: bountyId.toString(),
        worker: `worker-${i}`,
      },
    });
    console.log(`  Uploaded: ${mdResult.cid}`);
    
    // Submit to contract (using same wallet for demo)
    const worker = new WorkerAgent({
      privateKey: CONFIG.privateKey,
      rpcUrl: CONFIG.rpcUrl,
      contractAddress: CONFIG.contractAddress,
      ipfs: {
        pinataApiKey: CONFIG.pinataApiKey,
        pinataSecretKey: CONFIG.pinataSecretKey,
      },
      llm: {
        anthropicApiKey: CONFIG.anthropicApiKey,
      },
    });
    
    const txHash = await worker.submitWork(bountyId, mdResult.cid);
    console.log(`  Submitted: ${txHash}`);
    
    workerSubmissions.push({
      worker: i,
      cid: mdResult.cid,
    });
  }

  // Check submission count
  const updatedInfo = await principal.getBountyInfo(bountyId);
  console.log(`\nTotal submissions: ${updatedInfo.submissions.length}`);
  console.log();

  // ═══════════════════════════════════════════════════════════════════
  // PHASE 3: Wait for deadline
  // ═══════════════════════════════════════════════════════════════════
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('PHASE 3: Waiting for Deadline');
  console.log('═══════════════════════════════════════════════════════════════');

  const deadline = Number(bountyInfo.bounty.deadline);
  const now = Math.floor(Date.now() / 1000);
  const waitTime = deadline - now;

  if (waitTime > 0) {
    console.log(`Waiting ${waitTime} seconds for deadline...`);
    for (let i = waitTime; i > 0; i -= 10) {
      console.log(`  ${i} seconds remaining...`);
      await new Promise(resolve => setTimeout(resolve, Math.min(i, 10) * 1000));
    }
  }
  console.log('Deadline reached!');
  console.log();

  // ═══════════════════════════════════════════════════════════════════
  // PHASE 4: Evaluator scores and triggers payout
  // ═══════════════════════════════════════════════════════════════════
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('PHASE 4: Evaluation and Payout');
  console.log('═══════════════════════════════════════════════════════════════');

  const evaluator = new EvaluatorAgent({
    privateKey: CONFIG.privateKey,
    rpcUrl: CONFIG.rpcUrl,
    contractAddress: CONFIG.contractAddress,
    ipfs: {
      pinataApiKey: CONFIG.pinataApiKey,
      pinataSecretKey: CONFIG.pinataSecretKey,
    },
    llm: {
      anthropicApiKey: CONFIG.anthropicApiKey,
    },
  });

  console.log('Evaluating submissions...');
  await evaluator.manualEvaluate(bountyId);

  // Get final bounty info
  const finalInfo = await principal.getBountyInfo(bountyId);
  console.log(`\nFinal Status: ${finalInfo.status}`);
  console.log(`Winner: ${finalInfo.bounty.winner}`);
  
  // Show all scores
  console.log('\nSubmission Scores:');
  finalInfo.submissions.forEach((sub, i) => {
    console.log(`  ${i + 1}. Worker ${sub.worker.slice(0, 8)}... - Score: ${sub.score}/100`);
  });

  console.log();
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('DEMO COMPLETE');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`Bounty #${bountyId} has been completed!`);
  console.log(`Winner received ${formatETH(bountyInfo.bounty.reward)} ETH`);
}

// Run the demo
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Demo failed:', error);
    process.exit(1);
  });
