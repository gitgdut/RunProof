// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {CategoryRegistry} from "../src/CategoryRegistry.sol";
import {ICategoryRegistry} from "../src/interfaces/ICategoryRegistry.sol";
import {ChallengeReasonRegistry} from "../src/ChallengeReasonRegistry.sol";
import {RunProofCore} from "../src/RunProofCore.sol";
import {RecordNFT} from "../src/RecordNFT.sol";

/// Usage (key comes from the environment / keystore, never from the repo):
///   forge script script/Deploy.s.sol --rpc-url $MONAD_RPC_URL --private-key $PRIVATE_KEY --broadcast
/// Optional env: POOL_SEED (wei) to pre-fund the reward pool, DEMO_PERIODS=1 for short demo voting windows.
contract Deploy is Script {
    function run() external {
        string memory privateKey = vm.envString("PRIVATE_KEY");
        if (bytes(privateKey).length == 64) privateKey = string.concat("0x", privateKey);
        uint256 pk = vm.parseUint(privateKey);
        address deployer = vm.addr(pk);
        uint256 poolSeed = vm.envOr("POOL_SEED", uint256(0));
        bool demo = vm.envOr("DEMO_PERIODS", uint256(0)) == 1;

        vm.startBroadcast(pk);
        CategoryRegistry categories = new CategoryRegistry(deployer);
        ChallengeReasonRegistry reasons = new ChallengeReasonRegistry(deployer);
        RunProofCore core = new RunProofCore(deployer, categories, reasons);
        RecordNFT nft = new RecordNFT(core);

        uint256 sprint = categories.createCategory(
            "100m Sprint",
            "ipfs://runproof-rules/100m-sprint-v1",
            "ms",
            0,
            ICategoryRegistry.RankingDirection.LowerIsBetter,
            1,
            0.05 ether
        );
        categories.addDivision(sprint, "Open");
        uint256 pullUps = categories.createCategory(
            "Pull-ups",
            "ipfs://runproof-rules/pull-ups-v1",
            "reps",
            0,
            ICategoryRegistry.RankingDirection.HigherIsBetter,
            1,
            0.05 ether
        );
        categories.addDivision(pullUps, "Open");
        uint256 tetris = categories.createCategory(
            "Tetris Score",
            "ipfs://runproof-rules/tetris-v1",
            "points",
            0,
            ICategoryRegistry.RankingDirection.HigherIsBetter,
            1,
            0.05 ether
        );
        categories.addDivision(tetris, "Classic");
        categories.addDivision(tetris, "Sprint");
        categories.addDivision(tetris, "Marathon");

        if (demo) {
            // short windows so the full loop can be shown live; production keeps 30d / 3d+1d
            (
                uint256 a,
                uint256 b,
                uint256 c,
                uint256 d,
                uint256 e,
                uint256 f,
                uint256 g,
                uint256 h,
                uint32 i,,,,,
                uint16 n,
                uint16 o,
                uint16 q,
                uint16 r,
                uint16 s,
                uint16 t
            ) = core.params();
            core.setParams(
                RunProofCore.Params(
                    a, b, c, d, e, f, g, h, i, 10 minutes, 2 minutes, 2 minutes, 2 minutes, n, o, q, r, s, t
                )
            );
        }
        if (poolSeed > 0) core.fundPool{value: poolSeed}();
        vm.stopBroadcast();

        console.log("chainid        ", block.chainid);
        console.log("deployer       ", deployer);
        console.log("CategoryRegistry", address(categories));
        console.log("ReasonRegistry  ", address(reasons));
        console.log("RunProofCore   ", address(core));
        console.log("RecordNFT      ", address(nft));
    }
}
