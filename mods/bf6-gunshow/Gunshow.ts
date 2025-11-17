/**
 * Engine Quirks
 * - Portal SDK functions may return different object instances each time, even for the same logical entity
 * - Opaque objects (Player, Team, etc.) cannot be reliably used as Map keys due to inconsistent object identity
 * - Use mod.GetObjId() to extract stable IDs for consistent identification and Map keys
 * - ForceSwitchInventory does not skip weapon draw time
 * - Cannot get KV9 to fire only a single round with AIForceFire(,0) when more than one round is loaded
 * - Setting magazine to 1 on every tick seems to allow AI to fire KV9 twice per tick
 * - To skip reload animation, remove and re-add weapons, but this causes weapon draw time delay
 * - Waiting until ammo == 0 then immediately adding ammo does not skip reload animation
 * - Could allow most weapons to have more than one round, and just force the SMGs to re-equip after each shot
 * - For simplicity we just give all weapons a single round and re-equip after each shot
 * - All typescript content must be included in this file, cannot use any imports other than those provided by the engine.
 * - Any strings to be used in Messages must be defined in the associated .strings.json file.
 * 
 * Got stuck
 * M39 vs SVK
 * PSR vs SV98
 * 
 * *** IMPORTANT: Always increment VERSION[2] when making any code changes! ***
 */
const VERSION = [0, 0,
    394
];

const REQUIRED_HITS_AT_RANGE = 10;
const MAX_TEAM_SIZE = 30;
const SPAWN_CHECK_INTERVAL = 1; // seconds
const UI_UPDATE_INTERVAL = 1; // seconds
const DUEL_UPDATE_INTERVAL = 0; // immediate
const TICK_UPDATE_INTERVAL = 0; // immediate
const SPAWN_POINT_TEAM_1 = 101;
const SPAWN_POINT_TEAM_2 = 100;


let instance: Gunshow | null = null;

export class DamageDropoffs2 {
    distanceDamages: Map<number, number[]> = new Map();
    seenDamages: Set<number> = new Set();

    /**
     * Exclude hits that do 1/3 damage of a seen damage value.
     * This could lead to bugs in the future if a weapon does 1/3 of its damage at some other range,
     * but I do not believe this is the case today.
     */
    hitIsPenetrating(damage: number): boolean {
        for (let seenDamage of this.seenDamages) {
            const thirdDamage = seenDamage / 3;
            if (Math.abs(damage - thirdDamage) < 0.1) {
                if (this.seenDamages.has(damage)) {
                    this.seenDamages.delete(damage);
                    // Notify(1, 1, damage);
                }
                return true;
            }
        }
        this.seenDamages.add(damage);
        return false;
    }

    recordHit(damage: number, _distance: number) {
        if (this.hitIsPenetrating(damage)) {
            return;
        }
        let distance = mod.Floor(_distance);
        let damages = this.distanceDamages.get(distance);
        if (!damages) {
            damages = [];
            this.distanceDamages.set(distance, damages);
        }
        damages.push(damage);
    }

    toDropoffs(): [number, number][] {
        const dropoffs: [number, number][] = [];
        this.distanceDamages.forEach((damages, distance) => {
            let modeDamage = 0;
            let maxCount = 0;
            const damageCounts: Map<number, number> = new Map();
            damages.forEach(damage => {
                const count = damageCounts.get(damage) || 0;
                damageCounts.set(damage, count + 1);
            });
            damageCounts.forEach((count, damage) => {
                if (count > maxCount) {
                    maxCount = count;
                    modeDamage = damage;
                }
            });
            dropoffs.push([modeDamage, distance]);
        });
        dropoffs.sort((a, b) => a[1] - b[1]); // sort by distance
        // remove entries where the damage doesn't change
        const filteredDropoffs: [number, number][] = [];
        let lastDamage = -1;
        for (const [damage, distance] of dropoffs) {
            if (damage !== lastDamage) {
                filteredDropoffs.push([damage, distance]);
                lastDamage = damage;
            }
        }
        return filteredDropoffs;
    }

    numHitsAtRange(range: number): number {
        const damages = this.distanceDamages.get(range);
        // count of most frequent damage at this range
        if (damages) {
            const damageCounts: Map<number, number> = new Map();
            damages.forEach(damage => {
                const count = damageCounts.get(damage) || 0;
                damageCounts.set(damage, count + 1);
            });
            let maxCount = 0;
            damageCounts.forEach((count) => {
                if (count > maxCount) {
                    maxCount = count;
                }
            });
            return maxCount;
        }
        return 0;
    }

    prune() {
        const dropoffs = this.toDropoffs();
        this.distanceDamages.clear();
        for (const [damage, distance] of dropoffs) {
            this.distanceDamages.set(distance, [damage]);
        }
    }
}

enum DuelState {
    WaitingForPlayers,
    Positioning,
    Arming,
    PreAttack,
    Attack,
    Attacking,
    PostAttack,
}


// const ROOT_POSITION = mod.CreateVector(0, 114, 450); // firestorm
const ROOT_POSITION = mod.CreateVector(-380, 220, 20); // tech campus

let nextDuelId = 0;
class Duel {
    playerOneId: number | null = null;
    playerTwoId: number | null = null;
    weaponOne: mod.Weapons | null = null;
    weaponTwo: mod.Weapons | null = null;
    state: DuelState = DuelState.WaitingForPlayers;
    currentRange: number = 1;
    id: number;
    attackStart: number = 0;
    ammo: number = 1;
    playerOneDoneAttacking: boolean = false;
    playerTwoDoneAttacking: boolean = false;
    lastStateTransition: number = 0;
    lastLoggedStateTransition: number = 0;
    preAttackFailedReason: number = 0;
    lastTeleportOne: number = 0;
    lastTeleportTwo: number = 0;
    teleportDelay: number = 1;
    lastDistanceChange: number = 0;
    lastLoggedDistanceChange: number = 0;
    weaponTestCoordinator: WeaponTestCoordinator;

    constructor(weaponOne: mod.Weapons, weaponTwo: mod.Weapons) {
        this.weaponOne = weaponOne;
        this.weaponTwo = weaponTwo;
        this.id = nextDuelId++;
        this.weaponTestCoordinator = new WeaponTestCoordinator();
    }

    update() {
        const playerOne = instance!.playerManager.getById(this.playerOneId!);
        const playerTwo = instance!.playerManager.getById(this.playerTwoId!);
        const now = mod.GetMatchTimeElapsed();
        switch (this.state) {
            case DuelState.WaitingForPlayers:
                this.assignCombatants();
                // Check if both players are assigned
                if (this.playerOneId !== null && this.playerTwoId !== null) {
                    // Notify(this.playerOneId, this.playerTwoId, 12);
                    this.state = DuelState.Positioning;
                    this.lastStateTransition = mod.GetMatchTimeElapsed();
                }
                break;
            case DuelState.Positioning:
                // Check if we should progress to next range
                if (this.weaponTestCoordinator.shouldProgressToNextRange(this.weaponOne!, this.weaponTwo!, this.currentRange)) {
                    
                    const nextRange = this.weaponTestCoordinator.getNextRange();
                    if (nextRange === this.currentRange) {
                        console.log(`Next range is the same as the current range, ${nextRange} ${this.currentRange}`);
                    }
                    this.currentRange = nextRange;
                    this.weaponTestCoordinator.pruneTestData(this.weaponOne!);
                    this.weaponTestCoordinator.pruneTestData(this.weaponTwo!);
                    this.lastDistanceChange = now;
                }
                this.armCombatants();

                if (this.moveToPosition(this.currentRange)) {
                    this.state = DuelState.PreAttack;
                    this.lastStateTransition = now;
                }

                break;
            case DuelState.PreAttack:
                if (this.preAttack()) {
                    this.state = DuelState.Attack;
                    this.lastStateTransition = now;
                }
                break;
            case DuelState.Attack:
                // Handle in-progress duel logic
                // Notify(1, 1, 13);
                this.attack();
                this.attackStart = now;
                this.state = DuelState.Attacking;
                this.lastStateTransition = now;
                this.playerOneDoneAttacking = this.weaponTestCoordinator.isRangeComplete(this.weaponOne!, this.currentRange);
                this.playerTwoDoneAttacking = this.weaponTestCoordinator.isRangeComplete(this.weaponTwo!, this.currentRange);
                break;
            case DuelState.Attacking:
                // Check if players are done attacking based on ammo
                if (!this.playerOneDoneAttacking && playerOne) {
                    const profileOne = instance!.Players.get(playerOne);
                    if (profileOne.hasPrimaryWeapon()) {
                        const ammo = profileOne.primaryAmmo();
                        if (ammo <= this.ammo - 1) {
                            this.playerOneDoneAttacking = true;
                            this.disarmPlayerOne();
                        }
                    } else if (profileOne.hasSecondaryWeapon()) {
                        const ammo = profileOne.secondaryAmmo();
                        if (ammo <= this.ammo - 1) {
                            this.playerOneDoneAttacking = true;
                            this.disarmPlayerOne();
                        }
                    }
                }
                
                if (!this.playerTwoDoneAttacking && playerTwo) {
                    const profileTwo = instance!.Players.get(playerTwo);
                    if (profileTwo.hasPrimaryWeapon()) {
                        const ammo = profileTwo.primaryAmmo();
                        if (ammo <= this.ammo - 1) {
                            this.playerTwoDoneAttacking = true;
                            this.disarmPlayerTwo();
                        }
                    } else if (profileTwo.hasSecondaryWeapon()) {
                        const ammo = profileTwo.secondaryAmmo();
                        if (ammo <= this.ammo - 1) {
                            this.playerTwoDoneAttacking = true;
                            this.disarmPlayerTwo();
                        }
                    }
                }

                if (this.playerOneDoneAttacking && this.playerTwoDoneAttacking) {
                    this.state = DuelState.PostAttack;
                    this.lastStateTransition = now;
                }

                break;
            case DuelState.PostAttack:
                let waitForEquipment = false;
                
                if (this.playerOneId !== null) {
                    waitForEquipment = instance!.playerManager.cleanupAfterAttack(this.playerOneId, this.weaponOne!) || waitForEquipment;
                }
                if (this.playerTwoId !== null) {
                    waitForEquipment = instance!.playerManager.cleanupAfterAttack(this.playerTwoId, this.weaponTwo!) || waitForEquipment;
                }
                
                if (!waitForEquipment) {
                    this.state = DuelState.Positioning;
                    this.lastStateTransition = now;
                }
                break;
        }
        if (now - this.lastStateTransition > 3 && now - this.lastLoggedStateTransition > 10) {
            this.lastLoggedStateTransition = now;
            const weaponOneStr = GetWeaponName(this.weaponOne!);
            const weaponTwoStr = GetWeaponName(this.weaponTwo!);
            if (this.state == DuelState.PreAttack) {
                const playerOneSpeed = playerOne ? instance!.Players.get(playerOne).speed() : -1;
                const playerTwoSpeed = playerTwo ? instance!.Players.get(playerTwo).speed() : -1;
                console.log(`State: ${DuelState[this.state]}, Time since last transition: ${now - this.lastStateTransition}, Weapon One: ${weaponOneStr}, Weapon Two: ${weaponTwoStr}, PreAttackFailedReason: ${this.preAttackFailedReason}, Player One Speed: ${playerOneSpeed}, Player Two Speed: ${playerTwoSpeed}`);
            } else if (this.state === DuelState.Attacking) {
                const profileOne = playerOne ? instance!.Players.get(playerOne) : null;
                const profileTwo = playerTwo ? instance!.Players.get(playerTwo) : null;
                const playerOneHasPrimary = profileOne ? profileOne.hasPrimaryWeapon() : false;
                const playerTwoHasPrimary = profileTwo ? profileTwo.hasPrimaryWeapon() : false;
                const playerOneHasSecondary = profileOne ? profileOne.hasSecondaryWeapon() : false;
                const playerTwoHasSecondary = profileTwo ? profileTwo.hasSecondaryWeapon() : false;
                const playerOnePrimaryAmmo = profileOne && playerOneHasPrimary ? profileOne.primaryAmmo() : -1;
                const playerTwoPrimaryAmmo = profileTwo && playerTwoHasPrimary ? profileTwo.primaryAmmo() : -1;
                const playerOneSecondaryAmmo = profileOne && playerOneHasSecondary ? profileOne.secondaryAmmo() : -1;
                const playerTwoSecondaryAmmo = profileTwo && playerTwoHasSecondary ? profileTwo.secondaryAmmo() : -1;
                console.log(`State: ${DuelState[this.state]}, Time since last transition: ${now - this.lastStateTransition}, Weapon One: ${weaponOneStr}, Weapon Two: ${weaponTwoStr}, Player One Primary Ammo: ${playerOnePrimaryAmmo}, Player Two Primary Ammo: ${playerTwoPrimaryAmmo}, Player One Secondary Ammo: ${playerOneSecondaryAmmo}, Player Two Secondary Ammo: ${playerTwoSecondaryAmmo}, Player One has Primary: ${playerOneHasPrimary}, Player Two has Primary: ${playerTwoHasPrimary}, Player One has Secondary: ${playerOneHasSecondary}, Player Two has Secondary: ${playerTwoHasSecondary}, Player one done attacking: ${this.playerOneDoneAttacking}, Player two done attacking: ${this.playerTwoDoneAttacking}`);
            } else {
                console.log(`State: ${DuelState[this.state]}, Time since last transition: ${now - this.lastStateTransition}, Weapon One: ${weaponOneStr}, Weapon Two: ${weaponTwoStr}`);
            }
            if (now - this.lastDistanceChange > 3 && now - this.lastLoggedDistanceChange > 10) {
                console.log(`Time since last distance change: ${now - this.lastLoggedDistanceChange}, Current Range: ${this.currentRange} Weapon One: ${weaponOneStr}, Weapon Two: ${weaponTwoStr} `);
                this.lastLoggedDistanceChange = now;
            }
        }
    }

    private disarmPlayer(playerId: number, weapon: mod.Weapons) {
        const player = GetPlayerById(playerId);
        if (!player) {
            return;
        }
        const profile = instance!.Players.get(player);
        if (profile.hasEquipment(weapon)) {
            mod.RemoveEquipment(player, weapon);
        }
        mod.AIEnableShooting(player, false);
    }

    disarmPlayerOne() {
        this.disarmPlayer(this.playerOneId!, this.weaponOne!);
    }

    disarmPlayerTwo() {
        this.disarmPlayer(this.playerTwoId!, this.weaponTwo!);
    }


    assignCombatants() {
        if (!instance!.playerManager.isPlayerValid(this.playerOneId)) {
            this.playerOneId = null;
            const playerOne = instance!.playerManager.getNextUnassignedCombatant(mod.GetTeam(1));
            if (playerOne) {
                this.playerOneId = instance!.playerManager.getPlayerId(playerOne);
            }
        }
        if (!instance!.playerManager.isPlayerValid(this.playerTwoId)) {
            this.playerTwoId = null;
            const playerTwo = instance!.playerManager.getNextUnassignedCombatant(mod.GetTeam(2));
            if (playerTwo) {
                this.playerTwoId = instance!.playerManager.getPlayerId(playerTwo);
            }
        }
    }

    moveToPosition(range: number = 30): boolean {
        const now = mod.GetMatchTimeElapsed();
        const xOffset = this.id * 10;
        
        let playerOneInPosition = true;
        let playerTwoInPosition = true;
        
        if (this.playerOneId !== null) {
            let offset = mod.CreateVector(xOffset, 0, 0);
            let destination = mod.Add(ROOT_POSITION, offset);
            playerOneInPosition = instance!.playerManager.teleportPlayerToPosition(this.playerOneId, destination, mod.Pi() / 2, this.lastTeleportOne, this.teleportDelay);
            if (!playerOneInPosition) {
                this.lastTeleportOne = now;
            }
        }
        
        if (this.playerTwoId !== null) {
            let offset = mod.CreateVector(xOffset, 0, range);
            let destination = mod.Add(ROOT_POSITION, offset);
            playerTwoInPosition = instance!.playerManager.teleportPlayerToPosition(this.playerTwoId, destination, 0, this.lastTeleportTwo, this.teleportDelay);
            if (!playerTwoInPosition) {
                this.lastTeleportTwo = now;
            }
        }
        
        return playerOneInPosition && playerTwoInPosition;
    }

    armCombatants() {
        if (this.playerOneId !== null) {
            instance!.playerManager.setupPlayerForDuel(this.playerOneId, this.weaponOne!);
        }
        if (this.playerTwoId !== null) {
            instance!.playerManager.setupPlayerForDuel(this.playerTwoId, this.weaponTwo!);
        }
    }


    preAttack(): boolean {
        if (this.playerOneId === null || this.playerTwoId === null) {
            this.preAttackFailedReason = 1; // Missing players
            return false;
        }
        
        const playerOneResult = instance!.playerManager.preparePlayerForAttack(this.playerOneId, this.playerTwoId, this.ammo);
        const playerTwoResult = instance!.playerManager.preparePlayerForAttack(this.playerTwoId, this.playerOneId, this.ammo);
        
        if (!playerOneResult.success) {
            this.preAttackFailedReason = playerOneResult.reason;
            return false;
        }
        if (!playerTwoResult.success) {
            this.preAttackFailedReason = playerTwoResult.reason;
            return false;
        }
        
        this.preAttackFailedReason = 0; // Success
        return true;
    }

    attack() {
        if (this.playerOneId === null || this.playerTwoId === null) {
            return;
        }
        instance!.playerManager.enablePlayerShooting(this.playerOneId);
        instance!.playerManager.enablePlayerShooting(this.playerTwoId);
    }
}

// === SpawnManager Class ===

class SpawnManager {
    private teamPlayerCounts: TeamPlayerCounts;

    constructor() {
        this.teamPlayerCounts = new TeamPlayerCounts();
    }

    configureSpawners() {
        const spawnerIds = [SPAWN_POINT_TEAM_1, SPAWN_POINT_TEAM_2];
        for (const spawnerId of spawnerIds) {
            const spawner = mod.GetSpawner(spawnerId);
            if (spawner) {
                mod.AISetUnspawnOnDead(spawner, true);
                mod.SetUnspawnDelayInSeconds(spawner, SPAWN_CHECK_INTERVAL);
            }
        }
    }

    manageTeamSpawning() {
        const team1Count = this.teamPlayerCounts.getCount(mod.GetTeam(1));
        const team2Count = this.teamPlayerCounts.getCount(mod.GetTeam(2));
        
        if (team2Count < MAX_TEAM_SIZE) {
            const spawnPoint = mod.GetSpawner(SPAWN_POINT_TEAM_2);
            if (spawnPoint) {
                mod.SpawnAIFromAISpawner(spawnPoint, mod.SoldierClass.Engineer, mod.GetTeam(2));
            }
        }
        if (team1Count < MAX_TEAM_SIZE) {
            const spawnPoint2 = mod.GetSpawner(SPAWN_POINT_TEAM_1);
            if (spawnPoint2) {
                mod.SpawnAIFromAISpawner(spawnPoint2, mod.SoldierClass.Engineer, mod.GetTeam(1));
            }
        }
    }

    onPlayerSpawned(player: mod.Player) {
        this.teamPlayerCounts.onSpawn(player);
    }

    onPlayerDied(player: mod.Player) {
        this.teamPlayerCounts.onDeath(player);
    }

    getTeamPlayerCounts(): TeamPlayerCounts {
        return this.teamPlayerCounts;
    }
}

// === UIManager Class ===

class UIManager {
    tickIndicator: TickIndicator | null = null;

    constructor() {
        this.tickIndicator = new TickIndicator();
    }

    createPlayerUI(player: mod.Player): { gunshowUI: GunshowUI, versionUI: VersionUI } {
        const gunshowUI = new GunshowUI(player);
        const versionUI = new VersionUI();
        
        gunshowUI.open();
        versionUI.open();
        
        return { gunshowUI, versionUI };
    }

    updateGlobalStatistics(hitCount: number, tickRate: number) {
        // Update statistics for all players
        instance!.Players.allPlayers.forEach(profile => {
            const gunshowUI = profile.gunshowUI;
            if (!gunshowUI) {
                return;
            }
            gunshowUI.updateStats(hitCount, tickRate);
        });
    }

    updateWeaponDropoffs(weapon: mod.Weapons, dropoffs: [number, number][]) {
        // Update weapon dropoffs for all players
        instance!.Players.allPlayers.forEach(profile => {
            const gunshowUI = profile.gunshowUI;
            if (!gunshowUI) {
                return;
            }
            gunshowUI.updateDropoffsForWeapon(weapon, dropoffs);
        });
    }

    updateAllPlayerDisplays(players: Players, weaponDropoffs: WeaponDropoffs, stats: { numHits: number, tickRate: number }) {
        // Update UI display for all players
        players.allPlayers.forEach(profile => {
            const gunshowUI = profile.gunshowUI;
            if (!gunshowUI) {
                return;
            }
            gunshowUI.updateStats(stats.numHits, stats.tickRate);
            for (const weapon of GunshowWeapons) {
                const dropoffs = weaponDropoffs.getDropoffs(weapon);
                gunshowUI.updateDropoffsForWeapon(weapon, dropoffs);
            }
        });
    }

    updateTickIndicator() {
        if (this.tickIndicator) {
            this.tickIndicator.onTick();
            if (this.tickIndicator.tick % 30 === 0) {
                this.tickIndicator.update();
            }
        }
    }
}

// === WeaponTestCoordinator Class ===

class WeaponTestCoordinator {
    private readonly rangesToTest: number[] = [1, 10, 22, 37, 40, 55, 75, 76, 77, 78, 79, 80, 90, 125, 150];
    private readonly requiredHitsAtRange: number = REQUIRED_HITS_AT_RANGE;

    shouldProgressToNextRange(weaponOne: mod.Weapons, weaponTwo: mod.Weapons, currentRange: number): boolean {
        const numHitsOne = instance!.weaponDropoffs.numHitsAtRange(weaponOne, currentRange);
        const numHitsTwo = instance!.weaponDropoffs.numHitsAtRange(weaponTwo, currentRange);
        return numHitsOne >= this.requiredHitsAtRange && numHitsTwo >= this.requiredHitsAtRange;
    }

    getNextRange(): number {
        return this.rangesToTest.shift() || 1;
    }

    isRangeComplete(weapon: mod.Weapons, range: number): boolean {
        const numHits = instance!.weaponDropoffs.numHitsAtRange(weapon, range);
        return numHits >= this.requiredHitsAtRange;
    }

    pruneTestData(weapon: mod.Weapons) {
        instance!.weaponDropoffs.prune(weapon);
    }

    getCurrentRange(): number {
        return this.rangesToTest.length > 0 ? this.rangesToTest[0] : 1;
    }

    hasMoreRanges(): boolean {
        return this.rangesToTest.length > 0;
    }
}

// === PlayerManager Class ===

class PlayerManager {
    private cache: TickCache;
    // Symbol keys for cache entries
    private static readonly KEY_ALL_PLAYERS = Symbol('allPlayers');
    private static readonly KEY_PLAYERS_COUNT = Symbol('playersCount');
    private static readonly KEY_PLAYERS_BY_ID = Symbol('playersById');

    constructor() {
        this.cache = new TickCache();
    }

    private getAllPlayers() {
        return this.cache.get(PlayerManager.KEY_ALL_PLAYERS, () =>
            mod.AllPlayers()
        );
    }

    private getPlayersCount(): number {
        return this.cache.get(PlayerManager.KEY_PLAYERS_COUNT, () => {
            const allPlayers = this.getAllPlayers();
            return mod.CountOf(allPlayers);
        });
    }

    private getPlayersById(): Map<number, mod.Player> {
        return this.cache.get(PlayerManager.KEY_PLAYERS_BY_ID, () => {
            const allPlayers = this.getAllPlayers();
            const n = this.getPlayersCount();
            const playersById = new Map<number, mod.Player>();
            for (let i = 0; i < n; i++) {
                const player = mod.ValueInArray(allPlayers, i) as mod.Player;
                const id = mod.GetObjId(player);
                playersById.set(id, player);
            }
            return playersById;
        });
    }

    getById(playerId: number): mod.Player | null {
        return this.getPlayersById().get(playerId) || null;
    }

    getPlayerId(player: mod.Player): number {
        // Search through cached playersById map
        const playersById = this.getPlayersById();
        for (const [id, cachedPlayer] of playersById) {
            if (cachedPlayer === player) {
                return id;
            }
        }
        // Fallback if not found in cache (shouldn't happen, but safe fallback)
        return mod.GetObjId(player);
    }

    getNextUnassignedCombatant(team: mod.Team): mod.Player | null {
        const allPlayers = this.getAllPlayers();
        const n = this.getPlayersCount();
        for (let i = 0; i < n; i++) {
            let player = mod.ValueInArray(allPlayers, i) as mod.Player;
            let teamId = GetTeamId(team);
            const profile = instance!.Players.get(player);
            let playerTeamId = GetTeamId(profile.team());
            if (!profile.isAISoldier() || playerTeamId !== teamId) {
                continue;
            }
            const playerId = mod.GetObjId(player);
            let assigned = false;
            for (const duel of instance!.testQueue) {
                if (duel.playerOneId === playerId || duel.playerTwoId === playerId) {                    
                    assigned = true;
                    break;
                }
            }
            if (!assigned) {
                return player;
            }
        }
        return null;
    }

    isPlayerValid(playerId: number | null): boolean {
        if (!playerId) {
            return false;
        }
        const playerObj = this.getById(playerId);
        if (!playerObj) {
            return false;
        }
        const profile = instance!.Players.get(playerObj);
        if (!profile.isAlive()) {
            return false;
        }
        return true;
    }

    setupPlayerForDuel(playerId: number, weapon: mod.Weapons) {
        const player = this.getById(playerId);
        if (!player) {
            return;
        }
        const profile = instance!.Players.get(player);
        if (!profile.hasEquipment(weapon)) {
            mod.AddEquipment(player, weapon, CreateWeaponPackage(weapon));
        }
    }

    disarmPlayer(playerId: number, weapon: mod.Weapons) {
        const player = this.getById(playerId);
        if (!player) {
            return;
        }
        const profile = instance!.Players.get(player);
        if (profile.hasEquipment(weapon)) {
            mod.RemoveEquipment(player, weapon);
        }
        mod.AIEnableShooting(player, false);
    }

    teleportPlayerToPosition(playerId: number, position: mod.Vector, rotation: number, lastTeleport: number, teleportDelay: number): boolean {
        const player = this.getById(playerId);
        if (!player) {
            return true; // Consider player not found as "in position"
        }
        
        const now = mod.GetMatchTimeElapsed();
        if (PlayerHorizontalDistanceTo(player, position) > 0.5) {
            if (now - lastTeleport >= teleportDelay) {
                mod.Teleport(player, position, rotation);
                return false; // Still moving
            }
            return false; // Waiting for teleport delay
        }
        return true; // In position
    }

    configurePlayerAI(playerId: number, enableShooting: boolean) {
        const player = this.getById(playerId);
        if (!player) {
            return;
        }
        mod.AIEnableShooting(player, enableShooting);
    }

    preparePlayerForAttack(playerId: number, targetId: number, ammo: number): { success: boolean, reason: number } {
        const player = this.getById(playerId);
        const target = this.getById(targetId);
        if (!player || !target) {
            return { success: false, reason: 1 }; // Missing player
        }

        // Disable shooting initially
        mod.AIEnableShooting(player, false);

        // Set ammo
        const profile = instance!.Players.get(player);
        if (profile.hasPrimaryWeapon()) {
            mod.SetInventoryAmmo(player, mod.InventorySlots.PrimaryWeapon, ammo);
        } else if (profile.hasSecondaryWeapon()) {
            mod.SetInventoryAmmo(player, mod.InventorySlots.SecondaryWeapon, ammo);
        }

        // Check disallowed states
        const disallowedStates = [
            mod.SoldierStateBool.IsReloading,
            mod.SoldierStateBool.IsInAir,
            mod.SoldierStateBool.IsFiring,
        ];
        for (const state of disallowedStates) {
            if (mod.GetSoldierState(player, state)) {
                return { success: false, reason: 2 }; // In disallowed state
            }
        }

        // Check if basically still
        const basicallyStill = 0.1;
        if (profile.speed() > basicallyStill) {
            return { success: false, reason: 3 }; // Moving too fast
        }

        // Check weapon is active
        if (!(profile.hasPrimaryWeapon() || profile.hasSecondaryWeapon())) {
            return { success: false, reason: 4 }; // No weapon active
        }

        // Check and heal health
        if (!this.isPlayerAtMaxHealth(player)) {
            this.healPlayerToFull(player);
            return { success: false, reason: 5 }; // Healing in progress
        }

        // Set target and spot
        mod.AISetTarget(player, target);
        mod.SpotTarget(player, 10, mod.SpotStatus.SpotInBoth);
        return { success: true, reason: 0 }; // Success
    }

    enablePlayerShooting(playerId: number) {
        const player = this.getById(playerId);
        if (!player) {
            return;
        }
        mod.AIEnableShooting(player, true);
    }

    setupAISpawn(player: mod.Player) {
        this.removeDefaultEquipment(player);
        mod.AIEnableShooting(player, false);
        mod.AIGadgetSettings(player, false, false, false);
        mod.SetPlayerMaxHealth(player, 500);
    }

    private removeDefaultEquipment(player: mod.Player) {
        for (const slot of [
            mod.InventorySlots.ClassGadget,
            mod.InventorySlots.GadgetOne,
            mod.InventorySlots.MeleeWeapon,
            mod.InventorySlots.PrimaryWeapon,
            mod.InventorySlots.SecondaryWeapon,
        ]) {
            mod.RemoveEquipment(player, slot);
        }
    }

    private isPlayerAtMaxHealth(player: mod.Player): boolean {
        const profile = instance!.Players.get(player);
        return profile.currentHealth() >= profile.maxHealth();
    }

    private healPlayerToFull(player: mod.Player): void {
        const profile = instance!.Players.get(player);
        mod.Heal(player, profile.maxHealth());
    }

    cleanupAfterAttack(playerId: number, weapon: mod.Weapons): boolean {
        const player = this.getById(playerId);
        if (!player) {
            return false;
        }
        
        this.enablePlayerShooting(playerId);
        
        const profile = instance!.Players.get(player);
        if (profile.hasEquipment(weapon)) {
            this.disarmPlayer(playerId, weapon);
            return true; // Equipment was removed
        }
        
        return false; // No equipment to remove
    }
}

// === Utility Functions Organized by System ===

// === Player Utilities ===
// These functions provide legacy compatibility for player operations
// Primary functionality is now handled by PlayerManager class

// Legacy functions - use PlayerManager instead
function GetPlayerById(playerId: number): mod.Player | null {
    return instance?.playerManager.getById(playerId) || null;
}

function GetPlayerId(player: mod.Player): number {
    return instance?.playerManager.getPlayerId(player) || 0;
}

// === Weapon Utilities ===
// Functions for weapon management and data handling

function CreateWeaponPackage(weapon: mod.Weapons): mod.WeaponPackage {
    const weaponPackage = mod.CreateNewWeaponPackage();
    mod.AddAttachmentToWeaponPackage(mod.WeaponAttachments.Right_120_mW_Blue, weaponPackage);
    mod.AddAttachmentToWeaponPackage(mod.WeaponAttachments.Scope_RO_M_175x, weaponPackage);
    mod.AddAttachmentToWeaponPackage(mod.WeaponAttachments.Muzzle_CQB_Suppressor, weaponPackage);
    return weaponPackage;
}

const WeaponExclusionList: Set<string> = new Set([
    "Sidearm_M357_Trait",
]);

function GetWeapons(): mod.Weapons[] {
    const weapons: mod.Weapons[] = [];
    for (const weaponKey of Object.keys(mod.Weapons)) {
        if (typeof weaponKey === 'string' && weaponKey in mod.Weapons) {
            if (WeaponExclusionList.has(weaponKey)) {
                continue;
            }
            // exclude Shotguns, can't accurately measure pellet damage
            if (weaponKey.startsWith("Shotgun_")) {
                continue;
            }
            weapons.push(mod.Weapons[weaponKey as keyof typeof mod.Weapons]);
        }
    }
    return weapons;
}

const GunshowWeapons = GetWeapons();

function GetWeaponName(weapon: mod.Weapons): string {
    const stringkey = GetWeaponEnumString(weapon);
    return mod.stringkeys[stringkey as keyof typeof mod.stringkeys] || mod.stringkeys.weapon_unknown;
}

function GetWeaponEnumString(weapon: mod.Weapons): string {
    for (const weaponKey of Object.keys(mod.Weapons)) {
        if (typeof weaponKey === 'string' && weaponKey in mod.Weapons) {
            const w = mod.Weapons[weaponKey as keyof typeof mod.Weapons];
            if (w === weapon) {
                return weaponKey;
            }
        }
    }
    return "weapon_unknown";
}

// === Game Utilities ===
// Core game state and team management functions

function GetDistanceBetweenPlayers(playerA: mod.Player, playerB: mod.Player): number {
    const profileA = instance!.Players.get(playerA);
    const profileB = instance!.Players.get(playerB);
    return mod.DistanceBetween(profileA.position(), profileB.position());
}

function GetTeamId(team: mod.Team): number {
    return mod.GetObjId(team);
}

function PlayerHorizontalDistanceTo(player: mod.Player, position: mod.Vector): number {
    const playerPosition = mod.GetObjectPosition(player);
    const delta = mod.Subtract(playerPosition, position);
    const x = mod.XComponentOf(delta);
    const z = mod.ZComponentOf(delta);
    return Math.sqrt(x * x + z * z);
}


// === Helper Functions ===

let anyError = false;
let errCode = 0;
function LogError(code: number) {
    if (!anyError) {
        anyError = true;
        errCode = code;
        const msg = MakeMessage(mod.stringkeys.error_code, code);
        mod.DisplayNotificationMessage(msg);
    }
}

// === Helper Utilities ===
// General purpose utility functions for logging, messaging, and data processing

function MakeMessage(message: string, ...args: any[]) {
    switch (args.length) {
        case 0:
            return mod.Message(message);
        case 1:
            return mod.Message(message, args[0]);
        case 2:
            return mod.Message(message, args[0], args[1]);
        case 3:
            return mod.Message(message, args[0], args[1], args[2]);
        default:
            throw new Error("Invalid number of arguments");
    }
}

function Notify(a: number, b: number, c: number) {
    const msg = MakeMessage(mod.stringkeys.notify, a, b, c);
    mod.DisplayNotificationMessage(msg);
}

function SanitizeNumber(value: number): number {
    if (isNaN(value) || !isFinite(value)) {
        LogError(-99);
        return 0;
    }
    return value;
}

class Gunshow {
    // Manager instances for different responsibilities
    Players!: Players;
    playerManager!: PlayerManager;
    uiManager!: UIManager;
    spawnManager!: SpawnManager;
    
    // Core game state
    numHits: number = 0;
    // tick: number = 0;
    weaponDropoffs!: WeaponDropoffs;
    testQueue: Duel[] = [];
    playerDuels: Map<number, Duel> = new Map();

    constructor() {
        this.initializeSystems();
        this.initializeTestQueue();
    }

    private initializeSystems() {
        this.Players = new Players();
        this.playerManager = new PlayerManager();
        this.uiManager = new UIManager();
        ticker = this.uiManager.tickIndicator;
        this.spawnManager = new SpawnManager();
        this.weaponDropoffs = new WeaponDropoffs();
    }

    private initializeTestQueue() {
        // Initialize test queue with weapon pairs
        for (let i = 0; i < GunshowWeapons.length; i += 2) {
            const weaponOne = GunshowWeapons[i];
            const weaponTwo = GunshowWeapons[i + 1];
            if (weaponTwo !== undefined) {
                this.testQueue.push(new Duel(weaponOne, weaponTwo));
            } else {
                this.testQueue.push(new Duel(weaponOne, weaponOne));
            }
        }
    }

    recordHit(weapon: mod.Weapons | null = null, damage: number = 0, distance: number = 0) {
        this.numHits += 1;
        if (weapon) {
            this.weaponDropoffs.recordHit(weapon, damage, distance);
        }
    }

    updateDuels() {
        this.playerDuels.clear();
        for (const duel of this.testQueue) {
            duel.update();
            if (duel.playerOneId) {
                this.playerDuels.set(duel.playerOneId, duel);
            }
            if (duel.playerTwoId) {
                this.playerDuels.set(duel.playerTwoId, duel);
            }
        }
    }

    // recordTick() {
    //     this.tick += 1;
    // }

    updateStatDisplay() {
        this.uiManager.updateAllPlayerDisplays(this.Players, this.weaponDropoffs, {
            numHits: this.numHits,
            tickRate: MeasuredTickRate()
        });
    }

    getDuelForPlayer(player: mod.Player) {
        const playerId = GetPlayerId(player);
        return this.playerDuels.get(playerId) || null;
    }

    prune(weapon: mod.Weapons) {
        this.weaponDropoffs.prune(weapon);
    }
}

class Players {
    allPlayers: Map<number, PlayerProfile> = new Map();

    get(player: mod.Player): PlayerProfile {
        const playerId = GetPlayerId(player);
        let profile = this.allPlayers.get(playerId);
        if (!profile) {
            profile = new PlayerProfile(player);
            this.allPlayers.set(playerId, profile);
        }
        profile.player = player; // TODO: should I do this to make sure the reference is up to date?
        return profile;
    }

    remove(player: mod.Player) {
        const playerId = GetPlayerId(player);
        this.allPlayers.delete(playerId);
    }

    NotifyTrackedPlayers() {
        Notify(this.allPlayers.size, 99, 99);
    }
}

const InventorySlotNames = new Map<mod.InventorySlots, string>([
    [mod.InventorySlots.ClassGadget, "ClassGadget"],
    [mod.InventorySlots.GadgetOne, "GadgetOne"],
    [mod.InventorySlots.GadgetTwo, "GadgetTwo"],
    [mod.InventorySlots.MeleeWeapon, "MeleeWeapon"],
    [mod.InventorySlots.MiscGadget, "MiscGadget"],
    [mod.InventorySlots.PrimaryWeapon, "PrimaryWeapon"],
    [mod.InventorySlots.SecondaryWeapon, "SecondaryWeapon"],
    [mod.InventorySlots.Throwable, "Throwable"],
]);

class TickCache {
    private tick: number = -1;
    private data: Map<symbol, any> = new Map();
    
    private _validate() {
        const currentTick = ticker ? ticker.tick : 0;
        if (this.tick !== currentTick) {
            this.data.clear();
            this.tick = currentTick;
        }
    }
    
    get<T>(key: symbol, fetcher: () => T): T {
        this._validate();
        if (!this.data.has(key)) {
            this.data.set(key, fetcher());
        }
        return this.data.get(key) as T;
    }
}

class PlayerProfile {
    // Symbol keys for cache entries
    private static readonly KEY_MAX_HEALTH = Symbol('maxHealth');
    private static readonly KEY_CURRENT_HEALTH = Symbol('currentHealth');
    private static readonly KEY_SPEED = Symbol('speed');
    private static readonly KEY_IS_ALIVE = Symbol('isAlive');
    private static readonly KEY_IS_AI_SOLDIER = Symbol('isAISoldier');
    private static readonly KEY_TEAM = Symbol('team');
    private static readonly KEY_POSITION = Symbol('position');
    private static readonly KEY_HAS_PRIMARY = Symbol('hasPrimary');
    private static readonly KEY_HAS_SECONDARY = Symbol('hasSecondary');
    private static readonly KEY_PRIMARY_AMMO = Symbol('primaryAmmo');
    private static readonly KEY_SECONDARY_AMMO = Symbol('secondaryAmmo');
    private static readonly KEY_LAST_DAMAGE = Symbol('lastDamage');
    
    player: mod.Player
    gunshowUI: GunshowUI | null = null;
    versionUI: VersionUI | null = null;
    lastDamage: number = 0;
    lastDamageTick: number = 0;
    cache: TickCache;

    constructor(player: mod.Player) {
        this.player = player;
        this.cache = new TickCache();
    }

    
    maxHealth(): number {
        return this.cache.get(PlayerProfile.KEY_MAX_HEALTH, () =>
            mod.GetSoldierState(this.player, mod.SoldierStateBool.MaxHealth)
        );
    }
    
    currentHealth(): number {
        return this.cache.get(PlayerProfile.KEY_CURRENT_HEALTH, () =>
            mod.GetSoldierState(this.player, mod.SoldierStateBool.CurrentHealth)
        );
    }
    
    missingHealth(): number {
        return this.maxHealth() - this.currentHealth();
    }
    
    speed(): number {
        return this.cache.get(PlayerProfile.KEY_SPEED, () =>
            mod.GetSoldierState(this.player, mod.SoldierStateBool.Speed)
        );
    }
    
    isAlive(): boolean {
        return this.cache.get(PlayerProfile.KEY_IS_ALIVE, () =>
            mod.GetSoldierState(this.player, mod.SoldierStateBool.IsAlive)
        );
    }
    
    isAISoldier(): boolean {
        return this.cache.get(PlayerProfile.KEY_IS_AI_SOLDIER, () =>
            mod.GetSoldierState(this.player, mod.SoldierStateBool.IsAISoldier)
        );
    }
    
    team(): mod.Team {
        return this.cache.get(PlayerProfile.KEY_TEAM, () =>
            mod.GetTeam(this.player)
        );
    }
    
    position(): mod.Vector {
        return this.cache.get(PlayerProfile.KEY_POSITION, () =>
            mod.GetSoldierState(this.player, mod.SoldierStateVector.GetPosition)
        );
    }
    
    hasPrimaryWeapon(): boolean {
        return this.cache.get(PlayerProfile.KEY_HAS_PRIMARY, () =>
            mod.IsInventorySlotActive(this.player, mod.InventorySlots.PrimaryWeapon)
        );
    }
    
    hasSecondaryWeapon(): boolean {
        return this.cache.get(PlayerProfile.KEY_HAS_SECONDARY, () =>
            mod.IsInventorySlotActive(this.player, mod.InventorySlots.SecondaryWeapon)
        );
    }

    lastTickDamage(): number {
        return this.cache.get(PlayerProfile.KEY_LAST_DAMAGE, () => {
            if (this.lastDamageTick === ticker!.tick - 1) {
                return this.lastDamage;
            }
            return 0;

        });
    }
    
    primaryAmmo(): number {
        return this.cache.get(PlayerProfile.KEY_PRIMARY_AMMO, () => {
            if (this.hasPrimaryWeapon()) {
                return mod.GetInventoryAmmo(this.player, mod.InventorySlots.PrimaryWeapon);
            }
            return 0;
        });
    }
    
    secondaryAmmo(): number {
        return this.cache.get(PlayerProfile.KEY_SECONDARY_AMMO, () => {
            if (this.hasSecondaryWeapon()) {
                return mod.GetInventoryAmmo(this.player, mod.InventorySlots.SecondaryWeapon);
            }
            return 0;
        });
    }
    
    hasEquipment(weapon: mod.Weapons): boolean {
        // this._validateEquipmentCache();
        // if (!this.equipmentCache.has(weapon)) {
        //     this.equipmentCache.set(weapon, mod.HasEquipment(this.player, weapon));
        // }
        // return this.equipmentCache.get(weapon)!;
        return mod.HasEquipment(this.player, weapon);
    }
    
    healToFull() {
        mod.Heal(this.player, this.maxHealth());
    }

    onAISpawn() {
        instance!.playerManager.setupAISpawn(this.player);
    }

    addWeapon(weapon: mod.Weapons) {
        mod.AddEquipment(this.player, weapon);
    }

    displayUI() {
        const ui = instance!.uiManager.createPlayerUI(this.player);
        this.gunshowUI = ui.gunshowUI;
        this.versionUI = ui.versionUI;
    }
}

export class TeamPlayerCounts {
    private counts: Map<number, number> = new Map();
    onDeath(player: mod.Player) {
        const profile = instance!.Players.get(player);
        const teamId = GetTeamId(profile.team());
        const currentCount = this.counts.get(teamId) || 0;
        if (currentCount < 1) {
            LogError(-24);
        }
        this.counts.set(teamId, currentCount - 1);
    }
    onSpawn(player: mod.Player) {
        const profile = instance!.Players.get(player);
        const teamId = GetTeamId(profile.team());
        const currentCount = this.counts.get(teamId) || 0;
        const newCount = currentCount + 1;
        // const numMapEntries = this.counts.size;
        // Notify(numMapEntries, currentCount, newCount);
        this.counts.set(teamId, newCount);
    }
    getCount(team: mod.Team): number {
        const teamId = GetTeamId(team);
        return this.counts.get(teamId) || 0;
    }
}

class WeaponDropoffs {
    dropoffs: Map<mod.Weapons, DamageDropoffs2> = new Map();

    recordHit(weapon: mod.Weapons, damage: number, distance: number) {
        let dropoffs = this.dropoffs.get(weapon);
        if (!dropoffs) {
            dropoffs = new DamageDropoffs2();
            this.dropoffs.set(weapon, dropoffs);
        }
        dropoffs.recordHit(damage, distance);
        console.log(`Recorded hit for weapon ${weapon} at distance ${distance} with damage ${damage}`);
    }

    getDropoffs(weapon: mod.Weapons): [number, number][] {
        const hitRecord = this.dropoffs.get(weapon);
        if (hitRecord) {
            return hitRecord.toDropoffs();
        }
        return [];
    }

    numHitsAtRange(weapon: mod.Weapons, range: number): number {
        const hitRecord = this.dropoffs.get(weapon);
        if (hitRecord) {
            return hitRecord.numHitsAtRange(range);
        }
        return 0;
    }

    prune(weapon: mod.Weapons) {
        const hitRecord = this.dropoffs.get(weapon);
        if (hitRecord) {
            hitRecord.prune();
        }
    }
}



let nextRowId = 0;
const ROW_HEIGHT = 14;
const CELL_WIDTH = 100;
const FONT_SIZE = 12;

function GunshowCellName(weapon: mod.Weapons, dropoffIndex: number): string {
    return `cell_${GetWeaponName(weapon)}_${dropoffIndex}`;
}

function GunshowRow(player: mod.Player, weapon: mod.Weapons, dropoffs: [number, number][] = []): any {
    const children = [];
    children.push({
        type: "Text",
        name: `label_${mod.Weapons[weapon]}`,
        size: [CELL_WIDTH, ROW_HEIGHT],
        position: [0, 0],
        anchor: mod.UIAnchor.TopLeft,
        bgFill: mod.UIBgFill.None,
        textColor: [1, 1, 1],
        textAnchor: mod.UIAnchor.TopLeft,
        textLabel: MakeMessage(GetWeaponName(weapon)),
        textSize: FONT_SIZE
    });
    for (let index = 0; index < dropoffs.length; index++) {
        const [damage, distance] = dropoffs[index];
        children.push({
            type: "Text",
            name: GunshowCellName(weapon, index),
            size: [CELL_WIDTH, ROW_HEIGHT],
            position: [(index + 1) * CELL_WIDTH, 0],
            anchor: mod.UIAnchor.TopLeft,
            bgFill: mod.UIBgFill.None,
            textColor: [1, 1, 1],
            textAnchor: mod.UIAnchor.TopLeft,
            textLabel: MakeMessage(mod.stringkeys.weapon_dropoff,
                damage,
                distance
            ),
            textSize: FONT_SIZE
        });
    }

    return {
        type: "Container",
        name: `row${nextRowId++}`,
        size: [800, ROW_HEIGHT],
        position: [0, nextRowId * ROW_HEIGHT],
        anchor: mod.UIAnchor.TopLeft,
        bgFill: mod.UIBgFill.Blur,
        bgColor: [0.8, 0.2, 0.3],
        bgAlpha: 0.7,
        playerId: player,
        children: children
    }
}

async function SpawnLoop() {
    while (true) {
        await mod.Wait(SPAWN_CHECK_INTERVAL);
        try {
            if (instance) {
                instance.spawnManager.manageTeamSpawning();
            }
        } catch (e) {
            LogError(-21);
        }
    }
}

async function UILoop() {
    while (true) {
        await mod.Wait(UI_UPDATE_INTERVAL);
        if (instance) {
            instance.updateStatDisplay();
        }
    }
}

async function DuelLoop() {
    while (true) {
        await mod.Wait(DUEL_UPDATE_INTERVAL);
        // Trumpet();
        if (instance) {
            instance.updateDuels();
        }
    }
}

let ticker: TickIndicator | null = null;

async function TickLoop() {
    while (true) {
        await mod.Wait(TICK_UPDATE_INTERVAL);
        if (instance) {
            instance.uiManager.updateTickIndicator();
        }
    }
}

export async function OnGameModeStarted() {
    console.log("OnGameModeStarted");
    try {
        console.log("Gunshow started");
        instance = new Gunshow();
        instance.updateStatDisplay();
        instance.spawnManager.configureSpawners();
        SpawnLoop();
        UILoop();
        DuelLoop();
        TickLoop();
        mod.SetAIToHumanDamageModifier(1);
    } catch (e) {
        LogError(-1);
    }
}

export async function OngoingPlayer(player: mod.Player) {
    if (!instance) {
        return;
    }
    const profile = instance.Players.get(player);
    if (profile.isAISoldier() && profile.isAlive()) {
        const damage = profile.missingHealth() / 2;
        if (profile.lastTickDamage() === 0 && damage > 1) {
            if (instance) {
                const duel = instance.getDuelForPlayer(player);
                if (duel) {
                    const playerId = GetPlayerId(player);
                    let weapon: mod.Weapons | null = null;
                    let opponent: mod.Player | null = null;
                    if (duel.playerOneId === playerId) {
                        if (duel.playerTwoId !== null) {
                            opponent = GetPlayerById(duel.playerTwoId);
                        }
                        weapon = duel.weaponTwo;
                    } else {
                        if (duel.playerOneId !== null) {
                            opponent = GetPlayerById(duel.playerOneId);
                        }
                        weapon = duel.weaponOne;
                    }
                    if (weapon && opponent) {
                        const distance = GetDistanceBetweenPlayers(player, opponent);
                        instance.weaponDropoffs.recordHit(weapon, damage, distance);
                    }
                }
            }
            // mod.Heal(player, damage);
            profile.healToFull();
        }
        profile.lastDamage = damage;
        profile.lastDamageTick = ticker!.tick;
    }
}

export async function OnPlayerDeployed(player: mod.Player) {
    try {
        const profile = instance!.Players.get(player);
        if (!profile.isAISoldier()) {
            profile.displayUI();
        } else {
            profile.onAISpawn();
            // profile.addWeapon(NextWeapon());
        }
        if (instance) {
            instance.spawnManager.onPlayerSpawned(player);
        }
    } catch (e) {
        LogError(-2);
    }
}

export async function OnPlayerDied(eventPlayer: mod.Player,
    eventOtherPlayer: mod.Player,
    eventDeathType: mod.DeathType,
    eventWeaponUnlock: mod.WeaponUnlock) {
    try {
        if (instance) {
            instance.spawnManager.onPlayerDied(eventPlayer);
        }
    } catch (e) {
        LogError(-20);
    }
}



let nextId = 0;
const MAX_DROPOFFS = 5;
class GunshowUI {
    StatsWidget: mod.UIWidget | undefined;
    TextWidget: mod.UIWidget | undefined;
    WeaponDropoffTextWidgets: Map<mod.Weapons, mod.UIWidget[]> = new Map();
    constructor(player: mod.Player) {
        const bfBlueColor = [0.678, 0.753, 0.800];
        const childWidgetName = `stats${nextId++}`;
        const children: any[] = [];
        children.push({
            type: "Text",
            name: childWidgetName,
            size: [800, 600],
            position: [-800, 0],
            anchor: mod.UIAnchor.CenterRight,
            bgFill: mod.UIBgFill.None,
            textColor: bfBlueColor,
            textAnchor: mod.UIAnchor.TopLeft,
            textLabel: MakeMessage("Script ver: {}-{}-{}", VERSION[0], VERSION[1], VERSION[2]),
            textSize: 12
        });
        const dropoffs: [number, number][] = [];
        for (let i = 0; i < MAX_DROPOFFS; i++) {
            dropoffs.push([0, 0]);
        }
        try {
            for (const weapon of GunshowWeapons) {
                children.push(GunshowRow(player, weapon, dropoffs));
            }
        } catch (e) {
            LogError(-4);
        }
        this.StatsWidget = ParseUI({
            type: "Container",
            size: [800, 600],
            position: [0, 0],
            anchor: mod.UIAnchor.TopLeft,
            bgFill: mod.UIBgFill.Blur,
            bgColor: [0.2, 0.2, 0.3],
            bgAlpha: 0.7,
            playerId: player,
            children: children
        });
        if (this.StatsWidget) {
            this.TextWidget = mod.FindUIWidgetWithName(childWidgetName);
            for (const weapon of GunshowWeapons) {
                const widgets: mod.UIWidget[] = [];
                for (let index = 0; index < MAX_DROPOFFS; index++) {
                    const cellName = GunshowCellName(weapon, index);
                    const widget = mod.FindUIWidgetWithName(cellName);
                    if (widget) {
                        widgets.push(widget);
                    }
                }
                this.WeaponDropoffTextWidgets.set(weapon, widgets);
            }
        }
    }

    updateStats(hitCount: number, tick: number) {
        if (this.TextWidget) {
            let msg = MakeMessage(mod.stringkeys.hits_recorded, hitCount, tick);
            mod.SetUITextLabel(this.TextWidget, msg);
        }
    }

    updateDropoffsForWeapon(weapon: mod.Weapons, dropoffs: [number, number][]) {
        try {
            const widgets = this.WeaponDropoffTextWidgets.get(weapon);
            if (!widgets) {
                return;
            }
            try {
                for (let index = 0; index < widgets.length; index++) {
                    const widget = widgets[index];
                    if (index < dropoffs.length) {
                        const [damage, distance] = dropoffs[index];
                        const msg = MakeMessage(mod.stringkeys.weapon_dropoff,
                            SanitizeNumber(damage),
                            SanitizeNumber(distance)
                        );
                        try {
                            mod.SetUITextLabel(widget, msg);
                        } catch (e) {
                            LogError(-12);
                        }
                    } else {
                        try {
                            mod.SetUITextLabel(widget, MakeMessage(mod.stringkeys.empty));
                        } catch (e) {
                            LogError(-13);
                        }
                    }
                }
            } catch (e) {
                LogError(-10);
            }
        } catch (e) {
            LogError(-11);
        }
    }

    open() {
        this.StatsWidget && mod.SetUIWidgetVisible(this.StatsWidget, true)
    }

    close() {
        this.StatsWidget && mod.SetUIWidgetVisible(this.StatsWidget, false)
    }

    delete() {
        this.StatsWidget && mod.DeleteUIWidget(this.StatsWidget)
    }
}

class VersionUI {
    versionWidget: mod.UIWidget | undefined;

    constructor() {
        const bfBlueColor = [0.678, 0.753, 0.800];

        this.versionWidget = ParseUI({
            type: "Text",
            name: "version",
            size: [200, 25],
            position: [10, 10],
            anchor: mod.UIAnchor.BottomRight,
            bgFill: mod.UIBgFill.None,
            textColor: bfBlueColor,
            textAnchor: mod.UIAnchor.TopLeft,
            textLabel: MakeMessage(mod.stringkeys.mod_version, VERSION[0], VERSION[1], VERSION[2]),
            textSize: 20
        });
    }

    open() {
        this.versionWidget && mod.SetUIWidgetVisible(this.versionWidget, true);
    }

    delete() {
        this.versionWidget && mod.DeleteUIWidget(this.versionWidget);
    }
}

class TickIndicator {
    widget: mod.UIWidget | undefined;
    tick: number = 0;
    constructor() {
        const bfBlueColor = [0.678, 0.753, 0.800];

        this.widget = ParseUI({
            type: "Text",
            name: "tick_indicator",
            size: [200, 25],
            position: [10, 40],
            anchor: mod.UIAnchor.BottomRight,
            bgFill: mod.UIBgFill.None,
            textColor: bfBlueColor,
            textAnchor: mod.UIAnchor.TopLeft,
            textLabel: MakeMessage(mod.stringkeys.tick_indicator, 0),
            textSize: 20
        });
    }
    onTick() {
        this.tick += 1;
    }

    update() {
        if (this.widget) {
            const msg = MakeMessage(mod.stringkeys.tick_indicator, this.tick);
            mod.SetUITextLabel(this.widget, msg);
        }
    }
    open() {
        this.widget && mod.SetUIWidgetVisible(this.widget, true);
    }
}


const timedTicks: [number, number][] = [];
function MeasuredTickRate(): number {
    timedTicks.push([mod.GetMatchTimeElapsed(), ticker ? ticker.tick : 0]);
    if (timedTicks.length > 10) {
        timedTicks.shift();
    }
    if (timedTicks.length < 2) {
        return 0;
    }
    const first = timedTicks[0];
    const last = timedTicks[timedTicks.length - 1];
    const deltaTime = last[0] - first[0];
    const deltaTicks = last[1] - first[1];
    if (deltaTime === 0) {
        return 0;
    }
    const ticksPerSecond = deltaTicks / deltaTime;
    return ticksPerSecond;
}

// === Helpers, modlib/index.ts, etc. ===


// === UI_GlobalHelpers.ts ===

type UIVector = mod.Vector | number[];

interface UIParams {
    name: string;
    type: string;
    position: any;
    size: any;
    anchor: mod.UIAnchor;
    parent: mod.UIWidget;
    visible: boolean;
    textLabel: string;
    textColor: UIVector;
    textAlpha: number;
    textSize: number;
    textAnchor: mod.UIAnchor;
    padding: number;
    bgColor: UIVector;
    bgAlpha: number;
    bgFill: mod.UIBgFill;
    imageType: mod.UIImageType;
    imageColor: UIVector;
    imageAlpha: number;
    teamId?: mod.Team;
    playerId?: mod.Player;
    children?: any[];
    buttonEnabled: boolean;
    buttonColorBase: UIVector;
    buttonAlphaBase: number;
    buttonColorDisabled: UIVector;
    buttonAlphaDisabled: number;
    buttonColorPressed: UIVector;
    buttonAlphaPressed: number;
    buttonColorHover: UIVector;
    buttonAlphaHover: number;
    buttonColorFocused: UIVector;
    buttonAlphaFocused: number;
}

function __asModVector(param: number[] | mod.Vector) {
    if (Array.isArray(param))
        return mod.CreateVector(param[0], param[1], param.length == 2 ? 0 : param[2]);
    else
        return param;
}

function __asModMessage(param: string | mod.Message) {
    if (typeof (param) === "string")
        return mod.Message(param);
    return param;
}

function __fillInDefaultArgs(params: UIParams) {
    if (!params.hasOwnProperty('name'))
        params.name = "";
    if (!params.hasOwnProperty('position'))
        params.position = mod.CreateVector(0, 0, 0);
    if (!params.hasOwnProperty('size'))
        params.size = mod.CreateVector(100, 100, 0);
    if (!params.hasOwnProperty('anchor'))
        params.anchor = mod.UIAnchor.TopLeft;
    if (!params.hasOwnProperty('parent'))
        params.parent = mod.GetUIRoot();
    if (!params.hasOwnProperty('visible'))
        params.visible = true;
    if (!params.hasOwnProperty('padding'))
        params.padding = (params.type == "Container") ? 0 : 8;
    if (!params.hasOwnProperty('bgColor'))
        params.bgColor = mod.CreateVector(0.25, 0.25, 0.25);
    if (!params.hasOwnProperty('bgAlpha'))
        params.bgAlpha = 0.5;
    if (!params.hasOwnProperty('bgFill'))
        params.bgFill = mod.UIBgFill.Solid;
}

function __setNameAndGetWidget(uniqueName: any, params: any) {
    let widget = mod.FindUIWidgetWithName(uniqueName) as mod.UIWidget;
    mod.SetUIWidgetName(widget, params.name);
    return widget;
}

const __cUniqueName = "----uniquename----";

function __addUIContainer(params: UIParams) {
    __fillInDefaultArgs(params);
    let restrict = params.teamId ?? params.playerId;
    if (restrict) {
        mod.AddUIContainer(__cUniqueName,
            __asModVector(params.position),
            __asModVector(params.size),
            params.anchor,
            params.parent,
            params.visible,
            params.padding,
            __asModVector(params.bgColor),
            params.bgAlpha,
            params.bgFill,
            restrict);
    } else {
        mod.AddUIContainer(__cUniqueName,
            __asModVector(params.position),
            __asModVector(params.size),
            params.anchor,
            params.parent,
            params.visible,
            params.padding,
            __asModVector(params.bgColor),
            params.bgAlpha,
            params.bgFill);
    }
    let widget = __setNameAndGetWidget(__cUniqueName, params);
    if (params.children) {
        params.children.forEach((childParams: any) => {
            childParams.parent = widget;
            __addUIWidget(childParams);
        });
    }
    return widget;
}

function __fillInDefaultTextArgs(params: UIParams) {
    if (!params.hasOwnProperty('textLabel'))
        params.textLabel = "";
    if (!params.hasOwnProperty('textSize'))
        params.textSize = 0;
    if (!params.hasOwnProperty('textColor'))
        params.textColor = mod.CreateVector(1, 1, 1);
    if (!params.hasOwnProperty('textAlpha'))
        params.textAlpha = 1;
    if (!params.hasOwnProperty('textAnchor'))
        params.textAnchor = mod.UIAnchor.CenterLeft;
}

function __addUIText(params: UIParams) {
    __fillInDefaultArgs(params);
    __fillInDefaultTextArgs(params);
    let restrict = params.teamId ?? params.playerId;
    if (restrict) {
        mod.AddUIText(__cUniqueName,
            __asModVector(params.position),
            __asModVector(params.size),
            params.anchor,
            params.parent,
            params.visible,
            params.padding,
            __asModVector(params.bgColor),
            params.bgAlpha,
            params.bgFill,
            __asModMessage(params.textLabel),
            params.textSize,
            __asModVector(params.textColor),
            params.textAlpha,
            params.textAnchor,
            restrict);
    } else {
        mod.AddUIText(__cUniqueName,
            __asModVector(params.position),
            __asModVector(params.size),
            params.anchor,
            params.parent,
            params.visible,
            params.padding,
            __asModVector(params.bgColor),
            params.bgAlpha,
            params.bgFill,
            __asModMessage(params.textLabel),
            params.textSize,
            __asModVector(params.textColor),
            params.textAlpha,
            params.textAnchor);
    }
    return __setNameAndGetWidget(__cUniqueName, params);
}

function __fillInDefaultImageArgs(params: any) {
    if (!params.hasOwnProperty('imageType'))
        params.imageType = mod.UIImageType.None;
    if (!params.hasOwnProperty('imageColor'))
        params.imageColor = mod.CreateVector(1, 1, 1);
    if (!params.hasOwnProperty('imageAlpha'))
        params.imageAlpha = 1;
}

function __addUIImage(params: UIParams) {
    __fillInDefaultArgs(params);
    __fillInDefaultImageArgs(params);
    let restrict = params.teamId ?? params.playerId;
    if (restrict) {
        mod.AddUIImage(__cUniqueName,
            __asModVector(params.position),
            __asModVector(params.size),
            params.anchor,
            params.parent,
            params.visible,
            params.padding,
            __asModVector(params.bgColor),
            params.bgAlpha,
            params.bgFill,
            params.imageType,
            __asModVector(params.imageColor),
            params.imageAlpha,
            restrict);
    } else {
        mod.AddUIImage(__cUniqueName,
            __asModVector(params.position),
            __asModVector(params.size),
            params.anchor,
            params.parent,
            params.visible,
            params.padding,
            __asModVector(params.bgColor),
            params.bgAlpha,
            params.bgFill,
            params.imageType,
            __asModVector(params.imageColor),
            params.imageAlpha);
    }
    return __setNameAndGetWidget(__cUniqueName, params);
}

function __fillInDefaultArg(params: any, argName: any, defaultValue: any) {
    if (!params.hasOwnProperty(argName))
        params[argName] = defaultValue;
}

function __fillInDefaultButtonArgs(params: any) {
    if (!params.hasOwnProperty('buttonEnabled'))
        params.buttonEnabled = true;
    if (!params.hasOwnProperty('buttonColorBase'))
        params.buttonColorBase = mod.CreateVector(0.7, 0.7, 0.7);
    if (!params.hasOwnProperty('buttonAlphaBase'))
        params.buttonAlphaBase = 1;
    if (!params.hasOwnProperty('buttonColorDisabled'))
        params.buttonColorDisabled = mod.CreateVector(0.2, 0.2, 0.2);
    if (!params.hasOwnProperty('buttonAlphaDisabled'))
        params.buttonAlphaDisabled = 0.5;
    if (!params.hasOwnProperty('buttonColorPressed'))
        params.buttonColorPressed = mod.CreateVector(0.25, 0.25, 0.25);
    if (!params.hasOwnProperty('buttonAlphaPressed'))
        params.buttonAlphaPressed = 1;
    if (!params.hasOwnProperty('buttonColorHover'))
        params.buttonColorHover = mod.CreateVector(1, 1, 1);
    if (!params.hasOwnProperty('buttonAlphaHover'))
        params.buttonAlphaHover = 1;
    if (!params.hasOwnProperty('buttonColorFocused'))
        params.buttonColorFocused = mod.CreateVector(1, 1, 1);
    if (!params.hasOwnProperty('buttonAlphaFocused'))
        params.buttonAlphaFocused = 1;
}

function __addUIButton(params: UIParams) {
    __fillInDefaultArgs(params);
    __fillInDefaultButtonArgs(params);
    let restrict = params.teamId ?? params.playerId;
    if (restrict) {
        mod.AddUIButton(__cUniqueName,
            __asModVector(params.position),
            __asModVector(params.size),
            params.anchor,
            params.parent,
            params.visible,
            params.padding,
            __asModVector(params.bgColor),
            params.bgAlpha,
            params.bgFill,
            params.buttonEnabled,
            __asModVector(params.buttonColorBase), params.buttonAlphaBase,
            __asModVector(params.buttonColorDisabled), params.buttonAlphaDisabled,
            __asModVector(params.buttonColorPressed), params.buttonAlphaPressed,
            __asModVector(params.buttonColorHover), params.buttonAlphaHover,
            __asModVector(params.buttonColorFocused), params.buttonAlphaFocused,
            restrict);
    } else {
        mod.AddUIButton(__cUniqueName,
            __asModVector(params.position),
            __asModVector(params.size),
            params.anchor,
            params.parent,
            params.visible,
            params.padding,
            __asModVector(params.bgColor),
            params.bgAlpha,
            params.bgFill,
            params.buttonEnabled,
            __asModVector(params.buttonColorBase), params.buttonAlphaBase,
            __asModVector(params.buttonColorDisabled), params.buttonAlphaDisabled,
            __asModVector(params.buttonColorPressed), params.buttonAlphaPressed,
            __asModVector(params.buttonColorHover), params.buttonAlphaHover,
            __asModVector(params.buttonColorFocused), params.buttonAlphaFocused);
    }
    return __setNameAndGetWidget(__cUniqueName, params);
}

function __addUIWidget(params: UIParams) {
    if (params == null)
        return undefined;
    if (params.type == "Container")
        return __addUIContainer(params);
    else if (params.type == "Text")
        return __addUIText(params);
    else if (params.type == "Image")
        return __addUIImage(params);
    else if (params.type == "Button")
        return __addUIButton(params);
    return undefined;
}

// const ParseUI = modlib.ParseUI;

function ParseUI(...params: any) {
    return (globalThis as any)['libModule'].ParseUI(params);
}

// function ParseUI(...params: any[]) {
//     let widget: mod.UIWidget | undefined;
//     for (let a = 0; a < params.length; a++) {
//         widget = __addUIWidget(params[a] as UIParams);
//     }
//     return widget;
// }

