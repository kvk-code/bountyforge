import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("=".repeat(60));
  console.log("BOUNTYFORGE DEPLOYMENT");
  console.log("=".repeat(60));
  console.log("");
  console.log("Deploying contracts with account:", deployer.address);
  console.log("Account balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH");
  console.log("");

  // Deploy BountyForge
  console.log("Deploying BountyForge...");
  const BountyForge = await ethers.getContractFactory("BountyForge");
  const bountyForge = await BountyForge.deploy();
  await bountyForge.waitForDeployment();

  const address = await bountyForge.getAddress();
  console.log("BountyForge deployed to:", address);
  console.log("");

  // Verify deployment
  console.log("Verifying deployment...");
  console.log("  - Owner:", await bountyForge.owner());
  console.log("  - MIN_BOUNTY:", ethers.formatEther(await bountyForge.MIN_BOUNTY()), "ETH");
  console.log("  - MAX_SCORE:", (await bountyForge.MAX_SCORE()).toString());
  console.log("  - PROTOCOL_FEE_BPS:", (await bountyForge.PROTOCOL_FEE_BPS()).toString(), "(1%)");
  console.log("");

  console.log("=".repeat(60));
  console.log("DEPLOYMENT SUCCESSFUL");
  console.log("=".repeat(60));
  console.log("");
  console.log("Contract Address:", address);
  console.log("");
  console.log("Next steps:");
  console.log("1. Verify contract on Basescan:");
  console.log(`   npx hardhat verify --network baseSepolia ${address}`);
  console.log("");
  console.log("2. Save this address in your .env:");
  console.log(`   BOUNTYFORGE_ADDRESS=${address}`);
  console.log("=".repeat(60));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
