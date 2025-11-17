// Auto-mock the entire mod dependency with a Proxy
const mockMod = new Proxy({}, {
    get(target: any, prop: string | symbol) {
        if (!(prop in target)) {
            // Handle special cases for known structures
            if (prop === 'Weapons') {
                // Auto-generate weapon enum values
                target[prop] = new Proxy({}, {
                    get: (weaponsTarget: any, weaponProp: string | symbol) => {
                        if (typeof weaponProp === 'string' && !(weaponProp in weaponsTarget)) {
                            weaponsTarget[weaponProp] = Object.keys(weaponsTarget).length;
                        }
                        return weaponsTarget[weaponProp];
                    }
                });
            } else if (prop === 'stringkeys') {
                // Auto-generate string keys
                target[prop] = new Proxy({}, {
                    get: (stringTarget: any, stringProp: string | symbol) => {
                        if (typeof stringProp === 'string' && !(stringProp in stringTarget)) {
                            stringTarget[stringProp] = `mock_${stringProp}`;
                        }
                        return stringTarget[stringProp];
                    }
                });
            } else {
                // Default to jest.fn() for everything else
                target[prop] = jest.fn();
            }
        }
        return target[prop];
    }
});

// Create global mod object
(globalThis as any).mod = mockMod;

// Set up common mock implementations
mockMod.Floor.mockImplementation((value: number) => Math.floor(value));

import { TeamPlayerCounts } from './Gunshow.js'; // Use .js extension for compiled output

test('Team player counts can be instantiated', () => {
    const counts = new TeamPlayerCounts();
    expect(counts).toBeDefined();
    expect(counts.getCount).toBeDefined();
    expect(typeof counts.getCount).toBe('function');
});

test('Team player counts tracks team counts correctly', () => {
    // Reset mocks before each test
    jest.clearAllMocks();

    const counts = new TeamPlayerCounts();
    const mockTeam1 = { _opaque: Symbol('team1') } as any;
    const mockTeam2 = { _opaque: Symbol('team2') } as any;
    const mockPlayer1 = { team: mockTeam1 } as any;
    const mockPlayer2 = { team: mockTeam2 } as any;

    // Mock GetTeam to return the team for each player
    mockMod.GetTeam.mockImplementation((player: any) => player.team);

    // Mock GetObjId to return stable team IDs
    mockMod.GetObjId.mockImplementation((team: any) => {
        if (team === mockTeam1) return 1;
        if (team === mockTeam2) return 2;
        return 99; // Default fallback to detect issues
    });

    // Initially should return 0 for unknown teams
    expect(counts.getCount(mockTeam1)).toBe(0);
    expect(counts.getCount(mockTeam2)).toBe(0);

    // After spawn, should increment count
    counts.onSpawn(mockPlayer1);
    expect(counts.getCount(mockTeam1)).toBe(1);
    expect(counts.getCount(mockTeam2)).toBe(0);

    counts.onSpawn(mockPlayer2);
    expect(counts.getCount(mockTeam1)).toBe(1);
    expect(counts.getCount(mockTeam2)).toBe(1);

    // Add another player to team 1
    counts.onSpawn(mockPlayer1);
    expect(counts.getCount(mockTeam1)).toBe(2);

    // After death, should decrement count
    counts.onDeath(mockPlayer1);
    expect(counts.getCount(mockTeam1)).toBe(1);
    expect(counts.getCount(mockTeam2)).toBe(1);

    counts.onDeath(mockPlayer1);
    expect(counts.getCount(mockTeam1)).toBe(0);
});

test('Proxy auto-mock handles any property access', () => {
    // Test that the proxy automatically creates mocks for any property
    expect(jest.isMockFunction(mockMod.SomeRandomFunction)).toBe(true);
    expect(jest.isMockFunction(mockMod.AnotherFunction)).toBe(true);

    // Test weapons auto-generation
    expect(typeof mockMod.Weapons.AssaultRifle_AK4D).toBe('number');
    expect(typeof mockMod.Weapons.SomeRandomWeapon).toBe('number');

    // Test stringkeys auto-generation
    expect(typeof mockMod.stringkeys.some_random_key).toBe('string');
    expect(mockMod.stringkeys.some_random_key).toBe('mock_some_random_key');
});

import { DamageDropoffs2 } from './Gunshow.js'; // Use .js extension for compiled output

test('Test DamageDropoffs2', () => {
    const dropoff = new DamageDropoffs2();
    dropoff.recordHit(30, 10);
    dropoff.recordHit(20, 10);
    dropoff.recordHit(15, 20);
    const damagesAt10 = dropoff.distanceDamages.get(10);
    const damagesAt20 = dropoff.distanceDamages.get(20);
    expect(damagesAt10).toBeDefined();
    expect(damagesAt10!.length).toBe(2);
    expect(damagesAt10).toContain(30);
    expect(damagesAt10).toContain(20);
    expect(damagesAt20).toBeDefined();
    expect(damagesAt20!.length).toBe(1);
    expect(damagesAt20).toContain(15);
});

test('Test DamageDropoffs2 toDropoffs', () => {
    const dropoff = new DamageDropoffs2();
    dropoff.recordHit(20, 10); // should be excluded as it is a less common value, even though it appeared first
    dropoff.recordHit(30, 10);
    dropoff.recordHit(30, 10);
    dropoff.recordHit(15, 20);
    const toDropoffs = dropoff.toDropoffs();
    // [[damage, distance], ...]
    expect(toDropoffs.length).toBe(2);
    expect(toDropoffs).toContainEqual([30, 10]);
    expect(toDropoffs).toContainEqual([15, 20]);
});

test('Test DamageDropoffs2 prune', () => {
    const dropoff = new DamageDropoffs2();
    dropoff.recordHit(20, 10);
    dropoff.recordHit(30, 10);
    dropoff.recordHit(15, 20);
    dropoff.prune();
    expect(dropoff.distanceDamages.size).toBe(2);
    const damagesAt10 = dropoff.distanceDamages.get(10);
    const damagesAt20 = dropoff.distanceDamages.get(20);
    expect(damagesAt10).toBeDefined();
    expect(damagesAt10!.length).toBe(1);
    expect(damagesAt10).toContain(20);
    expect(damagesAt20).toBeDefined();
    expect(damagesAt20!.length).toBe(1);
    expect(damagesAt20).toContain(15);
});