function Arena() {

}

function CenterArena(center: mod.Vector) {
    // console.log("Game started");
    // let ringOfFire = mod.GetRingOfFire(400);
    // if (ringOfFire) {
        
    //     const ringOfFirePosition = mod.GetObjectPosition(ringOfFire);
    //     console.log("Ring of fire position: " + mod.XComponentOf(ringOfFirePosition) + " " + mod.YComponentOf(ringOfFirePosition) + " " + mod.ZComponentOf(ringOfFirePosition));
    //     const delta = mod.Subtract(center, ringOfFirePosition);
    //     mod.MoveObject(ringOfFire, delta);
    //     console.log("Ring of fire position: " + mod.XComponentOf(ringOfFirePosition) + " " + mod.YComponentOf(ringOfFirePosition) + " " + mod.ZComponentOf(ringOfFirePosition));
    //     console.log("Ring of fire moved" + mod.XComponentOf(delta) + " " + mod.YComponentOf(delta) + " " + mod.ZComponentOf(delta));
    // } else {
    //     console.log("Ring of fire not found");
    // }
    const ball = mod.GetSpatialObject(600);
    if (ball) {
        const ballPosition = mod.GetObjectPosition(ball);
        const delta = mod.Subtract(center, ballPosition);
        // but increase y by 10m
        const finalDelta = mod.CreateVector(mod.XComponentOf(delta) - 1, mod.YComponentOf(delta) + 10, mod.ZComponentOf(delta));
        mod.MoveObject(ball, finalDelta);
    } else {
        console.log("Ball not found");
    }
}

let tracking = false;
export function OnPlayerDeployed(player: mod.Player) {
    console.log("Player deployed", player);
    tracking = true;
}

export function OnPlayerDied(player: mod.Player) {
    console.log("Player died", player);
    tracking = false;
}

let tick = 0;
export function OngoingGlobal() {
    tick++;
}

export function OngoingPlayer(player: mod.Player) {
    if (tracking && tick % 30 == 0) {
        let playerPosition = mod.GetSoldierState(player, mod.SoldierStateVector.GetPosition);
        if (playerPosition) {
            CenterArena(playerPosition);
        }
    }
}


export function OnGameModeStarted() {
    game = new Game();
}


let game: Game | null = null;

class Game {
    constructor() {
        console.log("Game started");
        let ringOfFire = mod.GetRingOfFire(400);
        if (ringOfFire) {
            mod.RingOfFireStart(ringOfFire);
            mod.SetRingOfFireStableTime(ringOfFire, 10);
            mod.SetRingOfFireDamageAmount(ringOfFire, 0);
            // mod.MoveObject(ringOfFire, mod.CreateVector(10, 0, 0));
            console.log("Ring of fire started");
        } else {
            console.log("Failed to get ring of fire");
        }
    }
}
