// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title MirrorRouter — allowance-based trade mirroring (MVP skeleton)
/// @notice Users retain custody in their EOA. Keeper executes scaled swaps when alpha wallets move.
contract MirrorRouter {
    address public keeper;
    address public owner;

    struct MirrorConfig {
        address alphaWallet;
        uint256 maxPerTradeUsd; // 1e6 decimals assumed off-chain
        uint256 maxDailyUsd;
        uint256 dailySpentUsd;
        uint256 lastSpendDay;
        uint256 userRatioBps; // 1000 = 10%
        bool active;
    }

    mapping(address => mapping(address => MirrorConfig)) public mirrors;

    event MirrorConfigured(address indexed user, address indexed alpha);
    event MirrorPaused(address indexed user, address indexed alpha);
    event MirrorExecuted(address indexed user, address indexed alpha, bytes32 alphaTxHash);

    modifier onlyKeeper() {
        require(msg.sender == keeper, "not keeper");
        _;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    constructor(address _keeper) {
        owner = msg.sender;
        keeper = _keeper;
    }

    function setKeeper(address _keeper) external onlyOwner {
        keeper = _keeper;
    }

    function setMirrorConfig(
        address alphaWallet,
        uint256 maxPerTradeUsd,
        uint256 maxDailyUsd,
        uint256 userRatioBps
    ) external {
        mirrors[msg.sender][alphaWallet] = MirrorConfig({
            alphaWallet: alphaWallet,
            maxPerTradeUsd: maxPerTradeUsd,
            maxDailyUsd: maxDailyUsd,
            dailySpentUsd: 0,
            lastSpendDay: block.timestamp / 1 days,
            userRatioBps: userRatioBps,
            active: true
        });
        emit MirrorConfigured(msg.sender, alphaWallet);
    }

    function pauseMirror(address alphaWallet) external {
        mirrors[msg.sender][alphaWallet].active = false;
        emit MirrorPaused(msg.sender, alphaWallet);
    }

    /// @dev Full swap logic + DEX integrations added in ship phase
    function executeMirror(
        address user,
        address alphaWallet,
        bytes32 alphaTxHash
    ) external onlyKeeper {
        MirrorConfig storage cfg = mirrors[user][alphaWallet];
        require(cfg.active, "mirror paused");
        emit MirrorExecuted(user, alphaWallet, alphaTxHash);
    }
}