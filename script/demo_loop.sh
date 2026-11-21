#!/usr/bin/env bash
# Live end-to-end smoke test on a testnet deployed with DEMO_PERIODS=1. Needs PRIVATE_KEY (player/funder) in env.
# Generates throw-away wallets (kept only in /tmp), funds them, runs submit->challenge->commit/reveal->settle->NFT.
set -uo pipefail
RPC=${MONAD_RPC_URL:?}; CORE=${CORE:?}; NFT=${NFT:?}
ME=$(cast wallet address --private-key "$PRIVATE_KEY")
S="cast send --rpc-url $RPC --legacy"
now() { cast block latest --field timestamp --rpc-url $RPC; }
waitts() { while [ "$(now)" -lt "$1" ]; do sleep 5; done; sleep 2; }
mk() { cast wallet new --json | python3 -c 'import json,sys;d=json.load(sys.stdin)["data"][0];print(d["address"],d["private_key"])'; }
STAKE=100000000000000000   # 0.1 MON per vote

# record B first: it will auto-verify while the cheat case runs
if [ -z "${RB:-}" ]; then
PAYB=$(cast call $CORE "requiredPayment(uint256,uint256,uint256)(uint256)" 1 1 5000 --rpc-url $RPC | awk '{print $1}')
$S $CORE "submitRecord(uint256,uint256,uint256,bytes32,string)" 1 1 5000 $(cast keccak "honest-$(date +%s)") "ipfs://honest" --value $PAYB --private-key $PRIVATE_KEY >/dev/null
RB=$(cast call $CORE "recordCount()(uint256)" --rpc-url $RPC)
fi; echo "record B (honest) id=$RB"
PAYA=$(cast call $CORE "requiredPayment(uint256,uint256,uint256)(uint256)" 1 2 50000 --rpc-url $RPC | awk '{print $1}')
$S $CORE "submitRecord(uint256,uint256,uint256,bytes32,string)" 1 2 50000 $(cast keccak "cheat-$(date +%s)") "ipfs://cheated" --value $PAYA --private-key $PRIVATE_KEY >/dev/null
RA=$(cast call $CORE "recordCount()(uint256)" --rpc-url $RPC); echo "record A (cheated) id=$RA"

W=(); for i in 0 1 2 3 4; do W+=("$(mk)"); done
for w in "${W[@]}"; do [[ "$w" =~ ^0x[0-9a-fA-F]{40}\ 0x[0-9a-fA-F]{64}$ ]] || { echo "wallet generation failed"; exit 1; }; done
for w in "${W[@]}"; do $S ${w%% *} --value 400000000000000000 --private-key $PRIVATE_KEY >/dev/null; done; echo funded
for w in "${W[@]}"; do [[ "$w" =~ ^0x[0-9a-fA-F]{40}\ 0x[0-9a-fA-F]{64}$ ]] || { echo "wallet generation failed: $w"; exit 1; }; done
CH=${W[0]}; CHA=${CH%% *}; CHK=${CH##* }
$S $CORE "challengeRecord(uint256,uint256,bytes32,string)" $RA 1 $(cast keccak "proof-$(date +%s)") "ipfs://proof" --value 100000000000000000 --private-key $CHK >/dev/null
CID=$(cast call $CORE "challengeCount()(uint256)" --rpc-url $RPC); echo "challenge id=$CID"
# voters 1..3 confirm, voter 4 denies
declare -A CH_OF; for i in 1 2 3 4; do if [ $i -le 3 ]; then CH_OF[$i]=1; else CH_OF[$i]=2; fi; done
for i in 1 2 3 4; do
  a=${W[$i]%% *}; k=${W[$i]##* }; salt=$(cast keccak "salt$i")
  h=$(cast call $CORE "hashVote(uint256,uint8,uint8,bytes32,address)(bytes32)" $CID 0 ${CH_OF[$i]} $salt $a --rpc-url $RPC)
  $S $CORE "commitVote(uint256,bytes32)" $CID $h --value $STAKE --private-key $k >/dev/null; echo "voter$i committed"
done
CE=$(cast call $CORE "rounds(uint256,uint8)(uint64,uint64)" $CID 0 --rpc-url $RPC | sed -n 1p | awk '{print $1}')
RE=$(cast call $CORE "rounds(uint256,uint8)(uint64,uint64)" $CID 0 --rpc-url $RPC | sed -n 2p | awk '{print $1}')
echo "waiting for reveal phase..."; waitts $CE
for i in 1 2 3 4; do k=${W[$i]##* }; $S $CORE "revealVote(uint256,uint8,bytes32)" $CID ${CH_OF[$i]} $(cast keccak "salt$i") --private-key $k >/dev/null; echo "voter$i revealed"; done
echo "waiting for reveal end..."; waitts $RE
$S $CORE "finalizeVoting(uint256)" $CID --private-key $PRIVATE_KEY >/dev/null
echo "challenge status (3=Confirmed): $(cast call $CORE 'getChallenge(uint256)' $CID --rpc-url $RPC >/dev/null; cast call $CORE 'getChallenge(uint256)((uint256,uint256,address,uint256,uint256,bytes32,string,uint64,uint8,uint8,bool,bool,uint32))' $CID --rpc-url $RPC | grep -o ', [0-9], [0-9], \(true\|false\)' | head -1)"
echo "record A status (3=Revoked): $(cast call $CORE 'recordSummary(uint256)(address,uint256,uint256,uint256,bytes32,uint8)' $RA --rpc-url $RPC | tail -1)"
for i in 1 2 3 4; do k=${W[$i]##* }; $S $CORE "claimVote(uint256,uint8)" $CID 0 --private-key $k >/dev/null; $S $CORE "withdraw()" --private-key $k >/dev/null; done
$S $CORE "withdraw()" --private-key $CHK >/dev/null
for i in 0 1 2 3 4; do echo "wallet$i final balance: $(cast balance ${W[$i]%% *} --rpc-url $RPC --ether)"; done
# record B: auto-pass after window, then NFT
echo "waiting for record B window..."; 
while ! $S $CORE "finalizeRecord(uint256)" $RB --private-key $PRIVATE_KEY >/dev/null 2>&1; do sleep 15; done
echo "record B status (2=Verified): $(cast call $CORE 'recordSummary(uint256)(address,uint256,uint256,uint256,bytes32,uint8)' $RB --rpc-url $RPC | tail -1)"
$S $NFT "mint(uint256)" $RB --private-key $PRIVATE_KEY >/dev/null; echo "NFT owner of #$RB: $(cast call $NFT 'ownerOf(uint256)(address)' $RB --rpc-url $RPC)"
$S $CORE "withdraw()" --private-key $PRIVATE_KEY >/dev/null
echo DONE
