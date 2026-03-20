/**
 * BountyForge Evaluator Agent
 * 
 * Monitors bounties past deadline, evaluates all submissions using LLM,
 * and submits scores to the smart contract to trigger payout.
 */

import { ethers } from 'ethers';
import { IPFSClient } from '../../lib/ipfs';
import { LLMClient, EvaluationScore } from '../../lib/llm';
import { parsePDFBuffer } from '../../lib/pdf';
import {
  BountyStatus,
  BOUNTYFORGE_ABI,
  createWallet,
  parseBounty,
  parseSubmission,
  formatETH,
  isBountyReadyForEvaluation,
  type Bounty,
  type Submission,
  type AgentConfig,
} from '../../lib/contract';

export interface EvaluatorConfig extends AgentConfig {
  pollInterval?: number;  // ms between checking for evaluatable bounties
}

interface SubmissionWithScore {
  index: number;
  submission: Submission;
  markdown: string;
  score: EvaluationScore;
}

export class EvaluatorAgent {
  private wallet: ethers.Wallet;
  private contract: ethers.Contract;
  private ipfs: IPFSClient;
  private llm: LLMClient;
  private config: EvaluatorConfig;
  private isRunning: boolean = false;
  private evaluatedBounties: Set<string> = new Set();

  constructor(config: EvaluatorConfig) {
    this.config = {
      pollInterval: 15000,  // 15 seconds
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
   * Get the evaluator's address
   */
  getAddress(): string {
    return this.wallet.address;
  }

  /**
   * Start the evaluator agent
   */
  async start(): Promise<void> {
    this.isRunning = true;
    console.log(`[Evaluator] Starting evaluator agent: ${this.wallet.address}`);
    console.log(`[Evaluator] Contract: ${this.config.contractAddress}`);

    // Start polling for bounties to evaluate
    this.pollLoop();
  }

  /**
   * Stop the evaluator agent
   */
  stop(): void {
    this.isRunning = false;
    console.log('[Evaluator] Stopped');
  }

  /**
   * Poll loop for checking bounties
   */
  private async pollLoop(): Promise<void> {
    while (this.isRunning) {
      try {
        await this.scanForEvaluatableBounties();
      } catch (error) {
        console.error('[Evaluator] Error in poll loop:', error);
      }
      await new Promise(resolve => setTimeout(resolve, this.config.pollInterval));
    }
  }

  /**
   * Scan for bounties that are past deadline and ready for evaluation
   */
  private async scanForEvaluatableBounties(): Promise<void> {
    try {
      const bountyCount = await this.contract.bountyCount();

      for (let i = 0n; i < bountyCount; i++) {
        if (!this.isRunning) break;

        const bountyKey = i.toString();
        if (this.evaluatedBounties.has(bountyKey)) continue;

        const rawBounty = await this.contract.getBounty(i);
        const bounty = parseBounty(rawBounty);

        // Check if this bounty is for us and ready for evaluation
        if (this.shouldEvaluate(bounty)) {
          console.log(`[Evaluator] Found bounty #${i} ready for evaluation`);
          await this.evaluateBounty(i, bounty);
          this.evaluatedBounties.add(bountyKey);
        }
      }
    } catch (error) {
      console.error('[Evaluator] Error scanning bounties:', error);
    }
  }

  /**
   * Check if this evaluator should evaluate the bounty
   */
  private shouldEvaluate(bounty: Bounty): boolean {
    // Must be assigned to us
    if (bounty.evaluator.toLowerCase() !== this.wallet.address.toLowerCase()) {
      return false;
    }

    // Must be ready for evaluation (past deadline, still open)
    return isBountyReadyForEvaluation(bounty);
  }

  /**
   * Evaluate all submissions for a bounty
   */
  private async evaluateBounty(bountyId: bigint, bounty: Bounty): Promise<void> {
    const startTime = Date.now();
    console.log(`[Evaluator] Evaluating bounty #${bountyId}`);

    try {
      // Step 1: Get submission count
      const submissionCount = await this.contract.getSubmissionCount(bountyId);
      console.log(`[Evaluator] Found ${submissionCount} submissions`);

      if (submissionCount === 0n) {
        console.log(`[Evaluator] No submissions for bounty #${bountyId}, skipping`);
        return;
      }

      // Step 2: Download original PDF
      console.log(`[Evaluator] Downloading original PDF: ${bounty.pdfCID}`);
      const pdfBuffer = await this.ipfs.fetch(bounty.pdfCID);
      const pdfContent = await parsePDFBuffer(pdfBuffer);
      console.log(`[Evaluator] Parsed PDF: ${pdfContent.text.length} chars`);

      // Step 3: Download and evaluate each submission
      const submissions: SubmissionWithScore[] = [];

      for (let i = 0n; i < submissionCount; i++) {
        const rawSubmission = await this.contract.getSubmission(bountyId, i);
        const submission = parseSubmission(rawSubmission);

        console.log(`[Evaluator] Evaluating submission ${i} from ${submission.worker}`);
        console.log(`[Evaluator]   Markdown CID: ${submission.markdownCID}`);

        try {
          // Download markdown
          const markdown = await this.ipfs.fetchString(submission.markdownCID);
          console.log(`[Evaluator]   Downloaded ${markdown.length} chars`);

          // Score using LLM
          const score = await this.llm.evaluateConversion(pdfContent.text, markdown);
          console.log(`[Evaluator]   Score: ${score.total}/100`);
          console.log(`[Evaluator]   Feedback: ${score.feedback}`);

          submissions.push({
            index: Number(i),
            submission,
            markdown,
            score,
          });
        } catch (error) {
          console.error(`[Evaluator]   Failed to evaluate submission ${i}:`, error);
          // Give a score of 0 for failed evaluations
          submissions.push({
            index: Number(i),
            submission,
            markdown: '',
            score: {
              formatting: 0,
              completeness: 0,
              structure: 0,
              readability: 0,
              total: 0,
              feedback: 'Failed to evaluate: ' + (error as Error).message,
            },
          });
        }
      }

      // Step 4: Prepare scores array for contract
      const scores = submissions
        .sort((a, b) => a.index - b.index)  // Ensure order matches contract
        .map(s => BigInt(s.score.total));

      console.log(`[Evaluator] Submitting evaluation scores: [${scores.join(', ')}]`);

      // Step 5: Submit evaluation to contract
      const tx = await this.contract.submitEvaluation(bountyId, scores);
      console.log(`[Evaluator] Transaction sent: ${tx.hash}`);

      const receipt = await tx.wait();
      console.log(`[Evaluator] Transaction confirmed in block ${receipt?.blockNumber}`);

      // Log winner
      const winnerIndex = submissions.reduce((maxIdx, s, idx, arr) =>
        s.score.total > arr[maxIdx].score.total ? idx : maxIdx, 0);
      const winner = submissions[winnerIndex];
      
      console.log(`[Evaluator] Winner: ${winner.submission.worker}`);
      console.log(`[Evaluator]   Score: ${winner.score.total}/100`);
      console.log(`[Evaluator]   Reward: ${formatETH(bounty.reward)} ETH`);

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`[Evaluator] Completed evaluation for bounty #${bountyId} in ${elapsed}s`);

    } catch (error) {
      console.error(`[Evaluator] Failed to evaluate bounty #${bountyId}:`, error);
      throw error;
    }
  }

  /**
   * Manually trigger evaluation for a specific bounty
   */
  async manualEvaluate(bountyId: bigint): Promise<void> {
    const rawBounty = await this.contract.getBounty(bountyId);
    const bounty = parseBounty(rawBounty);
    await this.evaluateBounty(bountyId, bounty);
  }

  /**
   * Get evaluator's ETH balance
   */
  async getBalance(): Promise<string> {
    const balance = await this.wallet.provider?.getBalance(this.wallet.address);
    return formatETH(balance || 0n);
  }
}

/**
 * Create and start an evaluator agent
 */
export async function startEvaluator(config: EvaluatorConfig): Promise<EvaluatorAgent> {
  const evaluator = new EvaluatorAgent(config);
  await evaluator.start();
  return evaluator;
}

// CLI entry point
if (require.main === module) {
  const config: EvaluatorConfig = {
    privateKey: process.env.EVALUATOR_PRIVATE_KEY || process.env.PRIVATE_KEY || '',
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
    console.error('  EVALUATOR_PRIVATE_KEY or PRIVATE_KEY');
    console.error('  CONTRACT_ADDRESS');
    process.exit(1);
  }

  startEvaluator(config).catch(console.error);
}

export default EvaluatorAgent;
