// QuickJS: console.log: false

// QuickJS: console.log: Not Firestorm

// QuickJS: console.log: true

// QuickJS: console.log: Abbasid is the current map
    export function OnGameModeStarted() {
        console.log("OnGameModeStarted");
        mod.SetAIToHumanDamageModifier(0);
    }

let tick = 0;
export function OngoingGlobal() {
    if (tick % 30 == 0) {
        console.log(mod.IsCurrentMap(mod.Maps.Abbasid));
        if (mod.IsCurrentMap(mod.Maps.Abbasid)) {
            console.log("Abbasid is the current map");
        } else {
            console.log("Not Abbasid");
        }
        LogGlobal();
    }
    tick++;
}

function LogGlobal() {
    for (const key of Object.keys(globalThis)) {
        console.log(key);
        if (key === 'libModule') {
            for (const key2 of Object.keys(globalThis[key as keyof typeof globalThis])) {
                console.log("libModule." + key2);
            }
        }
        if (key === 'mainModule') {
            for (const key2 of Object.keys(globalThis[key as keyof typeof globalThis])) {
                console.log("mainModule." + key2);
            }
        }

        console.log("--------------------------------");
    }
}

// mod.IsCurrentMap = (map: mod.Maps): boolean => {
//     const objectKey = "RuntimeSpawn_" + map;
//     const objectEnum = mod[objectKey as keyof typeof mod];
//     if (objectEnum) {
//         // get first object of this type
//         const object = objectEnum[0];
//         // try to spawn it
//         const spawnedObjectId = mod.SpawnObject(object, mod.CreateVector(0, 0, 0), mod.CreateVector(0, 0, 0));

//     }
// }

function manageTeamSpawning() {
    let team1Count = 0;
    let team2Count = 0;
    const players = mod.AllPlayers();
    const n = mod.CountOf(players);
    for (let i = 0; i < n; i++) {
        const player = mod.ValueInArray(players, i);
        const team = mod.GetObjId(mod.GetTeam(player));
        if (team == 1) {
            team1Count++;
        } else if (team == 2) {
            team2Count++;
        } else {
            console.log("Player is on an invalid team: ", team);
        }
    }

    if (team2Count < 1) {
        const spawner = mod.GetSpawner(100);
        if (spawner) {
            console.log("Spawning AI for team 2");
            mod.SpawnAIFromAISpawner(spawner, mod.SoldierClass.Engineer, mod.GetTeam(2));
        } else {
            console.log("Failed to get spawner for team 2");
        }
    }
    console.log("Team 1 count: ", team1Count);
    console.log("Team 2 count: ", team2Count);
}

/**
 * Try out guns.
 * 
 * UI which allows players to live-swap all weapons and attachments.
 * 
 * 
 */
export function OngoingPlayer(player: mod.Player) {
    const state = PlayerState.getState(mod.GetObjId(player));
    if (!state.alive || !state.isHuman) {
        return;
    }
    if (mod.IsPlayerValid(player) && mod.GetSoldierState(player, mod.SoldierStateBool.IsJumping)) {
        mod.EnableUIInputMode(true, player);
        TryGunsUI.render(player);
    }
}

export function OnPlayerJoinGame(player: mod.Player) {
    console.log("OnPlayerJoinGame ", player);
    PlayerState.getState(mod.GetObjId(player)).isHuman = true;
}

export function OnPlayerLeaveGame(playerId: number) {
    TryGunsUI.destroy(playerId);
    console.log("OnPlayerLeaveGame ", playerId);
    PlayerState.state.delete(playerId);
}

export function OnPlayerDeployed(player: mod.Player) {
    if (mod.GetSoldierState(player, mod.SoldierStateBool.IsAISoldier)) {
        // console.log("AI player deployed, disabling shooting");
        // mod.AIEnableShooting(player, false);
    } else {
        TryGunsUI.render(player);
        console.log("OnPlayerDeployed ", player);
        mod.EnableUIInputMode(true, player);
        PlayerState.getState(mod.GetObjId(player)).alive = true;


        const weaponPackage = mod.CreateNewWeaponPackage();
        mod.AddAttachmentToWeaponPackage(mod.WeaponAttachments.Scope_Iron_Sights, weaponPackage);
        mod.AddAttachmentToWeaponPackage(mod.WeaponAttachments.Magazine_30rnd_Magazine, weaponPackage);
        mod.AddEquipment(player, mod.Weapons.Carbine_M277, weaponPackage);
    }
}

export function OnPlayerDied(player: mod.Player, eventOtherPlayer: mod.Player, eventDeathType: mod.DeathType, eventWeaponUnlock: mod.WeaponUnlock) {
    PlayerState.getState(mod.GetObjId(player)).alive = false;
}

export function OnPlayerUIButtonEvent(eventPlayer: mod.Player, eventUIWidget: mod.UIWidget, eventUIButtonEvent: mod.UIButtonEvent) {
    TryGunsUI.handleButtonEvent(eventPlayer, eventUIWidget, eventUIButtonEvent);
}

interface TryGunsCallback {
    (player: mod.Player, eventUIWidget: mod.UIWidget, eventUIButtonEvent: mod.UIButtonEvent): void;
}

interface PlayerData {
    alive: boolean,
    selectedWeaponCategory: string;
    selectedWeapon: string;
    selectedAttachmentCategory: string;
    selectedAttachments: Map<string, string>;
    isHuman: boolean;
}

class PlayerState {
    static state: Map<number, PlayerData> = new Map();

    static getState(playerId: number): PlayerData {
        let state = PlayerState.state.get(playerId);
        if (!state) {
            state = { alive: false, selectedWeaponCategory: "", selectedAttachmentCategory: "", selectedAttachments: new Map(), selectedWeapon: "", isHuman: false };
            PlayerState.state.set(playerId, state);
        }
        return state;
    }

    static giveWeapon(player: mod.Player) {
        const playerId = mod.GetObjId(player);
        const playerData = PlayerState.getState(playerId);
        if (playerData.selectedWeapon !== "") {
            const weaponPackage = mod.CreateNewWeaponPackage();
            for (const attachment of playerData.selectedAttachments.values()) {
                console.log("adding attachment: ", attachment, " to weapon package");
                mod.AddAttachmentToWeaponPackage(mod.WeaponAttachments[attachment as keyof typeof mod.WeaponAttachments], weaponPackage);
            }
            console.log("giving weapon: ", playerData.selectedWeapon, " to player");
            mod.AddEquipment(player, mod.Weapons[playerData.selectedWeapon as keyof typeof mod.Weapons], weaponPackage);
        }
    }
}

/**
 * UI for the TryGuns mod.
 * 
 * Allows players to live-swap all weapons and attachments.
 * 
 * One instance of this UI is created for each player.
 * (does it need to be per player?)
 *  - is the point of per-player UIs to allow uis to show something different to each player?
 *  - or to just have an instance of the ui components for each player?
 *  - it must be for display
 *  - so a list of weapons could be just one global instance, unless you wanted to highlight active weapons
 * 
 */
class TryGunsUI {

    private static buttonHeight = 90;
    private static buttonWidth = 160;
    private static itemsPerRow = 12;
    private static width = TryGunsUI.buttonWidth * TryGunsUI.itemsPerRow;
    private static height = TryGunsUI.buttonHeight * TryGunsUI.itemsPerRow;
    private static registry: Set<string> = new Set();
    private static callbackRegistry: Map<number, Map<string, TryGunsCallback>> = new Map();

    /**
     * Get root container for the player.
     * Create Tab Header
     * Create Show Hide Button
     * 
     * Get the objects, then set the attributes.
     * 
     * 
     */
    static render(player: mod.Player) {
        const playerId = mod.GetObjId(player);
        const rootContainerName = TryGunsUI.rootContainerName(playerId);

        const container = TryGunsUI.getOrCreateUIWidget(rootContainerName, () => {
            mod.AddUIContainer(rootContainerName, mod.CreateVector(0, 0, 0), mod.CreateVector(TryGunsUI.width, TryGunsUI.height, 0), mod.UIAnchor.Center, player);
            TryGunsUI.registry.add(rootContainerName);
        });
        if (!container) {
            console.log("Failed to create root container");
            return;
        }
        mod.SetUIWidgetBgColor(container, mod.CreateVector(0.2, 0.2, 0.2));
        mod.SetUIWidgetBgAlpha(container, 0.5);
        mod.SetUIWidgetBgFill(container, mod.UIBgFill.Solid);
        mod.SetUIWidgetVisible(container, true);

        const weaponCategorySelectors = [];
        interface RowItem {
            name: string,
            callback: () => void
        }
        const rows: RowItem[][] = [
            [
                {
                    name: "Close",
                    callback: () => {
                        console.log("showHideButton clicked");
                        mod.EnableUIInputMode(false, player);
                        TryGunsUI.destroy(playerId);
                    }
                }
            ]
        ];
        const playerData = PlayerState.getState(playerId);
        const weaponCategories: Set<string> = new Set();
        for (const weaponKey of Object.keys(mod.Weapons)) {
            if (typeof weaponKey === 'string' && weaponKey in mod.Weapons) {
                weaponCategories.add(weaponKey.split("_")[0]);
            }
        }
        for (const weaponCategory of weaponCategories) {
            weaponCategorySelectors.push({
                name: weaponCategory,
                callback: () => {
                    console.log("selecting weapon category: ", weaponCategory);
                    playerData.selectedWeaponCategory = weaponCategory;
                    TryGunsUI.destroy(playerId);
                    TryGunsUI.render(player);
                }
            });
        }
        rows.push(weaponCategorySelectors);
        const attachmentCategorySelectors = [];
        const attachmentCategories: Set<string> = new Set();
        for (const attachmentKey of Object.keys(mod.WeaponAttachments)) {
            if (typeof attachmentKey === 'string' && attachmentKey in mod.WeaponAttachments) {
                attachmentCategories.add(attachmentKey.split("_")[0]);
            }
        }
        for (const attachmentCategory of attachmentCategories) {
            attachmentCategorySelectors.push({
                name: attachmentCategory,
                callback: () => {
                    console.log("selecting attachment category: ", attachmentCategory);
                    playerData.selectedAttachmentCategory = attachmentCategory;
                    TryGunsUI.destroy(playerId);
                    TryGunsUI.render(player);
                }
            });
        }

        const selectedWeaponCategory = playerData.selectedWeaponCategory == "" ? weaponCategories.values().next().value : playerData.selectedWeaponCategory;
        const selectedAttachmentCategory = playerData.selectedAttachmentCategory == "" ? attachmentCategories.values().next().value : playerData.selectedAttachmentCategory;
        if (!selectedWeaponCategory || !selectedAttachmentCategory) {
            console.log("No selected weapon or attachment category");
            return;
        }
        // categories
        const weaponRow:RowItem[] =  [];
        for (const weaponKey of Object.keys(mod.Weapons)) {
            if (typeof weaponKey === 'string' && weaponKey in mod.Weapons) {
                if (weaponKey.startsWith(selectedWeaponCategory)) {
                    const displayName = weaponKey.substring(selectedWeaponCategory.length);
                    weaponRow.push({
                        name: displayName,
                        callback: () => {
                            console.log("adding weapon: ", weaponKey);
                            // const weapon = weaponKey as keyof typeof mod.Weapons;
                            playerData.selectedWeapon = weaponKey;
                            PlayerState.giveWeapon(player);
                        }
                    });
                }
            }
        }
        rows.push(weaponRow);
        rows.push(attachmentCategorySelectors);

        const attachmentRow:RowItem[] = [];
        for (const attachmentKey of Object.keys(mod.WeaponAttachments)) {
            if (typeof attachmentKey === 'string' && attachmentKey in mod.WeaponAttachments) {
                if (attachmentKey.startsWith(selectedAttachmentCategory)) {
                    const displayName = attachmentKey.substring(selectedAttachmentCategory.length);
                    attachmentRow.push({
                        name: displayName,
                        callback: () => {
                            console.log("adding attachment: ", attachmentKey);
                            const isCurrentAttachment = playerData.selectedAttachments.get(selectedAttachmentCategory) === attachmentKey;
                            if (isCurrentAttachment) {
                                playerData.selectedAttachments.delete(selectedAttachmentCategory);
                            } else {
                                playerData.selectedAttachments.set(selectedAttachmentCategory, attachmentKey);
                            }
                            PlayerState.giveWeapon(player);
                        }
                    });
                }
            }
        }
        rows.push(attachmentRow);
        let buttonId = 0;
        for (const row of rows) {
            if (buttonId % TryGunsUI.itemsPerRow !== 0) {
                buttonId = buttonId + (TryGunsUI.itemsPerRow - (buttonId % TryGunsUI.itemsPerRow));
            }
            for (const item of row) {
                const row = Math.floor(buttonId / TryGunsUI.itemsPerRow);
                const column = buttonId % TryGunsUI.itemsPerRow;
                const position = mod.CreateVector(column * TryGunsUI.buttonWidth, row * TryGunsUI.buttonHeight, 0);
                const buttonName = TryGunsUI.buttonName(playerId, buttonId++);
                const button = TryGunsUI.getOrCreateUIWidget(buttonName, () => {
                    mod.AddUIButton(buttonName, position, mod.CreateVector(TryGunsUI.buttonWidth, TryGunsUI.buttonHeight, 0), mod.UIAnchor.TopLeft, player);
                    TryGunsUI.registerCallback(player, buttonName, (player, eventUIWidget, eventUIButtonEvent) => {
                        console.log("text clicked");
                        item.callback();
                    });
                }, (widget) => {
                    mod.SetUIWidgetBgColor(widget, mod.CreateVector(0.6, 0.6, 0.6));
                    mod.SetUIWidgetBgAlpha(widget, 0.5);
                    mod.SetUIWidgetBgFill(widget, mod.UIBgFill.Solid);
                    mod.SetUIWidgetVisible(widget, true);
                    mod.SetUIWidgetParent(widget, container);
                });
                const characters = item.name.toLowerCase().split("");
                let charIndex = 0;
                for (const character of characters) {
                    const textName = buttonName + "_text_" + charIndex++;
                    const displayCharacter = mod.stringkeys[character] || " ";
                    const message = mod.Message(displayCharacter);
                    const charPosition = mod.CreateVector(
                        mod.XComponentOf(position) + charIndex * 6,
                        mod.YComponentOf(position) - 10 + TryGunsUI.buttonHeight / 2,
                        mod.ZComponentOf(position)
                    )
                    // console.log(`Character ${character} -> ${displayCharacter}`);
                    const _text = TryGunsUI.getOrCreateUIWidget(textName, () => {
                        mod.AddUIText(textName, charPosition, mod.CreateVector(10, 10, 0), mod.UIAnchor.TopLeft, container, true, 0, mod.CreateVector(0, 0, 0), 0, mod.UIBgFill.Solid, message, 10, mod.CreateVector(1, 1, 1), 1, mod.UIAnchor.CenterLeft, player);
                        // console.log(`Text: ${textName}`);
                    });
                }
            }
        }
    }

    static getOrCreateUIWidget(name: string, initialize: () => void, setup?: (widget: mod.UIWidget) => void): mod.UIWidget | null {
        let widget = mod.FindUIWidgetWithName(name);
        if (!widget) {
            initialize();
            widget = mod.FindUIWidgetWithName(name);

        }
        if (widget && setup) {
            setup(widget);
        }
        return widget;
    }

    static handleButtonEvent(player: mod.Player, eventUIWidget: mod.UIWidget, eventUIButtonEvent: mod.UIButtonEvent) {
        const playerId = mod.GetObjId(player);
        const widgetName = mod.GetUIWidgetName(eventUIWidget);
        const callback = TryGunsUI.callbackRegistry.get(playerId)?.get(widgetName);
        if (callback) {
            callback(player, eventUIWidget, eventUIButtonEvent);
        }
    }

    static registerCallback(player: mod.Player, widgetName: string, callback: TryGunsCallback) {
        const playerId = mod.GetObjId(player);
        if (!TryGunsUI.callbackRegistry.has(playerId)) {
            TryGunsUI.callbackRegistry.set(playerId, new Map());
        }
        TryGunsUI.callbackRegistry.get(playerId)?.set(widgetName, callback);
    }

    private static rootContainerName(playerId: number): string {
        return `tryguns_${playerId}`;
    }

    private static showHideButtonName(playerId: number): string {
        return `tryguns_${playerId}_show_hide`;
    }

    private static buttonName(playerId: number, buttonId: number): string {
        return `tryguns_${playerId}_button_${buttonId}`;
    }

    static destroy(playerId: number) {
        const rootContainerName = TryGunsUI.rootContainerName(playerId);
        const rootContainer = mod.FindUIWidgetWithName(rootContainerName);
        if (rootContainer) {
            mod.DeleteUIWidget(rootContainer);
            TryGunsUI.registry.delete(rootContainerName);
            TryGunsUI.callbackRegistry.delete(playerId);
        }
    }
}
