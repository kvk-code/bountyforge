import { expect } from "chai";
import { ethers } from "hardhat";
import { BountyForge } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("BountyForge", function () {
  let bountyForge: BountyForge;
  let owner: HardhatEthersSigner;
  let principal: HardhatEthersSigner;
  let worker1: HardhatEthersSigner;
  let worker2: HardhatEthersSigner;
  let evaluator: HardhatEthersSigner;

  const PDF_CID = "QmTest123PDFContent";
  const MARKDOWN_CID_1 = "QmWorker1MarkdownResult";
  const MARKDOWN_CID_2 = "QmWorker2MarkdownResult";
  const BOUNTY_AMOUNT = ethers.parseEther("0.1");
  const MIN_BOUNTY = ethers.parseEther("0.0001");

  beforeEach(async function () {
    [owner, principal, worker1, worker2, evaluator] = await ethers.getSigners();

    const BountyForgeFactory = await ethers.getContractFactory("BountyForge");
    bountyForge = await BountyForgeFactory.deploy();
    await bountyForge.waitForDeployment();
  });

  describe("Deployment", function () {
    it("Should set the correct owner", async function () {
      expect(await bountyForge.owner()).to.equal(owner.address);
    });

    it("Should have correct constants", async function () {
      expect(await bountyForge.MAX_SCORE()).to.equal(100);
      expect(await bountyForge.MIN_BOUNTY()).to.equal(MIN_BOUNTY);
      expect(await bountyForge.PROTOCOL_FEE_BPS()).to.equal(100);
    });

    it("Should start with zero bounty count", async function () {
      expect(await bountyForge.bountyCount()).to.equal(0);
    });
  });

  describe("Create Bounty", function () {
    it("Should create a bounty successfully", async function () {
      const deadline = (await time.latest()) + 3600; // 1 hour from now

      const tx = await bountyForge.connect(principal).createBounty(PDF_CID, evaluator.address, deadline, {
        value: BOUNTY_AMOUNT,
      });

      await expect(tx).to.emit(bountyForge, "BountyCreated");

      expect(await bountyForge.bountyCount()).to.equal(1);

      const bounty = await bountyForge.getBounty(0);
      expect(bounty.principal).to.equal(principal.address);
      expect(bounty.pdfCID).to.equal(PDF_CID);
      expect(bounty.evaluator).to.equal(evaluator.address);
      expect(bounty.status).to.equal(0); // Open
    });

    it("Should calculate protocol fee correctly (1%)", async function () {
      const deadline = (await time.latest()) + 3600;

      await bountyForge.connect(principal).createBounty(PDF_CID, evaluator.address, deadline, {
        value: BOUNTY_AMOUNT,
      });

      const bounty = await bountyForge.getBounty(0);
      const expectedReward = BOUNTY_AMOUNT - (BOUNTY_AMOUNT * 100n) / 10000n; // 1% fee
      expect(bounty.reward).to.equal(expectedReward);
    });

    it("Should revert with insufficient bounty", async function () {
      const deadline = (await time.latest()) + 3600;
      const tooSmall = ethers.parseEther("0.00001");

      await expect(
        bountyForge.connect(principal).createBounty(PDF_CID, evaluator.address, deadline, {
          value: tooSmall,
        })
      ).to.be.revertedWithCustomError(bountyForge, "InsufficientBounty");
    });

    it("Should revert with invalid deadline (past)", async function () {
      const pastDeadline = (await time.latest()) - 100;

      await expect(
        bountyForge.connect(principal).createBounty(PDF_CID, evaluator.address, pastDeadline, {
          value: BOUNTY_AMOUNT,
        })
      ).to.be.revertedWithCustomError(bountyForge, "InvalidDeadline");
    });

    it("Should revert with zero evaluator address", async function () {
      const deadline = (await time.latest()) + 3600;

      await expect(
        bountyForge.connect(principal).createBounty(PDF_CID, ethers.ZeroAddress, deadline, {
          value: BOUNTY_AMOUNT,
        })
      ).to.be.revertedWithCustomError(bountyForge, "InvalidEvaluator");
    });

    it("Should revert with empty CID", async function () {
      const deadline = (await time.latest()) + 3600;

      await expect(
        bountyForge.connect(principal).createBounty("", evaluator.address, deadline, {
          value: BOUNTY_AMOUNT,
        })
      ).to.be.revertedWithCustomError(bountyForge, "InvalidCID");
    });
  });

  describe("Submit Work", function () {
    let deadline: number;

    beforeEach(async function () {
      deadline = (await time.latest()) + 3600;
      await bountyForge.connect(principal).createBounty(PDF_CID, evaluator.address, deadline, {
        value: BOUNTY_AMOUNT,
      });
    });

    it("Should submit work successfully", async function () {
      await expect(bountyForge.connect(worker1).submitWork(0, MARKDOWN_CID_1))
        .to.emit(bountyForge, "WorkSubmitted")
        .withArgs(0, worker1.address, 0, MARKDOWN_CID_1);

      const submission = await bountyForge.getSubmission(0, 0);
      expect(submission.worker).to.equal(worker1.address);
      expect(submission.markdownCID).to.equal(MARKDOWN_CID_1);
      expect(submission.score).to.equal(0);
      expect(submission.evaluated).to.equal(false);
    });

    it("Should allow multiple workers to submit", async function () {
      await bountyForge.connect(worker1).submitWork(0, MARKDOWN_CID_1);
      await bountyForge.connect(worker2).submitWork(0, MARKDOWN_CID_2);

      expect(await bountyForge.getSubmissionCount(0)).to.equal(2);

      const submissions = await bountyForge.getSubmissions(0);
      expect(submissions.length).to.equal(2);
    });

    it("Should revert if same worker submits twice", async function () {
      await bountyForge.connect(worker1).submitWork(0, MARKDOWN_CID_1);

      await expect(
        bountyForge.connect(worker1).submitWork(0, "QmDifferentCID")
      ).to.be.revertedWithCustomError(bountyForge, "AlreadySubmitted");
    });

    it("Should revert after deadline", async function () {
      await time.increaseTo(deadline + 1);

      await expect(
        bountyForge.connect(worker1).submitWork(0, MARKDOWN_CID_1)
      ).to.be.revertedWithCustomError(bountyForge, "DeadlinePassed");
    });

    it("Should revert with empty CID", async function () {
      await expect(
        bountyForge.connect(worker1).submitWork(0, "")
      ).to.be.revertedWithCustomError(bountyForge, "InvalidCID");
    });
  });

  describe("Submit Evaluation", function () {
    let deadline: number;

    beforeEach(async function () {
      deadline = (await time.latest()) + 3600;
      await bountyForge.connect(principal).createBounty(PDF_CID, evaluator.address, deadline, {
        value: BOUNTY_AMOUNT,
      });
      await bountyForge.connect(worker1).submitWork(0, MARKDOWN_CID_1);
      await bountyForge.connect(worker2).submitWork(0, MARKDOWN_CID_2);
    });

    it("Should evaluate and pay winner correctly", async function () {
      await time.increaseTo(deadline + 1);

      const worker1BalanceBefore = await ethers.provider.getBalance(worker1.address);
      const bounty = await bountyForge.getBounty(0);

      await expect(bountyForge.connect(evaluator).submitEvaluation(0, [85, 70]))
        .to.emit(bountyForge, "EvaluationComplete")
        .withArgs(0, worker1.address, 85, bounty.reward)
        .and.to.emit(bountyForge, "BountyDistributed")
        .withArgs(0, worker1.address, bounty.reward);

      const worker1BalanceAfter = await ethers.provider.getBalance(worker1.address);
      expect(worker1BalanceAfter - worker1BalanceBefore).to.equal(bounty.reward);

      const finalBounty = await bountyForge.getBounty(0);
      expect(finalBounty.status).to.equal(2); // Completed
      expect(finalBounty.winner).to.equal(worker1.address);
      expect(finalBounty.winningScore).to.equal(85);
    });

    it("Should pick correct winner when second worker scores higher", async function () {
      await time.increaseTo(deadline + 1);

      await bountyForge.connect(evaluator).submitEvaluation(0, [70, 95]);

      const bounty = await bountyForge.getBounty(0);
      expect(bounty.winner).to.equal(worker2.address);
      expect(bounty.winningScore).to.equal(95);
    });

    it("Should revert if not evaluator", async function () {
      await time.increaseTo(deadline + 1);

      await expect(
        bountyForge.connect(worker1).submitEvaluation(0, [85, 70])
      ).to.be.revertedWithCustomError(bountyForge, "NotEvaluator");
    });

    it("Should revert before deadline", async function () {
      await expect(
        bountyForge.connect(evaluator).submitEvaluation(0, [85, 70])
      ).to.be.revertedWithCustomError(bountyForge, "DeadlineNotPassed");
    });

    it("Should revert with wrong scores array length", async function () {
      await time.increaseTo(deadline + 1);

      await expect(
        bountyForge.connect(evaluator).submitEvaluation(0, [85])
      ).to.be.revertedWithCustomError(bountyForge, "InvalidScoresLength");
    });

    it("Should revert if score exceeds MAX_SCORE", async function () {
      await time.increaseTo(deadline + 1);

      await expect(
        bountyForge.connect(evaluator).submitEvaluation(0, [101, 70])
      ).to.be.revertedWithCustomError(bountyForge, "ScoreTooHigh");
    });
  });

  describe("Cancel Bounty", function () {
    let deadline: number;

    beforeEach(async function () {
      deadline = (await time.latest()) + 3600;
      await bountyForge.connect(principal).createBounty(PDF_CID, evaluator.address, deadline, {
        value: BOUNTY_AMOUNT,
      });
    });

    it("Should cancel and refund if no submissions", async function () {
      const principalBalanceBefore = await ethers.provider.getBalance(principal.address);
      const bounty = await bountyForge.getBounty(0);

      const tx = await bountyForge.connect(principal).cancelBounty(0);
      const receipt = await tx.wait();
      const gasUsed = receipt!.gasUsed * receipt!.gasPrice;

      const principalBalanceAfter = await ethers.provider.getBalance(principal.address);
      expect(principalBalanceAfter + gasUsed - principalBalanceBefore).to.equal(bounty.reward);

      const cancelledBounty = await bountyForge.getBounty(0);
      expect(cancelledBounty.status).to.equal(3); // Cancelled
    });

    it("Should revert if not principal", async function () {
      await expect(
        bountyForge.connect(worker1).cancelBounty(0)
      ).to.be.revertedWithCustomError(bountyForge, "NotPrincipal");
    });

    it("Should revert if there are submissions", async function () {
      await bountyForge.connect(worker1).submitWork(0, MARKDOWN_CID_1);

      await expect(
        bountyForge.connect(principal).cancelBounty(0)
      ).to.be.revertedWithCustomError(bountyForge, "HasSubmissions");
    });
  });

  describe("Protocol Fees", function () {
    it("Should accumulate fees correctly", async function () {
      const deadline = (await time.latest()) + 3600;

      await bountyForge.connect(principal).createBounty(PDF_CID, evaluator.address, deadline, {
        value: BOUNTY_AMOUNT,
      });

      const expectedFee = (BOUNTY_AMOUNT * 100n) / 10000n; // 1%
      expect(await bountyForge.accumulatedFees()).to.equal(expectedFee);
    });

    it("Should allow owner to withdraw fees", async function () {
      const deadline = (await time.latest()) + 3600;

      await bountyForge.connect(principal).createBounty(PDF_CID, evaluator.address, deadline, {
        value: BOUNTY_AMOUNT,
      });

      const ownerBalanceBefore = await ethers.provider.getBalance(owner.address);
      const fees = await bountyForge.accumulatedFees();

      const tx = await bountyForge.connect(owner).withdrawFees();
      const receipt = await tx.wait();
      const gasUsed = receipt!.gasUsed * receipt!.gasPrice;

      const ownerBalanceAfter = await ethers.provider.getBalance(owner.address);
      expect(ownerBalanceAfter + gasUsed - ownerBalanceBefore).to.equal(fees);
      expect(await bountyForge.accumulatedFees()).to.equal(0);
    });

    it("Should revert if non-owner tries to withdraw", async function () {
      await expect(
        bountyForge.connect(worker1).withdrawFees()
      ).to.be.revertedWithCustomError(bountyForge, "OwnableUnauthorizedAccount");
    });
  });

  describe("Pausable", function () {
    it("Should allow owner to pause", async function () {
      await bountyForge.connect(owner).pause();
      expect(await bountyForge.paused()).to.equal(true);
    });

    it("Should revert createBounty when paused", async function () {
      await bountyForge.connect(owner).pause();
      const deadline = (await time.latest()) + 3600;

      await expect(
        bountyForge.connect(principal).createBounty(PDF_CID, evaluator.address, deadline, {
          value: BOUNTY_AMOUNT,
        })
      ).to.be.revertedWithCustomError(bountyForge, "EnforcedPause");
    });

    it("Should allow unpause and resume operations", async function () {
      await bountyForge.connect(owner).pause();
      await bountyForge.connect(owner).unpause();

      const deadline = (await time.latest()) + 3600;
      await expect(
        bountyForge.connect(principal).createBounty(PDF_CID, evaluator.address, deadline, {
          value: BOUNTY_AMOUNT,
        })
      ).to.emit(bountyForge, "BountyCreated");
    });
  });

  describe("View Functions", function () {
    it("Should correctly track hasWorkerSubmitted", async function () {
      const deadline = (await time.latest()) + 3600;
      await bountyForge.connect(principal).createBounty(PDF_CID, evaluator.address, deadline, {
        value: BOUNTY_AMOUNT,
      });

      expect(await bountyForge.hasWorkerSubmitted(0, worker1.address)).to.equal(false);

      await bountyForge.connect(worker1).submitWork(0, MARKDOWN_CID_1);

      expect(await bountyForge.hasWorkerSubmitted(0, worker1.address)).to.equal(true);
      expect(await bountyForge.hasWorkerSubmitted(0, worker2.address)).to.equal(false);
    });
  });
});
