

/**
 * Gunshow2: Automated weapon damage dropoff range discovery for Battlefield 6 Portal
 * 
 * Goal: Discover all weapon damage dropoff ranges with 1-meter precision.
 * 
 * ## Background
 * Weapons in Battlefield 6 have step-function damage dropoffs at various ranges.
 * For example: 25 damage from 1-21m, 22 damage from 22-36m, 18 damage from 37-150m.
 * 
 * ## Architecture
 * 
 * Gunshow
 *  - Manages multiple lanes for parallel testing
 *  - Coordinates weapons, duelists, and test execution
 * 
 * Lane
 *  - Offset distance for testing specific ranges
 *  - Origin position for duelist placement
 *  - Weapon Under Test
 *  - Duelist One & Two
 * 
 * WeaponTest
 *  - Tracks damage hits at each range using sparse array: [Range] => [Damage] => # Hits
 *  - Filters outliers (headshots, partial damage) using statistical mode
 *  - Determines test completeness (coverage + boundary precision)
 *  - Suggests next range to test using priority list + gap filling
 * 
 * Duelist
 *  - Player ID for tracking
 *  - State machine for test execution
 * 
 * ## Test Strategy
 * 1. Test priority ranges first (MIN, MAX, common dropoff boundaries)
 * 2. Fill gaps at damage boundaries using binary search
 * 3. Ensure 1m precision at all boundary transitions
 * 4. Complete when coverage spans MIN_RANGE to MAX_RANGE with no gaps
 * 
 * ## Implementation Notes
 * - OnPlayerDamaged has memory leak; use health polling instead
 * - Each tick: record hits, update states, assign weapons/lanes
 * - Duelists can share weapons for efficiency
 */

class Lane {
    private static readonly LaneWidth = 10;
    private static readonly LaneRootX = -380;
    private static readonly LaneRootY = 220;
    private static readonly LaneRootZ = 20;
    
    lanePosition: mod.Vector;

    constructor(laneIndex: number) {
        this.lanePosition = mod.CreateVector(Lane.LaneRootX + laneIndex * Lane.LaneWidth, Lane.LaneRootY, Lane.LaneRootZ);
    }
}

enum TestRunState {
    SetPositions,
    CheckPositions,
    SetWeapons,
    CheckWeapons,
    Firing,
    Complete
}

/**
 * Disable player shooting
 * Move players to position
 * Wait for players to be in position
 * Give weapons to players
 * Set Ammo to 1
 * Wait for players to have weapon and ammo (not sure if necessary)
 * Assign target
 * Enable firing
 * Wait until magazine is empty/reload starts
 * 
 */
class TestRun {
    private lane: Lane | null;
    private range: number;
    private playerOne: mod.Player;
    private playerTwo: mod.Player;
    private weapon: mod.Weapons;
    private state: TestRunState = TestRunState.SetPositions;
    private targetPosition: mod.Vector;
    constructor(lane: Lane, range: number, playerOne: mod.Player, playerTwo: mod.Player, weapon: mod.Weapons) {
        this.lane = lane;
        this.range = range;
        this.playerOne = playerOne;
        this.playerTwo = playerTwo;
        this.weapon = weapon;
        this.targetPosition = mod.Add(this.lane.lanePosition, mod.CreateVector(range, 0, 0));
    }

    update() {
        switch (this.state) {
            case TestRunState.SetPositions:
                this.setPositions();
                this.setState(TestRunState.CheckPositions);
                break;
            case TestRunState.CheckPositions:
                if (this.checkPositions()) {
                    this.setState(TestRunState.SetWeapons);
                }
                break;
            case TestRunState.Firing:
                this.fireWeapon();
                break;
        }
    }

    private setState(newState: TestRunState) {
        if (true) {
            console.log(`TestRun: ${this.range} ${TestRunState[this.state]} -> ${TestRunState[newState]}`);
        }
        this.state = newState;
    }

    private setPositions() {
        mod.Teleport(this.playerOne, this.lane.lanePosition, 0);
        mod.Teleport(this.playerTwo, this.targetPosition, mod.Pi() / 2);
    }

    private checkPositions(): boolean {
        assert(this.lane !== null);
        if (PlayerHorizontalDistanceTo(this.playerOne, this.lane.lanePosition) > 0.5) {
            return false;
        }
        if (PlayerHorizontalDistanceTo(this.playerTwo, this.targetPosition) > 0.5) {
            return false;
        }
        return true;
    }

    private fireWeapon() {

    }

    isComplete(): boolean {
        return this.state === TestRunState.Complete;
    }

    releaseLane(): Lane {
        const lane = this.lane;
        this.lane = null;
        return lane;
    }
}

function PlayerHorizontalDistanceTo(player: mod.Player, position: mod.Vector): number {
    const playerPosition = mod.GetObjectPosition(player);
    const delta = mod.Subtract(playerPosition, position);
    const x = mod.XComponentOf(delta);
    const z = mod.ZComponentOf(delta);
    return Math.sqrt(x * x + z * z);
}
class Gunshow {

    private weaponTests: Map<mod.Weapons, WeaponTest> = new Map();

    private static readonly MaxLanes = 10;
    private freeLanes: Lane[] = [];

    private activeTests: TestRun[] = [];

    constructor() {
        for (let i = 0; i < Gunshow.MaxLanes; i++) {
            this.freeLanes.push(new Lane(i));
        }
    }

    update() {
        for (const test of this.activeTests) {
            test.update();
            if (test.isComplete()) {
                this.freeLanes.push(test.releaseLane());
            }
        }
        this.activeTests = this.activeTests.filter(test => !test.isComplete());
    }

}


/**
 * 
 */
class Duelist {
    playerId: number;
    constructor(playerId: number) {
        this.playerId = playerId;
    }
}

/**
 * WeaponTest: Tracks damage hits and discovers weapon dropoff ranges
 * 
 * Uses sparse array data structure for efficient storage:
 * damages[range][damage] = hit_count
 * 
 * Key features:
 * - Filters outliers (headshots, partial damage) using statistical mode
 * - Requires minimum 10 samples at 30% frequency for valid damage value
 * - Determines completeness: MIN to MAX coverage with 1m boundary precision
 * - Suggests optimal next test range using priority list + gap filling
 */
export class WeaponTest {
    
    /** Sparse array: damages[range][damage] = hit_count */
    private damages: number[][] = [];
    
    /** Minimum samples required at a range for valid damage value */
    private static readonly REQUIRED_HITS_AT_RANGE = 10;
    
    /** Minimum range to test (meters) */
    private static readonly MIN_RANGE = 1;
    
    /** Maximum range to test (meters) */
    private static readonly MAX_RANGE = 150;
    
    /** Priority ranges to test first (common dropoff boundaries) */
    private static readonly PRIORITY_RANGES = [
        1,   // MIN_RANGE
        150, // MAX_RANGE
        9, 10, 21, 22, 36, 37, 39, 40, 54, 55, 74, 75, 76, 77, 78, 79, 80, 90, 125
    ];

    /**
     * Record a damage hit at a specific distance
     * @param distance Distance in meters (floored to nearest integer)
     * @param damage Damage value dealt
     */
    recordHit(distance: number, damage: number) {
        const dist = Math.floor(distance);
        let damagesAtRange = this.damages[dist];
        if (!damagesAtRange) {
            damagesAtRange = [];
            this.damages[dist] = damagesAtRange;
        }
        let numHitsWithDamage = damagesAtRange[damage] || 0;
        damagesAtRange[damage] = numHitsWithDamage + 1;
    }

    /**
     * Get the most common (mode) damage value at a specific range
     * 
     * Filters outliers (headshots, partial damage) by requiring:
     * - Minimum 10 samples for the damage value
     * - Damage value appears in at least 30% of all samples at this range
     * 
     * @param range Distance in meters
     * @returns Most common damage value, or undefined if insufficient/unclear data
     * 
     * @example
     * // 10 hits at 25 damage, 2 headshots at 35 damage
     * wt.damageAtRange(50) // returns 25 (body shot mode)
     */
    damageAtRange(range: number): number | undefined {
        const damagesAtRange = this.damages[range];
        if (!damagesAtRange) {
            return undefined;
        }
        let mostFrequentDamage: number | undefined = undefined;
        let maxSamples = 0;
        let totalSamples = 0;
        
        // For sparse arrays, use for...in to iterate over indices
        for (const damageStr in damagesAtRange) {
            const damage = Number(damageStr);
            const samples = damagesAtRange[damage];
            if (!samples) continue; // Skip undefined/0
            
            totalSamples += samples;
            if (samples > maxSamples) {
                maxSamples = samples;
                mostFrequentDamage = damage;
            }
        }
        
        if (maxSamples < WeaponTest.REQUIRED_HITS_AT_RANGE) {
            return undefined;
        }
        const damageFrequency = maxSamples / totalSamples;
        if (damageFrequency < 0.3) {
            return undefined;
        }
        return mostFrequentDamage;
    }

    /**
     * Check if all dropoff ranges have been discovered
     * 
     * Requirements for completeness:
     * 1. Coverage: Tested ranges span from MIN_RANGE (1m) to MAX_RANGE (150m)
     * 2. Precision: All damage boundaries precise to within 1 meter
     * 
     * Algorithm: Single pass O(n) through tested ranges
     * - Verifies MIN/MAX coverage
     * - Detects gaps > 1m at damage boundaries
     * 
     * @returns true if all dropoff ranges discovered, false otherwise
     * 
     * @example
     * // Complete: [1-21m: 25dmg], [22-36m: 22dmg], [37-150m: 18dmg]
     * // Incomplete: gap between 21m and 24m (boundary not precise)
     */
    isComplete(): boolean {
        let firstDist: number | null = null;
        let lastDist: number | null = null;
        let prevDist: number | null = null;
        let prevDmg: number | null = null;
        // for...in iterates numeric indices in ascending order
        for (const distStr in this.damages) {
            const dist = Number(distStr);
            const dmg = this.damageAtRange(dist);
            if (dmg === undefined) continue;
            if (firstDist === null) firstDist = dist;
            lastDist = dist;
            // Check boundary when damage changes
            if (prevDmg !== null && prevDmg !== dmg) {
                const gap = dist - prevDist!;
                if (gap > 1) return false;
            }
            prevDist = dist;
            prevDmg = dmg;
        }
        // Check coverage
        if (firstDist === null) return false;
        if (firstDist > WeaponTest.MIN_RANGE) return false;
        if (lastDist! < WeaponTest.MAX_RANGE) return false;
        return true;
    }

    /**
     * Get the next optimal range to test
     * 
     * Strategy:
     * 1. Priority ranges first: Tests MIN/MAX and common dropoff boundaries
     * 2. Gap filling: Binary search to find precise damage boundaries
     * 3. Complete: Returns null when all dropoffs discovered
     * 
     * Algorithm: O(p + n) time, O(1) space
     * - p = priority ranges (21 ranges)
     * - n = number of tested ranges
     * 
     * @returns Next range (in meters) to test, or null if complete
     * 
     * @example
     * wt.getNextRangeToTest() // 1 (MIN_RANGE)
     * // ... after recording hits at 1m ...
     * wt.getNextRangeToTest() // 150 (MAX_RANGE)
     * // ... after all priorities tested ...
     * wt.getNextRangeToTest() // 26 (fills gap between 22m and 30m)
     */
    getNextRangeToTest(): number | null {
        // Priority 1: Test predefined ranges that lack sufficient data
        for (const range of WeaponTest.PRIORITY_RANGES) {
            const dmg = this.damageAtRange(range);
            if (dmg === undefined) {
                return range; // Not tested yet or insufficient samples
            }
        }
        
        // Priority 2: Fill gaps at damage boundaries
        let prevDist: number | null = null;
        let prevDmg: number | null = null;
        
        for (const distStr in this.damages) {
            const dist = Number(distStr);
            const dmg = this.damageAtRange(dist);
            if (dmg === undefined) continue;
            
            // Found damage change with gap
            if (prevDmg !== null && prevDmg !== dmg && prevDist !== null) {
                const gap = dist - prevDist;
                if (gap > 1) {
                    return Math.floor((prevDist + dist) / 2);
                }
            }
            
            prevDist = dist;
            prevDmg = dmg;
        }
        
        // Complete - no more testing needed
        return null;
    }
}


const instance: Gunshow = new Gunshow();
function Ongoing() {
    instance.update();
}

// export async function OngoingPlayer(player: mod.Player) {
//     if (IsLivePlayer(player) && mod.GetSoldierState(player, mod.SoldierStateBool.IsAlive) && !mod.GetSoldierState(player, mod.SoldierStateBool.IsAISoldier)) {
//         const soldierPosition = mod.GetSoldierState(player, mod.SoldierStateVector.GetPosition);
//         const destinationPosition = mod.CreateVector(mod.XComponentOf(soldierPosition), mod.YComponentOf(soldierPosition) + 10, mod.ZComponentOf(soldierPosition));
//         // MovingFloor.moveFloorToPosition(1000, destinationPosition);
//         // MovingFloor.positionTiles();
//     }
// }


/**
 * LivePlayers: Set of player IDs that are currently live
 */
const LivePlayers: Set<number> = new Set();

function IsLivePlayer(player: mod.Player): boolean {
    const playerId = mod.GetObjId(player);
    return LivePlayers.has(playerId);
}

export function OnPlayerDeployed(player: mod.Player) {
    const playerId = mod.GetObjId(player);
    LivePlayers.add(playerId);
    console.log("Player deployed: " + playerId);
}

export function OnPlayerDied(player: mod.Player) {
    const playerId = mod.GetObjId(player);
    LivePlayers.delete(playerId);
    console.log("Player died: " + playerId);
}

export function OnPlayerLeft(player: mod.Player) {
    const playerId = mod.GetObjId(player);
    LivePlayers.delete(playerId);
    console.log("Player left: " + playerId);
}