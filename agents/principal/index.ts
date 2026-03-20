/**
 * BountyForge Principal Agent
 * 
 * Creates bounties by uploading PDFs to IPFS and posting them on-chain.
 * This is the orchestrator that initiates the bounty workflow.
 */

import { ethers } from 'ethers';
import * as fs from 'fs';
import { IPFSClient } from '../../lib/ipfs';
import {
  BountyStatus,
  BOUNTYFORGE_ABI,
  createWallet,
  parseBounty,
  parseSubmission,
  formatETH,
  parseETH,
  type Bounty,
  type Submission,
  type AgentConfig,
} from '../../lib/contract';

export interface PrincipalConfig extends AgentConfig {
  evaluatorAddress: string;  // Address of the designated evaluator
}

export interface CreateBountyParams {
  pdfPath?: string;       // Local path to PDF file
  pdfBuffer?: Buffer;     // PDF as buffer
  pdfCID?: string;        // Already uploaded PDF CID
  reward: string;         // Reward in ETH (e.g., "0.01")
  deadlineMinutes: number; // Minutes from now until deadline
}

export interface BountyInfo {
  bountyId: bigint;
  bounty: Bounty;
  submissions: Submission[];
  status: string;
}

export class PrincipalAgent {
  private wallet: ethers.Wallet;
  private contract: ethers.Contract;
  private ipfs: IPFSClient;
  private config: PrincipalConfig;

  constructor(config: PrincipalConfig) {
    this.config = config;

    this.wallet = createWallet(config.privateKey, config.rpcUrl);
    this.contract = new ethers.Contract(
      config.contractAddress,
      BOUNTYFORGE_ABI,
      this.wallet
    );
    this.ipfs = new IPFSClient(config.ipfs);
  }

  /**
   * Get the principal's address
   */
  getAddress(): string {
    return this.wallet.address;
  }

  /**
   * Create a new bounty
   */
  async createBounty(params: CreateBountyParams): Promise<bigint> {
    console.log('[Principal] Creating new bounty...');

    // Step 1: Get PDF CID (upload if needed)
    let pdfCID: string;
    
    if (params.pdfCID) {
      pdfCID = params.pdfCID;
      console.log(`[Principal] Using existing PDF CID: ${pdfCID}`);
    } else if (params.pdfPath) {
      console.log(`[Principal] Uploading PDF from: ${params.pdfPath}`);
      const buffer = fs.readFileSync(params.pdfPath);
      const result = await this.ipfs.uploadBuffer(buffer, 'bounty.pdf', {
        name: `BountyForge PDF - ${new Date().toISOString()}`,
      });
      pdfCID = result.cid;
      console.log(`[Principal] Uploaded PDF to IPFS: ${pdfCID}`);
    } else if (params.pdfBuffer) {
      console.log('[Principal] Uploading PDF buffer...');
      const result = await this.ipfs.uploadBuffer(params.pdfBuffer, 'bounty.pdf', {
        name: `BountyForge PDF - ${new Date().toISOString()}`,
      });
      pdfCID = result.cid;
      console.log(`[Principal] Uploaded PDF to IPFS: ${pdfCID}`);
    } else {
      throw new Error('Must provide pdfPath, pdfBuffer, or pdfCID');
    }

    // Step 2: Calculate deadline
    const deadline = Math.floor(Date.now() / 1000) + (params.deadlineMinutes * 60);
    console.log(`[Principal] Deadline: ${new Date(deadline * 1000).toISOString()}`);

    // Step 3: Create bounty on-chain
    const rewardWei = parseETH(params.reward);
    console.log(`[Principal] Reward: ${params.reward} ETH (${rewardWei} wei)`);
    console.log(`[Principal] Evaluator: ${this.config.evaluatorAddress}`);

    const tx = await this.contract.createBounty(
      pdfCID,
      this.config.evaluatorAddress,
      deadline,
      { value: rewardWei }
    );
    console.log(`[Principal] Transaction sent: ${tx.hash}`);

    const receipt = await tx.wait();
    console.log(`[Principal] Transaction confirmed in block ${receipt?.blockNumber}`);

    // Extract bounty ID from event
    const event = receipt?.logs
      .map((log: any) => {
        try {
          return this.contract.interface.parseLog({ topics: log.topics as string[], data: log.data });
        } catch {
          return null;
        }
      })
      .find((parsed: any) => parsed?.name === 'BountyCreated');

    const bountyId = event?.args?.[0] || 0n;
    console.log(`[Principal] Created bounty #${bountyId}`);

    return bountyId;
  }

  /**
   * Get information about a bounty
   */
  async getBountyInfo(bountyId: bigint): Promise<BountyInfo> {
    const rawBounty = await this.contract.getBounty(bountyId);
    const bounty = parseBounty(rawBounty);

    const submissionCount = await this.contract.getSubmissionCount(bountyId);
    const submissions: Submission[] = [];

    for (let i = 0n; i < submissionCount; i++) {
      const rawSubmission = await this.contract.getSubmission(bountyId, i);
      submissions.push(parseSubmission(rawSubmission));
    }

    const statusNames = ['Open', 'Evaluating', 'Completed', 'Cancelled'];

    return {
      bountyId,
      bounty,
      submissions,
      status: statusNames[bounty.status] || 'Unknown',
    };
  }

  /**
   * List all bounties created by this principal
   */
  async listMyBounties(): Promise<BountyInfo[]> {
    const bountyCount = await this.contract.bountyCount();
    const myBounties: BountyInfo[] = [];

    for (let i = 0n; i < bountyCount; i++) {
      const info = await this.getBountyInfo(i);
      if (info.bounty.principal.toLowerCase() === this.wallet.address.toLowerCase()) {
        myBounties.push(info);
      }
    }

    return myBounties;
  }

  /**
   * Cancel a bounty (only if no submissions yet)
   */
  async cancelBounty(bountyId: bigint): Promise<void> {
    console.log(`[Principal] Cancelling bounty #${bountyId}...`);

    const tx = await this.contract.cancelBounty(bountyId);
    console.log(`[Principal] Transaction sent: ${tx.hash}`);

    const receipt = await tx.wait();
    console.log(`[Principal] Bounty cancelled in block ${receipt?.blockNumber}`);
  }

  /**
   * Get principal's ETH balance
   */
  async getBalance(): Promise<string> {
    const balance = await this.wallet.provider?.getBalance(this.wallet.address);
    return formatETH(balance || 0n);
  }

  /**
   * Watch for bounty events
   */
  watchBounty(bountyId: bigint, callbacks: {
    onSubmission?: (worker: string, markdownCID: string) => void;
    onEvaluation?: (winner: string, score: bigint) => void;
    onDistribution?: (winner: string, amount: bigint) => void;
  }): void {
    const filter = this.contract.filters.WorkSubmitted(bountyId);
    this.contract.on(filter, (_, worker, markdownCID) => {
      callbacks.onSubmission?.(worker, markdownCID);
    });

    const evalFilter = this.contract.filters.EvaluationComplete(bountyId);
    this.contract.on(evalFilter, (_, winner, score) => {
      callbacks.onEvaluation?.(winner, score);
    });

    const distFilter = this.contract.filters.BountyDistributed(bountyId);
    this.contract.on(distFilter, (_, winner, amount) => {
      callbacks.onDistribution?.(winner, amount);
    });
  }

  /**
   * Stop watching events
   */
  stopWatching(): void {
    this.contract.removeAllListeners();
  }
}

/**
 * Create a principal agent
 */
export function createPrincipal(config: PrincipalConfig): PrincipalAgent {
  return new PrincipalAgent(config);
}

// CLI entry point
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  const config: PrincipalConfig = {
    privateKey: process.env.PRINCIPAL_PRIVATE_KEY || process.env.PRIVATE_KEY || '',
    rpcUrl: process.env.RPC_URL || 'https://sepolia.base.org',
    contractAddress: process.env.CONTRACT_ADDRESS || '',
    evaluatorAddress: process.env.EVALUATOR_ADDRESS || '',
    ipfs: {
      pinataApiKey: process.env.PINATA_API_KEY,
      pinataSecretKey: process.env.PINATA_SECRET_KEY,
    },
  };

  if (!config.privateKey || !config.contractAddress) {
    console.error('Missing required environment variables:');
    console.error('  PRINCIPAL_PRIVATE_KEY or PRIVATE_KEY');
    console.error('  CONTRACT_ADDRESS');
    console.error('  EVALUATOR_ADDRESS');
    process.exit(1);
  }

  const principal = new PrincipalAgent(config);

  async function main() {
    switch (command) {
      case 'create':
        const pdfPath = args[1];
        const reward = args[2] || '0.01';
        const deadline = parseInt(args[3] || '60');
        
        if (!pdfPath) {
          console.error('Usage: create <pdf-path> [reward-eth] [deadline-minutes]');
          process.exit(1);
        }

        const bountyId = await principal.createBounty({
          pdfPath,
          reward,
          deadlineMinutes: deadline,
        });
        console.log(`Created bounty #${bountyId}`);
        break;

      case 'info':
        const id = BigInt(args[1] || '0');
        const info = await principal.getBountyInfo(id);
        console.log(JSON.stringify(info, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2));
        break;

      case 'list':
        const bounties = await principal.listMyBounties();
        console.log(`Found ${bounties.length} bounties`);
        bounties.forEach(b => {
          console.log(`  #${b.bountyId}: ${b.status} - ${formatETH(b.bounty.reward)} ETH`);
        });
        break;

      case 'balance':
        const balance = await principal.getBalance();
        console.log(`Balance: ${balance} ETH`);
        break;

      default:
        console.log('Commands: create, info, list, balance');
    }
  }

  main().catch(console.error);
}

export default PrincipalAgent;
