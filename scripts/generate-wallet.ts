/**
 * Generate a new deployment wallet for BountyForge
 * 
 * CRITICAL: Save the private key securely and NEVER commit to git!
 */

import { ethers } from "ethers";

const wallet = ethers.Wallet.createRandom();

console.log("=".repeat(60));
console.log("BOUNTYFORGE DEPLOYMENT WALLET");
console.log("=".repeat(60));
console.log("");
console.log("Address:", wallet.address);
console.log("");
console.log("Private Key:", wallet.privateKey);
console.log("");
console.log("Mnemonic:", wallet.mnemonic?.phrase);
console.log("");
console.log("=".repeat(60));
console.log("NEXT STEPS:");
console.log("1. Save the private key to .env as PRIVATE_KEY=<key>");
console.log("2. Get Base Sepolia ETH from: https://www.alchemy.com/faucets/base-sepolia");
console.log("3. NEVER commit .env or private keys to git!");
console.log("=".repeat(60));
