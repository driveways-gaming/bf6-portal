import * as modlib from 'modlib';

const playerTexts = new Map<number, mod.UIWidget>();
export function OnPlayerDeployed(player: mod.Player) {
    const playerId = mod.GetObjId(player);
    if (playerTexts.has(playerId)) {
        return;
    }
    const text = modlib.ParseUI(
        {
            name: "PlayerGreetingText_" + playerId,
            type: "Text",
            position: [905, 515],
            size: [110, 50],
            anchor: mod.UIAnchor.TopLeft,
            visible: true,
            padding: 0,
            bgColor: [0.2, 0.2, 0.2],
            bgAlpha: 1,
            bgFill: mod.UIBgFill.None,
            textLabel: mod.Message(mod.stringkeys.Greeting, playerId),
            textColor: [1, 1, 1],
            textAlpha: 1,
            textSize: 24,
            textAnchor: mod.UIAnchor.Center,
            playerId: player,
        }
    );
    if (text) {
        playerTexts.set(playerId, text);
    }
}

const Black = mod.CreateVector(0, 0, 0);
const White = mod.CreateVector(1, 1, 1);
export function OngoingPlayer(player: mod.Player) {
    const playerId = mod.GetObjId(player);
    const text = playerTexts.get(playerId);
    if (text) {
        mod.SetUITextColor(text, White);
        const now = mod.GetMatchTimeElapsed();
        if (Math.floor(now) % 2 === 0) {
            mod.SetUITextColor(text, Black);
        } else {
            mod.SetUITextColor(text, White);
        }
    }
}
