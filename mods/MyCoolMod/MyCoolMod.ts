console.log("Script loaded.");
export function OnPlayerDeployed(player: mod.Player) {
    const playerId = mod.GetObjId(player);
    const message = mod.Message(mod.stringkeys.welcome_message, playerId);
    mod.DisplayNotificationMessage(message, player);
    console.log("Player deployed " + playerId);
}
export function OnGameModeStarted() {
    console.log("Game mode started");
}
export function OnPlayerJoinGame(player: mod.Player) {
    const playerId = mod.GetObjId(player);
    console.log("Player joined " + playerId);
}
export function OnPlayerLeaveGame(playerId: number) {
    console.log("Player left " + playerId);
}