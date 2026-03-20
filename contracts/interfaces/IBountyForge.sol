// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IBountyForge
 * @notice Interface for the BountyForge decentralized bounty system
 * @dev Used by agents to interact with the BountyForge contract
 */
interface IBountyForge {
    
    // ============ ENUMS ============
    
    enum BountyStatus {
        Open,
        Evaluating,
        Completed,
        Cancelled
    }

    // ============ STRUCTS ============
    
    struct Bounty {
        address principal;
        string pdfCID;
        uint256 reward;
        uint256 deadline;
        address evaluator;
        BountyStatus status;
        address winner;
        uint256 winningScore;
        uint256 submissionCount;
    }
    
    struct Submission {
        address worker;
        string markdownCID;
        uint256 timestamp;
        uint256 score;
        bool evaluated;
    }

    // ============ EVENTS ============
    
    event BountyCreated(
        uint256 indexed bountyId,
        address indexed principal,
        string pdfCID,
        uint256 reward,
        uint256 deadline,
        address evaluator
    );
    
    event WorkSubmitted(
        uint256 indexed bountyId,
        address indexed worker,
        uint256 submissionIndex,
        string markdownCID
    );
    
    event EvaluationComplete(
        uint256 indexed bountyId,
        address indexed winner,
        uint256 winningScore,
        uint256 reward
    );
    
    event BountyDistributed(
        uint256 indexed bountyId,
        address indexed winner,
        uint256 amount
    );
    
    event BountyCancelled(
        uint256 indexed bountyId,
        address indexed principal,
        uint256 refundAmount
    );

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
    ) external payable returns (uint256 bountyId);
    
    /**
     * @notice Submit work for a bounty
     * @param bountyId The bounty to submit work for
     * @param markdownCID IPFS CID of the converted markdown
     */
    function submitWork(
        uint256 bountyId,
        string calldata markdownCID
    ) external;
    
    /**
     * @notice Submit evaluation scores for all submissions (evaluator only)
     * @param bountyId The bounty to evaluate
     * @param scores Array of scores (0-100) for each submission, in order
     */
    function submitEvaluation(
        uint256 bountyId,
        uint256[] calldata scores
    ) external;
    
    /**
     * @notice Cancel a bounty and get a refund (principal only, before any submissions)
     * @param bountyId The bounty to cancel
     */
    function cancelBounty(uint256 bountyId) external;

    // ============ VIEW FUNCTIONS ============
    
    /**
     * @notice Get all submissions for a bounty
     * @param bountyId The bounty ID
     * @return Array of submissions
     */
    function getSubmissions(uint256 bountyId) external view returns (Submission[] memory);
    
    /**
     * @notice Get a specific submission
     * @param bountyId The bounty ID
     * @param index The submission index
     * @return The submission data
     */
    function getSubmission(uint256 bountyId, uint256 index) external view returns (Submission memory);
    
    /**
     * @notice Get bounty details
     * @param bountyId The bounty ID
     * @return The bounty data
     */
    function getBounty(uint256 bountyId) external view returns (Bounty memory);
    
    /**
     * @notice Check if a worker has already submitted to a bounty
     * @param bountyId The bounty ID
     * @param worker The worker address
     * @return True if already submitted
     */
    function hasWorkerSubmitted(uint256 bountyId, address worker) external view returns (bool);
    
    /**
     * @notice Get the number of submissions for a bounty
     * @param bountyId The bounty ID
     * @return The submission count
     */
    function getSubmissionCount(uint256 bountyId) external view returns (uint256);
    
    /**
     * @notice Get the current bounty count
     * @return Total number of bounties created
     */
    function bountyCount() external view returns (uint256);
    
    /**
     * @notice Get the minimum bounty amount
     * @return Minimum ETH required to create a bounty
     */
    function MIN_BOUNTY() external view returns (uint256);
    
    /**
     * @notice Get the maximum score
     * @return Maximum score an evaluator can assign
     */
    function MAX_SCORE() external view returns (uint256);
}
