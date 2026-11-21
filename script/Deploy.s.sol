// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {GameRegistry} from "../src/GameRegistry.sol";
import {CheatRegistry} from "../src/CheatRegistry.sol";
import {RunProofCore} from "../src/RunProofCore.sol";
import {RecordNFT} from "../src/RecordNFT.sol";

/// Usage (key comes from the environment / keystore, never from the repo):
///   forge script script/Deploy.s.sol --rpc-url $MONAD_RPC_URL --private-key $PRIVATE_KEY --broadcast
/// Optional env: POOL_SEED (wei) to pre-fund the reward pool, DEMO_PERIODS=1 for short demo voting windows.
contract Deploy is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);
        uint256 poolSeed = vm.envOr("POOL_SEED", uint256(0));
        bool demo = vm.envOr("DEMO_PERIODS", uint256(0)) == 1;

        vm.startBroadcast(pk);
        GameRegistry games = new GameRegistry(deployer);
        CheatRegistry cheats = new CheatRegistry(deployer);
        RunProofCore core = new RunProofCore(deployer, games, cheats);
        RecordNFT nft = new RecordNFT(core);

        if (demo) {
            // short windows so the full loop can be shown live; production keeps 30d / 3d+1d
            (
                uint256 a, uint256 b, uint256 c, uint256 d, uint256 e, uint256 f, uint256 g, uint256 h,
                uint32 i, , , , , uint16 n, uint16 o, uint16 q, uint16 r, uint16 s, uint16 t
            ) = core.params();
            core.setParams(
                RunProofCore.Params(a, b, c, d, e, f, g, h, i, 10 minutes, 2 minutes, 2 minutes, 2 minutes, n, o, q, r, s, t)
            );
        }
        if (poolSeed > 0) core.fundPool{value: poolSeed}();
        vm.stopBroadcast();

        console.log("chainid        ", block.chainid);
        console.log("deployer       ", deployer);
        console.log("GameRegistry   ", address(games));
        console.log("CheatRegistry  ", address(cheats));
        console.log("RunProofCore   ", address(core));
        console.log("RecordNFT      ", address(nft));
    }
}
