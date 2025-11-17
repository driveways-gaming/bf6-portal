class Bot {
    private static MAX_X: number = 10;
    private static MAX_Z: number = 10;
    private static THINK_INTERVAL_SECONDS: number = 1;
    private originPosition: mod.Vector;
    private lastThought: number = 0;
    private destination: mod.Vector;
    constructor(originPosition: mod.Vector) {
        this.originPosition = originPosition;
        this.destination = Bot.getRandomDestination(this.originPosition);
    }
    update(player: mod.Player) {
        const now = mod.GetMatchTimeElapsed();
        if (now - this.lastThought < Bot.THINK_INTERVAL_SECONDS) {
            return;
        }
        this.lastThought = now;
        const position = mod.GetObjectPosition(player);
        const horizontal_distance = Math.sqrt(Math.pow(mod.XComponentOf(position) - mod.XComponentOf(this.destination), 2) + Math.pow(mod.ZComponentOf(position) - mod.ZComponentOf(this.destination), 2));
        if (horizontal_distance < 2) {
            console.log("Reached destination, moving to new destination");
            this.destination = Bot.getRandomDestination(this.originPosition);
        } else {
            console.log("Moving to destination: " + mod.XComponentOf(this.destination) + " " + mod.YComponentOf(this.destination) + " " + mod.ZComponentOf(this.destination) + " distance: " + horizontal_distance);
            mod.AIMoveToBehavior(player, this.destination);
        }
    }
    private static getRandomDestination(originPosition: mod.Vector): mod.Vector {
        return mod.Add(originPosition, mod.CreateVector(Math.random() * Bot.MAX_X, 0, Math.random() * Bot.MAX_Z));
    }
}
const bots: Map<number, Bot> = new Map();
export function OnGameModeStarted() {
    console.log("AIMovement started");
    const spawner = mod.GetSpawner(100);
    mod.SpawnAIFromAISpawner(spawner, mod.SoldierClass.Engineer, mod.GetTeam(1));
}
export function OnPlayerDeployed(player: mod.Player) {
    if (mod.GetSoldierState(player, mod.SoldierStateBool.IsAISoldier)) {
        const botOriginPosition = mod.GetObjectPosition(player);
        console.log("Bot origin position: " + mod.XComponentOf(botOriginPosition) + " " + mod.YComponentOf(botOriginPosition) + " " + mod.ZComponentOf(botOriginPosition));
        bots.set(mod.GetObjId(player), new Bot(botOriginPosition));
    }
}
export function OngoingPlayer(player: mod.Player) {
    const bot = bots.get(mod.GetObjId(player));
    if (bot) {
        bot.update(player);
    }
}