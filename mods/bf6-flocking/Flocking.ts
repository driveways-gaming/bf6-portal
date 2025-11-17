class MutableVector {
    x: number;
    z: number;
    constructor(x: number,z: number) {
        this.x = x;
        this.z = z;
    }
    static fromModVector(vector: mod.Vector): MutableVector {
        return new MutableVector(mod.XComponentOf(vector), mod.ZComponentOf(vector));
    }
    update(vector: mod.Vector) {
        this.x = mod.XComponentOf(vector);
        this.z = mod.ZComponentOf(vector);
    }
    toModVector(): mod.Vector {
        return mod.CreateVector(this.x, 0, this.z);
    }
    distanceTo(other: MutableVector): number {
        return Math.sqrt(Math.pow(this.x - other.x, 2) + Math.pow(this.z - other.z, 2));
    }
    subtract(other: MutableVector): MutableVector {
        return new MutableVector(this.x - other.x, this.z - other.z);
    }
    add(other: MutableVector): MutableVector {
        return new MutableVector(this.x + other.x, this.z + other.z);
    }
    divide(scalar: number): MutableVector {
        return new MutableVector(this.x / scalar, this.z / scalar);
    }
    multiply(scalar: number): MutableVector {
        return new MutableVector(this.x * scalar, this.z * scalar);
    }
    length(): number {
        return Math.sqrt(Math.pow(this.x, 2) + Math.pow(this.z, 2));
    }
}

class Boid {
    playerId: number;
    velocity: MutableVector;
    position: MutableVector;
    private lastUpdate: number = 0;
    private static UPDATE_INTERVAL_SECONDS: number = 1;
    private static LOOK_AHEAD_SECONDS: number = 2;
    private static MAX_SPEED: number = 7;
    private static SEPARATION_DISTANCE: number = 10;

    constructor(playerId: number, position: mod.Vector) {
        this.playerId = playerId;
        this.velocity = new MutableVector(0, 0);
        this.position = MutableVector.fromModVector(position);
    }
    

    update(player: mod.Player, otherBoids: Boid[]) {
        const now = mod.GetMatchTimeElapsed();
        if (now - this.lastUpdate < Boid.UPDATE_INTERVAL_SECONDS) {
            return;
        }
        this.lastUpdate = now;
        this.position.update(mod.GetObjectPosition(player));
        const separation = Boid.separate(this, otherBoids);
        const alignment = Boid.align(this, otherBoids);
        const cohesion = Boid.cohesion(this, otherBoids);
        this.velocity.add(separation).add(alignment).add(cohesion);
        this.velocity = Boid.limit(this.velocity, Boid.MAX_SPEED);
        // this.position.add(this.velocity);
        const destination = this.position.add(this.velocity);
        mod.AIMoveToBehavior(player, destination.toModVector());
        if (this.velocity.length() > 5) {
            mod.AISetMoveSpeed(player, mod.MoveSpeed.Sprint);
        } else {
            mod.AISetMoveSpeed(player, mod.MoveSpeed.Walk);
        }
    }

    private static separate(boid: Boid, otherBoids: Boid[]): MutableVector {
        const separation = new MutableVector(0, 0);
        let count = 0;
        for (const otherBoid of otherBoids) {
            if (otherBoid.playerId === boid.playerId) continue;

            const distance = boid.position.distanceTo(otherBoid.position);
            if (distance < Boid.SEPARATION_DISTANCE) {
                const delta = boid.position.subtract(otherBoid.position);
                separation.add(delta.divide(distance));
                count++;
            }
        }
        return separation.divide(count);
    }

    private static align(boid: Boid, otherBoids: Boid[]): MutableVector {
        const alignment = new MutableVector(0, 0);
        let count = 0;
        for (const otherBoid of otherBoids) {
            if (otherBoid.playerId === boid.playerId) continue;
            alignment.add(otherBoid.velocity);
            count++;
        }
        if (count > 0) {
            return alignment.divide(count);
        }
        return new MutableVector(0, 0);
    }

    private static cohesion(boid: Boid, otherBoids: Boid[]): MutableVector {
        const cohesion = new MutableVector(0, 0);
        let count = 0;
        for (const otherBoid of otherBoids) {
            if (otherBoid.playerId === boid.playerId) continue;
            cohesion.add(otherBoid.position);
            count++;
        }
        if (count > 0) {
            return cohesion.divide(count);
        }
        return new MutableVector(0, 0);
    }

    private static limit(vector: MutableVector, max: number): MutableVector {
        const length = Math.sqrt(Math.pow(vector.x, 2) + Math.pow(vector.z, 2));
        if (length > max) {
            return vector.divide(length).multiply(max);
        }
        return vector;
    }
}
class BotManager {
    private static MIN_SPAWNER_ID: number = 100;
    private static MAX_SPAWNER_ID: number = 163;
    private static team: mod.Team = mod.GetTeam(2);
    private spawners: mod.Spawner[] = [];
    private spawnerIndex: number = 0;
    constructor() {
            for (let i = BotManager.MIN_SPAWNER_ID; i <= BotManager.MAX_SPAWNER_ID; i++) {
            this.spawners.push(mod.GetSpawner(i));
        }
    }
    spawnBot() {
        const spawner = this.spawners[this.spawnerIndex];
        if (spawner) {
            mod.SpawnAIFromAISpawner(spawner, mod.SoldierClass.Engineer, BotManager.team);
        }
        this.spawnerIndex++;
        if (this.spawnerIndex >= this.spawners.length) {
            this.spawnerIndex = 0;
        }
    }
}
const botManager = new BotManager();

const liveBoids: Map<number, Boid> = new Map();
export function OnPlayerDeployed(player: mod.Player) {
    const boid = new Boid(mod.GetObjId(player), mod.GetObjectPosition(player));
    liveBoids.set(mod.GetObjId(player), boid);
}
export function OnPlayerDied(player: mod.Player) {
    if (mod.GetSoldierState(player, mod.SoldierStateBool.IsAISoldier)) {
        botManager.spawnBot();
    }
    liveBoids.delete(mod.GetObjId(player));
}
export function OnPlayerLeaveGame(playerId: number) {
    liveBoids.delete(playerId);
}
export function OngoingPlayer(player: mod.Player) {
    const boid = liveBoids.get(mod.GetObjId(player));
    if (boid) {
        boid.update(player, Array.from(liveBoids.values()));
    }
}



export function OnGameModeStarted() {
    for (let i = 0; i < 31; i++) {
        botManager.spawnBot();
    }
}