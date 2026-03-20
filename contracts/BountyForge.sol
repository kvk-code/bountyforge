// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title BountyForge
 * @author BountyForge Team (Synthesis Hackathon 2026)
 * @notice A decentralized bounty system for PDF-to-Markdown conversion tasks
 * @dev Implements agent cooperation: Principal posts bounty → Workers compete → Evaluator judges → Winner paid
 * 
 * Architecture:
 * - Principal Agent: Creates bounties with ETH reward and IPFS-hosted PDF
 * - Worker Agents: Submit markdown conversions (stored on IPFS)
 * - Evaluator Agent: Scores submissions via LLM and triggers payout
 * 
 * Security: CEI pattern, ReentrancyGuard, input validation, event logging
 */
contract BountyForge is ReentrancyGuard, Pausable, Ownable {
    
    // ============ CONSTANTS ============
    
    /// @notice Maximum score an evaluator can assign (100 points)
    uint256 public constant MAX_SCORE = 100;
    
    /// @notice Minimum bounty amount to prevent dust bounties (0.0001 ETH)
    uint256 public constant MIN_BOUNTY = 0.0001 ether;
    
    /// @notice Protocol fee in basis points (1% = 100 bps)
    uint256 public constant PROTOCOL_FEE_BPS = 100;
    
    /// @notice Basis points denominator
    uint256 public constant BPS_DENOMINATOR = 10_000;

    // ============ ENUMS ============
    
    /// @notice Status of a bounty throughout its lifecycle
    enum BountyStatus {
        Open,           // Accepting submissions
        Evaluating,     // Deadline passed, awaiting evaluation
        Completed,      // Winner paid
        Cancelled       // Principal cancelled (refunded)
    }

    // ============ STRUCTS ============
    
    /// @notice A bounty posted by a principal agent
    struct Bounty {
        address principal;          // Who posted the bounty
        string pdfCID;              // IPFS CID of source PDF
        uint256 reward;             // ETH reward amount (minus protocol fee)
        uint256 deadline;           // Submission deadline (unix timestamp)
        address evaluator;          // Designated evaluator agent address
        BountyStatus status;        // Current status
        address winner;             // Winner after evaluation (address(0) if none)
        uint256 winningScore;       // Score of the winning submission
        uint256 submissionCount;    // Number of submissions received
    }
    
    /// @notice A work submission by a worker agent
    struct Submission {
        address worker;             // Worker agent address
        string markdownCID;         // IPFS CID of converted markdown
        uint256 timestamp;          // When submission was made
        uint256 score;              // Score assigned by evaluator (0-100)
        bool evaluated;             // Whether this submission has been scored
    }

    // ============ STATE ============
    
    /// @notice Total number of bounties created
    uint256 public bountyCount;
    
    /// @notice Accumulated protocol fees available for withdrawal
    uint256 public accumulatedFees;
    
    /// @notice Bounty ID => Bounty data
    mapping(uint256 => Bounty) public bounties;
    
    /// @notice Bounty ID => array of submissions
    mapping(uint256 => Submission[]) public submissions;
    
    /// @notice Bounty ID => worker address => has submitted
    mapping(uint256 => mapping(address => bool)) public hasSubmitted;

    // ============ EVENTS ============
    
    /// @notice Emitted when a new bounty is created
    event BountyCreated(
        uint256 indexed bountyId,
        address indexed principal,
        string pdfCID,
        uint256 reward,
        uint256 deadline,
        address evaluator
    );
    
    /// @notice Emitted when a worker submits work
    event WorkSubmitted(
        uint256 indexed bountyId,
        address indexed worker,
        uint256 submissionIndex,
        string markdownCID
    );
    
    /// @notice Emitted when evaluation is complete and winner is determined
    event EvaluationComplete(
        uint256 indexed bountyId,
        address indexed winner,
        uint256 winningScore,
        uint256 reward
    );
    
    /// @notice Emitted when bounty reward is distributed to winner
    event BountyDistributed(
        uint256 indexed bountyId,
        address indexed winner,
        uint256 amount
    );
    
    /// @notice Emitted when a bounty is cancelled and refunded
    event BountyCancelled(
        uint256 indexed bountyId,
        address indexed principal,
        uint256 refundAmount
    );
    
    /// @notice Emitted when protocol fees are withdrawn
    event FeesWithdrawn(
        address indexed recipient,
        uint256 amount
    );

    // ============ ERRORS ============
    
    error InvalidDeadline();
    error InvalidEvaluator();
    error InsufficientBounty();
    error BountyNotOpen();
    error DeadlineNotPassed();
    error DeadlinePassed();
    error AlreadySubmitted();
    error NotEvaluator();
    error InvalidScoresLength();
    error ScoreTooHigh();
    error NoSubmissions();
    error InvalidCID();
    error NotPrincipal();
    error HasSubmissions();
    error TransferFailed();

    // ============ CONSTRUCTOR ============
    
    constructor() Ownable(msg.sender) {}

    // ============ EXTERNAL FUNCTIONS ============
    
    /**
     * @notice Create a new bounty for PDF-to-Markdown conversion
     * @param pdfCID IPFS CID of the source PDF document
     * @param evaluator Address of the designated evaluator agent
     * @param deadline Unix timestamp when submissions close
     * @return bountyId The ID of the newly created bounty
     */
    function createBounty(
        string calldata pdfCID,
        address evaluator,
        uint256 deadline
    ) external payable whenNotPaused nonReentrant returns (uint256 bountyId) {
        // CHECKS
        if (bytes(pdfCID).length == 0) revert InvalidCID();
        if (evaluator == address(0)) revert InvalidEvaluator();
        if (deadline <= block.timestamp) revert InvalidDeadline();
        if (msg.value < MIN_BOUNTY) revert InsufficientBounty();
        
        // Calculate protocol fee (1%)
        uint256 protocolFee = (msg.value * PROTOCOL_FEE_BPS) / BPS_DENOMINATOR;
        uint256 reward = msg.value - protocolFee;
        
        // EFFECTS
        bountyId = bountyCount++;
        
        bounties[bountyId] = Bounty({
            principal: msg.sender,
            pdfCID: pdfCID,
            reward: reward,
            deadline: deadline,
            evaluator: evaluator,
            status: BountyStatus.Open,
            winner: address(0),
            winningScore: 0,
            submissionCount: 0
        });
        
        accumulatedFees += protocolFee;
        
        // INTERACTIONS (none - just logging)
        emit BountyCreated(
            bountyId,
            msg.sender,
            pdfCID,
            reward,
            deadline,
            evaluator
        );
    }
    
    /**
     * @notice Submit work for a bounty
     * @param bountyId The bounty to submit work for
     * @param markdownCID IPFS CID of the converted markdown
     */
    function submitWork(
        uint256 bountyId,
        string calldata markdownCID
    ) external whenNotPaused nonReentrant {
        Bounty storage bounty = bounties[bountyId];
        
        // CHECKS
        if (bounty.status != BountyStatus.Open) revert BountyNotOpen();
        if (block.timestamp > bounty.deadline) revert DeadlinePassed();
        if (bytes(markdownCID).length == 0) revert InvalidCID();
        if (hasSubmitted[bountyId][msg.sender]) revert AlreadySubmitted();
        
        // EFFECTS
        hasSubmitted[bountyId][msg.sender] = true;
        
        submissions[bountyId].push(Submission({
            worker: msg.sender,
            markdownCID: markdownCID,
            timestamp: block.timestamp,
            score: 0,
            evaluated: false
        }));
        
        bounty.submissionCount++;
        
        // INTERACTIONS (none - just logging)
        emit WorkSubmitted(
            bountyId,
            msg.sender,
            submissions[bountyId].length - 1,
            markdownCID
        );
    }
    
    /**
     * @notice Submit evaluation scores for all submissions (evaluator only)
     * @dev Automatically determines winner and distributes bounty
     * @param bountyId The bounty to evaluate
     * @param scores Array of scores (0-100) for each submission, in order
     */
    function submitEvaluation(
        uint256 bountyId,
        uint256[] calldata scores
    ) external whenNotPaused nonReentrant {
        Bounty storage bounty = bounties[bountyId];
        
        // CHECKS
        if (bounty.status != BountyStatus.Open) revert BountyNotOpen();
        if (block.timestamp <= bounty.deadline) revert DeadlineNotPassed();
        if (msg.sender != bounty.evaluator) revert NotEvaluator();
        
        Submission[] storage subs = submissions[bountyId];
        if (subs.length == 0) revert NoSubmissions();
        if (scores.length != subs.length) revert InvalidScoresLength();
        
        // EFFECTS - find winner while scoring
        uint256 highestScore = 0;
        address winner = address(0);
        
        for (uint256 i = 0; i < scores.length; i++) {
            if (scores[i] > MAX_SCORE) revert ScoreTooHigh();
            
            subs[i].score = scores[i];
            subs[i].evaluated = true;
            
            if (scores[i] > highestScore) {
                highestScore = scores[i];
                winner = subs[i].worker;
            }
        }
        
        bounty.status = BountyStatus.Completed;
        bounty.winner = winner;
        bounty.winningScore = highestScore;
        
        uint256 reward = bounty.reward;
        
        emit EvaluationComplete(bountyId, winner, highestScore, reward);
        
        // INTERACTIONS - transfer reward to winner
        if (winner != address(0) && reward > 0) {
            (bool success, ) = winner.call{value: reward}("");
            if (!success) revert TransferFailed();
            
            emit BountyDistributed(bountyId, winner, reward);
        }
    }
    
    /**
     * @notice Cancel a bounty and get a refund (principal only, before any submissions)
     * @param bountyId The bounty to cancel
     */
    function cancelBounty(uint256 bountyId) external nonReentrant {
        Bounty storage bounty = bounties[bountyId];
        
        // CHECKS
        if (msg.sender != bounty.principal) revert NotPrincipal();
        if (bounty.status != BountyStatus.Open) revert BountyNotOpen();
        if (bounty.submissionCount > 0) revert HasSubmissions();
        
        // EFFECTS
        bounty.status = BountyStatus.Cancelled;
        uint256 refund = bounty.reward;
        bounty.reward = 0;
        
        emit BountyCancelled(bountyId, msg.sender, refund);
        
        // INTERACTIONS
        (bool success, ) = msg.sender.call{value: refund}("");
        if (!success) revert TransferFailed();
    }
    
    /**
     * @notice Withdraw accumulated protocol fees (owner only)
     */
    function withdrawFees() external onlyOwner nonReentrant {
        uint256 amount = accumulatedFees;
        
        // EFFECTS
        accumulatedFees = 0;
        
        emit FeesWithdrawn(msg.sender, amount);
        
        // INTERACTIONS
        (bool success, ) = msg.sender.call{value: amount}("");
        if (!success) revert TransferFailed();
    }
    
    /**
     * @notice Pause the contract (owner only, emergency use)
     */
    function pause() external onlyOwner {
        _pause();
    }
    
    /**
     * @notice Unpause the contract (owner only)
     */
    function unpause() external onlyOwner {
        _unpause();
    }

    // ============ VIEW FUNCTIONS ============
    
    /**
     * @notice Get all submissions for a bounty
     * @param bountyId The bounty ID
     * @return Array of submissions
     */
    function getSubmissions(uint256 bountyId) external view returns (Submission[] memory) {
        return submissions[bountyId];
    }
    
    /**
     * @notice Get a specific submission
     * @param bountyId The bounty ID
     * @param index The submission index
     * @return The submission data
     */
    function getSubmission(uint256 bountyId, uint256 index) external view returns (Submission memory) {
        return submissions[bountyId][index];
    }
    
    /**
     * @notice Get bounty details
     * @param bountyId The bounty ID
     * @return The bounty data
     */
    function getBounty(uint256 bountyId) external view returns (Bounty memory) {
        return bounties[bountyId];
    }
    
    /**
     * @notice Check if a worker has already submitted to a bounty
     * @param bountyId The bounty ID
     * @param worker The worker address
     * @return True if already submitted
     */
    function hasWorkerSubmitted(uint256 bountyId, address worker) external view returns (bool) {
        return hasSubmitted[bountyId][worker];
    }
    
    /**
     * @notice Get the number of submissions for a bounty
     * @param bountyId The bounty ID
     * @return The submission count
     */
    function getSubmissionCount(uint256 bountyId) external view returns (uint256) {
        return submissions[bountyId].length;
    }
}
