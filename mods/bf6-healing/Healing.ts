let tick = 0;
export function OngoingGlobal() {
    tick++;
}
const livePlayers = new Set<number>();
export function OnPlayerDeployed(player: mod.Player) {
    livePlayers.add(mod.GetObjId(player));
}
export function OnPlayerDied(player: mod.Player) {
    livePlayers.delete(mod.GetObjId(player));
}
export function OnPlayerLeft(player: mod.Player) {
    livePlayers.delete(mod.GetObjId(player));
}
export function OngoingPlayer(player: mod.Player) {
    if (livePlayers.has(mod.GetObjId(player))) {
        if (tick % 90 == 0) {
            console.log("Healing player");
            mod.Heal(player, 20);
        } else if (tick % 30 == 0) {
            console.log("Dealing damage to player");
            mod.DealDamage(player, 10);
        }
    }
}