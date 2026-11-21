#!/usr/bin/env bash
# Live testnet demo of the tie path: 2:2 -> extension -> 3:3 -> Evidence Sufficiency round -> Confirmed.
# Needs a deployment with DEMO_PERIODS=1. Env: PRIVATE_KEY (funder/player), MONAD_RPC_URL, CORE.
set -uo pipefail
umask 077   # wallet files below are private
die() { echo "ABORT: $*" >&2; exit 1; }
RPC=${MONAD_RPC_URL:?}; CORE=${CORE:?}
S="cast send --rpc-url $RPC --legacy"
[ "$(cast chain-id --rpc-url $RPC 2>/dev/null)" = "10143" ] || die "cannot reach Monad testnet (chain id != 10143)"
# every transaction must succeed; on failure stop instead of racing ahead. Never echo args (they contain keys).
tx() { tx "$@" >/dev/null 2>&1 || die "transaction failed: cast send ${1:-?} ${2:-}"; }
STAKE=100000000000000000
now() { cast block latest --field timestamp --rpc-url $RPC; }
waitts() { [ -n "${1:-}" ] || die "empty timestamp (chain read failed)"; while [ "$(now)" -lt "$1" ]; do sleep 5; done; sleep 2; }
mk() { cast wallet new --json | python3 -c 'import json,sys;d=json.load(sys.stdin)["data"][0];print(d["address"],d["private_key"])'; }
chal() { cast call $CORE "getChallenge(uint256)((uint256,uint256,address,uint256,uint256,bytes32,string,uint64,uint8,uint8,bool,bool,uint32))" $CID --rpc-url $RPC --json \
  | python3 -c 'import json,sys;d=json.load(sys.stdin)[0];print("status=%s round=%s extended=%s"%(d[8],d[9],d[11]))' || die "could not read challenge $CID"; }
rnd() { cast call $CORE "rounds(uint256,uint8)(uint64,uint64)" $CID $1 --rpc-url $RPC | awk '{print $1}' | tr '\n' ' '; }
commit() { # idx choice round
  local a=${W[$1]%% *} k=${W[$1]##* } salt; salt=$(cast keccak "tie-salt-$1-$3")
  local h; h=$(cast call $CORE "hashVote(uint256,uint8,uint8,bytes32,address)(bytes32)" $CID $3 $2 $salt $a --rpc-url $RPC)
  tx $CORE "commitVote(uint256,bytes32)" $CID $h --value $STAKE --private-key $k && echo "  v$1 committed (round $3)"
}
reveal() { # idx choice round
  local k=${W[$1]##* }
  tx $CORE "revealVote(uint256,uint8,bytes32)" $CID $2 $(cast keccak "tie-salt-$1-$3") --private-key $k && echo "  v$1 revealed"
}

WF=/tmp/tie_wallets_$(date +%s).txt; : > $WF
W=(); for i in 1 2 3 4 5 6; do W[$i]="$(mk)"; echo "${W[$i]}" >> $WF; done
for i in 1 2 3 4 5 6; do [[ "${W[$i]}" =~ ^0x[0-9a-fA-F]{40}\ 0x[0-9a-fA-F]{64}$ ]] || { echo "wallet generation failed"; exit 1; }; done
CH="$(mk)"; echo "$CH" >> $WF; CHA=${CH%% *}; CHK=${CH##* }
echo "wallet keys saved to $WF (chmod 600)"
for w in "${W[@]:1}" "$CH"; do tx ${w%% *} --value 600000000000000000 --private-key $PRIVATE_KEY >/dev/null; done; echo funded

PAY=$(cast call $CORE "requiredPayment(uint256,uint256,uint256)(uint256)" 1 3 7000 --rpc-url $RPC | awk '{print $1}')
tx $CORE "submitRecord(uint256,uint256,uint256,bytes32,string)" 1 3 7000 $(cast keccak "tie-$(date +%s)") "ipfs://tie-case" --value $PAY --private-key $PRIVATE_KEY
REC=$(cast call $CORE "recordCount()(uint256)" --rpc-url $RPC); echo "record id=$REC"
tx $CORE "challengeRecord(uint256,uint256,bytes32,string)" $REC 2 $(cast keccak "tie-proof-$(date +%s)") "ipfs://proof" --value 100000000000000000 --private-key $CHK
CID=$(cast call $CORE "challengeCount()(uint256)" --rpc-url $RPC); echo "challenge id=$CID"

echo "== round 0: 2 confirm vs 2 deny =="
commit 1 1 0; commit 2 1 0; commit 3 2 0; commit 4 2 0
read CE RE <<<"$(rnd 0)"; waitts $CE
reveal 1 1 0; reveal 2 1 0; reveal 3 2 0; reveal 4 2 0
waitts $RE; tx $CORE "finalizeVoting(uint256)" $CID --private-key $PRIVATE_KEY
echo "after 50:50 finalize (expect status=1 extended=True): $(chal)"

echo "== extension: 1 more confirm, 1 more deny => 3:3 =="
commit 5 1 0; commit 6 2 0
read CE RE <<<"$(rnd 0)"; echo "  new window: $CE -> $RE"; waitts $CE
reveal 5 1 0; reveal 6 2 0
waitts $RE; tx $CORE "finalizeVoting(uint256)" $CID --private-key $PRIVATE_KEY
echo "after extended finalize (expect status=2 round=1): $(chal)"

echo "== evidence sufficiency round: 4 Sufficient(1) vs 1 Required(2) =="
commit 1 1 1; commit 2 1 1; commit 3 1 1; commit 4 1 1; commit 5 2 1
read CE RE <<<"$(rnd 1)"; waitts $CE
reveal 1 1 1; reveal 2 1 1; reveal 3 1 1; reveal 4 1 1; reveal 5 2 1
waitts $RE; tx $CORE "finalizeVoting(uint256)" $CID --private-key $PRIVATE_KEY
echo "final (expect status=3 Confirmed): $(chal)"
echo "record status (expect 3 Revoked): $(cast call $CORE 'recordSummary(uint256)(address,uint256,uint256,uint256,bytes32,uint8)' $REC --rpc-url $RPC | tail -1)"

for i in 1 2 3 4 5 6; do k=${W[$i]##* }
  for r in 0 1; do tx $CORE "claimVote(uint256,uint8)" $CID $r --private-key $k >/dev/null 2>&1; done
  tx $CORE "withdraw()" --private-key $k >/dev/null 2>&1; done
tx $CORE "withdraw()" --private-key $CHK
echo "contract balance vs poolBalance: $(cast balance $CORE --rpc-url $RPC) / $(cast call $CORE 'poolBalance()(uint256)' --rpc-url $RPC | awk '{print $1}')"
echo TIE_DONE
