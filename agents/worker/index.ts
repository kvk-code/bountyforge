/**
 * BountyForge Worker Agent
 * 
 * Listens for new bounties, downloads PDFs, converts to Markdown,
 * and submits work to the smart contract.
 */

import { ethers } from 'ethers';
import { IPFSClient } from '../../lib/ipfs';
import { LLMClient } from '../../lib/llm';
import { parsePDFBuffer } from '../../lib/pdf';
import {
  BountyStatus,
  BOUNTYFORGE_ABI,
  createWallet,
  parseBounty,
  formatETH,
  isBountyOpen,
  type Bounty,
  type AgentConfig,
} from '../../lib/contract';

export interface WorkerConfig extends AgentConfig {
  pollInterval?: number;  // ms between checking for new bounties
  maxConcurrentJobs?: number;
  minReward?: string;     // Minimum reward in ETH to accept
}

export class WorkerAgent {
  private wallet: ethers.Wallet;
  private contract: ethers.Contract;
  private ipfs: IPFSClient;
  private llm: LLMClient;
  private config: WorkerConfig;
  private isRunning: boolean = false;
  private processedBounties: Set<string> = new Set();

  constructor(config: WorkerConfig) {
    this.config = {
      pollInterval: 10000,  // 10 seconds
      maxConcurrentJobs: 3,
      minReward: '0.001',   // 0.001 ETH minimum
      ...config,
    };

    this.wallet = createWallet(config.privateKey, config.rpcUrl);
    this.contract = new ethers.Contract(
      config.contractAddress,
      BOUNTYFORGE_ABI,
      this.wallet
    );
    this.ipfs = new IPFSClient(config.ipfs);
    this.llm = new LLMClient(config.llm);
  }

  /**
   * Get the worker's address
   */
  getAddress(): string {
    return this.wallet.address;
  }

  /**
   * Start the worker agent
   */
  async start(): Promise<void> {
    this.isRunning = true;
    console.log(`[Worker] Starting worker agent: ${this.wallet.address}`);
    console.log(`[Worker] Contract: ${this.config.contractAddress}`);
    console.log(`[Worker] Min reward: ${this.config.minReward} ETH`);

    // Listen for new bounties via events
    this.contract.on('BountyCreated', async (bountyId, pdfCID, reward, deadline) => {
      console.log(`[Worker] New bounty detected: #${bountyId}`);
      await this.handleNewBounty(bountyId);
    });

    // Also poll for existing bounties on startup
    await this.scanExistingBounties();

    // Keep polling for bounties we might have missed
    this.pollLoop();
  }

  /**
   * Stop the worker agent
   */
  stop(): void {
    this.isRunning = false;
    this.contract.removeAllListeners();
    console.log('[Worker] Stopped');
  }

  /**
   * Scan for existing open bounties
   */
  private async scanExistingBounties(): Promise<void> {
    console.log('[Worker] Scanning for existing bounties...');
    
    try {
      const bountyCount = await this.contract.bountyCount();
      console.log(`[Worker] Total bounties: ${bountyCount}`);

      for (let i = 0n; i < bountyCount; i++) {
        if (!this.isRunning) break;
        await this.handleNewBounty(i);
      }
    } catch (error) {
      console.error('[Worker] Error scanning bounties:', error);
    }
  }

  /**
   * Poll loop for checking bounties
   */
  private async pollLoop(): Promise<void> {
    while (this.isRunning) {
      await new Promise(resolve => setTimeout(resolve, this.config.pollInterval));
      await this.scanExistingBounties();
    }
  }

  /**
   * Handle a new bounty
   */
  private async handleNewBounty(bountyId: bigint): Promise<void> {
    const bountyKey = bountyId.toString();
    
    // Skip if already processed
    if (this.processedBounties.has(bountyKey)) {
      return;
    }

    try {
      // Get bounty details
      const rawBounty = await this.contract.getBounty(bountyId);
      const bounty = parseBounty(rawBounty);

      // Check if bounty is valid for us
      if (!this.shouldAcceptBounty(bounty)) {
        console.log(`[Worker] Skipping bounty #${bountyId} (not accepting)`);
        return;
      }

      console.log(`[Worker] Processing bounty #${bountyId}`);
      console.log(`[Worker]   PDF CID: ${bounty.pdfCID}`);
      console.log(`[Worker]   Reward: ${formatETH(bounty.reward)} ETH`);

      // Mark as being processed
      this.processedBounties.add(bountyKey);

      // Do the work
      await this.processBounty(bountyId, bounty);

    } catch (error) {
      console.error(`[Worker] Error handling bounty #${bountyId}:`, error);
    }
  }

  /**
   * Check if we should accept this bounty
   */
  private shouldAcceptBounty(bounty: Bounty): boolean {
    // Must be open
    if (!isBountyOpen(bounty)) {
      return false;
    }

    // Must meet minimum reward
    const minReward = ethers.parseEther(this.config.minReward || '0');
    if (bounty.reward < minReward) {
      return false;
    }

    return true;
  }

  /**
   * Process a bounty: download PDF, convert, upload, submit
   */
  private async processBounty(bountyId: bigint, bounty: Bounty): Promise<void> {
    const startTime = Date.now();

    try {
      // Step 1: Download PDF from IPFS
      console.log(`[Worker] Downloading PDF from IPFS: ${bounty.pdfCID}`);
      const pdfBuffer = await this.ipfs.fetch(bounty.pdfCID);
      console.log(`[Worker] Downloaded ${pdfBuffer.length} bytes`);

      // Step 2: Parse PDF to extract text
      console.log('[Worker] Parsing PDF...');
      const pdfContent = await parsePDFBuffer(pdfBuffer);
      console.log(`[Worker] Extracted ${pdfContent.text.length} chars from ${pdfContent.pageCount} pages`);

      // Step 3: Convert to Markdown using LLM
      console.log('[Worker] Converting to Markdown via LLM...');
      const conversion = await this.llm.convertPDFToMarkdown('', {
        extractedText: pdfContent.text,
      });
      console.log(`[Worker] Generated ${conversion.markdown.length} chars of Markdown`);

      // Step 4: Upload Markdown to IPFS
      console.log('[Worker] Uploading Markdown to IPFS...');
      const uploadResult = await this.ipfs.uploadString(
        conversion.markdown,
        `bounty-${bountyId}-${this.wallet.address.slice(0, 8)}.md`,
        {
          name: `BountyForge Submission #${bountyId}`,
          keyvalues: {
            bountyId: bountyId.toString(),
            worker: this.wallet.address,
          },
        }
      );
      console.log(`[Worker] Uploaded to IPFS: ${uploadResult.cid}`);

      // Step 5: Submit work to contract
      console.log('[Worker] Submitting work to contract...');
      const tx = await this.contract.submitWork(bountyId, uploadResult.cid);
      console.log(`[Worker] Transaction sent: ${tx.hash}`);
      
      const receipt = await tx.wait();
      console.log(`[Worker] Transaction confirmed in block ${receipt?.blockNumber}`);

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`[Worker] Completed bounty #${bountyId} in ${elapsed}s`);

    } catch (error) {
      console.error(`[Worker] Failed to process bounty #${bountyId}:`, error);
      // Remove from processed so we can retry later
      this.processedBounties.delete(bountyId.toString());
      throw error;
    }
  }

  /**
   * Manually submit work for a bounty
   */
  async submitWork(bountyId: bigint, markdownCID: string): Promise<string> {
    const tx = await this.contract.submitWork(bountyId, markdownCID);
    const receipt = await tx.wait();
    return tx.hash;
  }

  /**
   * Get worker's ETH balance
   */
  async getBalance(): Promise<string> {
    const balance = await this.wallet.provider?.getBalance(this.wallet.address);
    return formatETH(balance || 0n);
  }
}

/**
 * Create and start a worker agent
 */
export async function startWorker(config: WorkerConfig): Promise<WorkerAgent> {
  const worker = new WorkerAgent(config);
  await worker.start();
  return worker;
}

// CLI entry point
if (require.main === module) {
  const config: WorkerConfig = {
    privateKey: process.env.WORKER_PRIVATE_KEY || process.env.PRIVATE_KEY || '',
    rpcUrl: process.env.RPC_URL || 'https://sepolia.base.org',
    contractAddress: process.env.CONTRACT_ADDRESS || '',
    ipfs: {
      pinataApiKey: process.env.PINATA_API_KEY,
      pinataSecretKey: process.env.PINATA_SECRET_KEY,
    },
    llm: {
      anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    },
  };

  if (!config.privateKey || !config.contractAddress) {
    console.error('Missing required environment variables:');
    console.error('  WORKER_PRIVATE_KEY or PRIVATE_KEY');
    console.error('  CONTRACT_ADDRESS');
    process.exit(1);
  }

  startWorker(config).catch(console.error);
}

export default WorkerAgent;
