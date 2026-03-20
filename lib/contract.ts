/**
 * Shared Types and Contract Interface for BountyForge Agents
 */

import { ethers } from 'ethers';

// Bounty status enum (mirrors contract)
export enum BountyStatus {
  Open = 0,
  Evaluating = 1,
  Completed = 2,
  Cancelled = 3,
}

// Bounty structure (mirrors contract)
export interface Bounty {
  principal: string;
  pdfCID: string;
  reward: bigint;
  deadline: bigint;
  evaluator: string;
  status: BountyStatus;
  winner: string;
}

// Submission structure (mirrors contract)
export interface Submission {
  worker: string;
  markdownCID: string;
  timestamp: bigint;
  score: bigint;
}

// Event types
export interface BountyCreatedEvent {
  bountyId: bigint;
  pdfCID: string;
  reward: bigint;
  deadline: bigint;
}

export interface WorkSubmittedEvent {
  bountyId: bigint;
  worker: string;
  markdownCID: string;
}

export interface EvaluationCompleteEvent {
  bountyId: bigint;
  winner: string;
  score: bigint;
}

export interface BountyDistributedEvent {
  bountyId: bigint;
  winner: string;
  amount: bigint;
}

// Agent configuration
export interface AgentConfig {
  privateKey: string;
  rpcUrl: string;
  contractAddress: string;
  ipfs?: {
    pinataApiKey?: string;
    pinataSecretKey?: string;
  };
  llm?: {
    anthropicApiKey?: string;
  };
}

// Contract ABI (minimal, for agents)
export const BOUNTYFORGE_ABI = [
  // View functions
  'function bountyCount() view returns (uint256)',
  'function getBounty(uint256 bountyId) view returns (tuple(address principal, string pdfCID, uint256 reward, uint256 deadline, address evaluator, uint8 status, address winner))',
  'function getSubmission(uint256 bountyId, uint256 index) view returns (tuple(address worker, string markdownCID, uint256 timestamp, uint256 score))',
  'function getSubmissionCount(uint256 bountyId) view returns (uint256)',
  'function protocolFeePercent() view returns (uint256)',
  'function owner() view returns (address)',
  
  // State-changing functions
  'function createBounty(string pdfCID, address evaluator, uint256 deadline) payable returns (uint256)',
  'function submitWork(uint256 bountyId, string markdownCID)',
  'function submitEvaluation(uint256 bountyId, uint256[] scores)',
  'function cancelBounty(uint256 bountyId)',
  'function pause()',
  'function unpause()',
  
  // Events
  'event BountyCreated(uint256 indexed bountyId, string pdfCID, uint256 reward, uint256 deadline)',
  'event WorkSubmitted(uint256 indexed bountyId, address indexed worker, string markdownCID)',
  'event EvaluationComplete(uint256 indexed bountyId, address indexed winner, uint256 score)',
  'event BountyDistributed(uint256 indexed bountyId, address indexed winner, uint256 amount)',
  'event BountyCancelled(uint256 indexed bountyId)',
];

/**
 * Create a contract instance
 */
export function createContract(
  address: string,
  signerOrProvider: ethers.Signer | ethers.Provider
): ethers.Contract {
  return new ethers.Contract(address, BOUNTYFORGE_ABI, signerOrProvider);
}

/**
 * Create a wallet from private key
 */
export function createWallet(
  privateKey: string,
  rpcUrl: string
): ethers.Wallet {
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  return new ethers.Wallet(privateKey, provider);
}

/**
 * Parse bounty from contract return value
 */
export function parseBounty(raw: any): Bounty {
  return {
    principal: raw[0] || raw.principal,
    pdfCID: raw[1] || raw.pdfCID,
    reward: BigInt(raw[2] || raw.reward),
    deadline: BigInt(raw[3] || raw.deadline),
    evaluator: raw[4] || raw.evaluator,
    status: Number(raw[5] || raw.status) as BountyStatus,
    winner: raw[6] || raw.winner,
  };
}

/**
 * Parse submission from contract return value
 */
export function parseSubmission(raw: any): Submission {
  return {
    worker: raw[0] || raw.worker,
    markdownCID: raw[1] || raw.markdownCID,
    timestamp: BigInt(raw[2] || raw.timestamp),
    score: BigInt(raw[3] || raw.score),
  };
}

/**
 * Format ETH amount for display
 */
export function formatETH(wei: bigint): string {
  return ethers.formatEther(wei);
}

/**
 * Parse ETH amount from string
 */
export function parseETH(eth: string): bigint {
  return ethers.parseEther(eth);
}

/**
 * Check if bounty is open for submissions
 */
export function isBountyOpen(bounty: Bounty): boolean {
  return bounty.status === BountyStatus.Open && 
         BigInt(Date.now()) / 1000n < bounty.deadline;
}

/**
 * Check if bounty is ready for evaluation
 */
export function isBountyReadyForEvaluation(bounty: Bounty): boolean {
  return bounty.status === BountyStatus.Open && 
         BigInt(Date.now()) / 1000n >= bounty.deadline;
}

// Network configurations
export const NETWORKS = {
  baseSepolia: {
    chainId: 84532,
    name: 'Base Sepolia',
    rpcUrl: 'https://sepolia.base.org',
    explorer: 'https://sepolia.basescan.org',
  },
  baseMainnet: {
    chainId: 8453,
    name: 'Base',
    rpcUrl: 'https://mainnet.base.org',
    explorer: 'https://basescan.org',
  },
};

export default {
  BountyStatus,
  BOUNTYFORGE_ABI,
  NETWORKS,
  createContract,
  createWallet,
  parseBounty,
  parseSubmission,
  formatETH,
  parseETH,
  isBountyOpen,
  isBountyReadyForEvaluation,
};
