const JetpackCooldown = 1.5;
const LastJetpackTime = new Map<number, number>();

const LivePlayers: Set<number> = new Set();

export function OnPlayerDeployed(player: mod.Player) {
    const playerId = mod.GetObjId(player);
    LivePlayers.add(playerId);
    console.log("Player deployed: " + playerId);
}

// export function OnPlayerDied(player: mod.Player) {
//     const playerId = mod.GetObjId(player);
//     LivePlayers.delete(playerId);
//     console.log("Player died: " + playerId);
// }
export function OnPlayerLeft(player: mod.Player) {
    const playerId = mod.GetObjId(player);
    LivePlayers.delete(playerId);
    console.log("Player left: " + playerId);
}


const jumpStates: Map<number, boolean> = new Map();
export function OngoingPlayer(player: mod.Player) {
    const playerId = mod.GetObjId(player);
    if (!LivePlayers.has(playerId)) {
        return;
    }

    // const jumpState = jumpStates.get(playerId) || false;
    // // jetpack at start of a jump, or any time we're parachuting
    // if (mod.GetSoldierState(player, mod.SoldierStateBool.IsParachuting)) {
    //     JetPack(player);
    // }
    // if (mod.GetSoldierState(player, mod.SoldierStateBool.IsJumping)) {
    //     if (!jumpState) {
    //         JetPack(player);
    //         jumpStates.set(playerId, true);
    //     }
    // } else if (jumpState) {
    //     jumpStates.delete(playerId);
    // }
    const jumpState = jumpStates.get(playerId) || false;

    // Boost once at jump start
    if (mod.GetSoldierState(player, mod.SoldierStateBool.IsJumping)) {
        if (!jumpState) {
            JetPack(player);
            jumpStates.set(playerId, true);
        }
    }
    // Boost while parachuting (cooldown handled in JetPack function)
    else if (mod.GetSoldierState(player, mod.SoldierStateBool.IsParachuting)) {
        JetPack(player);
    }
    // Reset state when back on ground (not jumping AND not parachuting)
    else if (jumpState) {
        jumpStates.delete(playerId);
    }

    if (mod.GetSoldierState(player, mod.SoldierStateBool.IsManDown)) {
        mod.ForceRevive(player);
    }
}
function JetPack(player: mod.Player) {
    const playerId = mod.GetObjId(player);
    const now = mod.GetMatchTimeElapsed();
    let lastJetpackTime = LastJetpackTime.get(playerId);
    if (!lastJetpackTime) {
        lastJetpackTime = 0;
    }
    if (now - lastJetpackTime > JetpackCooldown) {
        const facingDirection = mod.GetSoldierState(player, mod.SoldierStateVector.GetFacingDirection);
        const positionDelta = mod.CreateVector(mod.XComponentOf(facingDirection) * 2, 10, mod.ZComponentOf(facingDirection) * 2);
        console.log("Jetpacking: " + playerId);
        mod.MoveObject(player, positionDelta);
        LastJetpackTime.set(playerId, now);
    }
}