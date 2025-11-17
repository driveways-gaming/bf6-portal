/**
 * Unit tests for WeaponTest.damageAtRange()
 * 
 * Run with: npm test or jest Gunshow2.test.ts
 */

import { WeaponTest } from './Gunshow2.js';

describe('WeaponTest.damageAtRange()', () => {

    test('Should return undefined when no data exists at range', () => {
        const wt = new WeaponTest();
        const result = wt.damageAtRange(10);
        expect(result).toBeUndefined();
    });

    test('Should return undefined when not enough samples (< 10)', () => {
        const wt = new WeaponTest();
        // Only 9 samples
        for (let i = 0; i < 9; i++) {
            wt.recordHit(10, 25);
        }
        const result = wt.damageAtRange(10);
        expect(result).toBeUndefined();
    });

    test('Should return damage when exactly 10 samples at 100% frequency', () => {
        const wt = new WeaponTest();
        for (let i = 0; i < 10; i++) {
            wt.recordHit(10, 25);
        }
        const result = wt.damageAtRange(10);
        expect(result).toBe(25);
    });

    test('Should return undefined when frequency < 30%', () => {
        const wt = new WeaponTest();
        // 10 hits at 25 damage, but 30 hits at other damages (10/40 = 25%)
        for (let i = 0; i < 10; i++) {
            wt.recordHit(10, 25);
        }
        for (let i = 0; i < 10; i++) {
            wt.recordHit(10, 20);
        }
        for (let i = 0; i < 10; i++) {
            wt.recordHit(10, 22);
        }
        for (let i = 0; i < 10; i++) {
            wt.recordHit(10, 18);
        }
        const result = wt.damageAtRange(10);
        expect(result).toBeUndefined();
    });

    test('Should return damage at exactly 30% frequency threshold', () => {
        const wt = new WeaponTest();
        // 10 hits at 25 damage (most frequent), 23 hits split among others
        // 10/33 = 30.3% - just above 30% threshold
        for (let i = 0; i < 10; i++) {
            wt.recordHit(10, 25);
        }
        // Split remaining 23 samples across multiple damages so 25 is still mode
        for (let i = 0; i < 8; i++) {
            wt.recordHit(10, 20);
        }
        for (let i = 0; i < 8; i++) {
            wt.recordHit(10, 22);
        }
        for (let i = 0; i < 7; i++) {
            wt.recordHit(10, 18);
        }
        const result = wt.damageAtRange(10);
        expect(result).toBe(25);
    });

    test('Should ignore headshot outliers and return body shot mode', () => {
        const wt = new WeaponTest();
        // 15 body shots at 25 damage
        for (let i = 0; i < 15; i++) {
            wt.recordHit(10, 25);
        }
        // 3 headshots at 50 damage (outliers)
        for (let i = 0; i < 3; i++) {
            wt.recordHit(10, 50);
        }
        const result = wt.damageAtRange(10);
        expect(result).toBe(25);
    });

    test('Should return most frequent damage with multiple values', () => {
        const wt = new WeaponTest();
        // Clear winner: 20 at one damage, fewer at others
        for (let i = 0; i < 20; i++) {
            wt.recordHit(10, 25);
        }
        for (let i = 0; i < 5; i++) {
            wt.recordHit(10, 22);
        }
        for (let i = 0; i < 3; i++) {
            wt.recordHit(10, 28);
        }
        const result = wt.damageAtRange(10);
        expect(result).toBe(25);
    });

    test('Should handle partial damage outliers', () => {
        const wt = new WeaponTest();
        // 18 full damage hits
        for (let i = 0; i < 18; i++) {
            wt.recordHit(10, 25);
        }
        // 2 partial damage hits (penetration through wall)
        for (let i = 0; i < 2; i++) {
            wt.recordHit(10, 8);
        }
        const result = wt.damageAtRange(10);
        expect(result).toBe(25);
    });

    test('Should work with decimal damage values', () => {
        const wt = new WeaponTest();
        for (let i = 0; i < 15; i++) {
            wt.recordHit(10, 24.5);
        }
        const result = wt.damageAtRange(10);
        expect(result).toBe(24.5);
    });

    test('Should handle different ranges independently', () => {
        const wt = new WeaponTest();
        // Range 10: 25 damage
        for (let i = 0; i < 15; i++) {
            wt.recordHit(10, 25);
        }
        // Range 50: 20 damage
        for (let i = 0; i < 15; i++) {
            wt.recordHit(50, 20);
        }
        
        const result10 = wt.damageAtRange(10);
        const result50 = wt.damageAtRange(50);
        
        expect(result10).toBe(25);
        expect(result50).toBe(20);
    });

    test('Should handle edge case of exactly required samples at minimum frequency', () => {
        const wt = new WeaponTest();
        // 10 hits at 25 (50%), 10 hits at 20 (50%)
        // First one processed should win if tied
        for (let i = 0; i < 10; i++) {
            wt.recordHit(10, 25);
        }
        for (let i = 0; i < 10; i++) {
            wt.recordHit(10, 20);
        }
        const result = wt.damageAtRange(10);
        // Should return one of them (the first max found)
        expect(typeof result).toBe('number');
    });

    test('Should return undefined when all samples are below threshold individually', () => {
        const wt = new WeaponTest();
        // 9 samples each of three different damages
        for (let i = 0; i < 9; i++) {
            wt.recordHit(10, 25);
            wt.recordHit(10, 22);
            wt.recordHit(10, 20);
        }
        const result = wt.damageAtRange(10);
        expect(result).toBeUndefined();
    });

    test('Should floor non-integer distances', () => {
        const wt = new WeaponTest();
        // Record hits at 10.1, 10.5, 10.9 - should all go to distance 10
        for (let i = 0; i < 4; i++) {
            wt.recordHit(10.1, 25);
            wt.recordHit(10.5, 25);
            wt.recordHit(10.9, 25);
        }
        const result = wt.damageAtRange(10);
        expect(result).toBe(25); // Should have 12 samples at distance 10
    });

    test('Should floor negative distances correctly', () => {
        const wt = new WeaponTest();
        // -0.5 should floor to -1, not 0
        for (let i = 0; i < 10; i++) {
            wt.recordHit(-0.5, 25);
        }
        expect(wt.damageAtRange(-1)).toBe(25);
        expect(wt.damageAtRange(0)).toBeUndefined();
    });

    test('Should treat 10.0 and 10 as same distance', () => {
        const wt = new WeaponTest();
        for (let i = 0; i < 5; i++) {
            wt.recordHit(10.0, 25);
        }
        for (let i = 0; i < 5; i++) {
            wt.recordHit(10, 25);
        }
        const result = wt.damageAtRange(10);
        expect(result).toBe(25); // Should have 10 samples total
    });

});

describe('WeaponTest.isComplete()', () => {

    test('Should return false when no data', () => {
        const wt = new WeaponTest();
        expect(wt.isComplete()).toBe(false);
    });

    test('Should return false when missing MAX_RANGE coverage', () => {
        // [1,25], [21,25], [22,22], [45,22], [46,18], [100,18]
        const wt = new WeaponTest();
        const data = [[1,25], [21,25], [22,22], [45,22], [46,18], [100,18]];
        for (const [dist, dmg] of data) {
            for (let i = 0; i < 10; i++) {
                wt.recordHit(dist, dmg);
            }
        }
        expect(wt.isComplete()).toBe(false);
    });

    test('Should return false when gap at boundary', () => {
        // [1,25], [21,25], [24,22], [45,22], [46,18], [150,18]
        // Gap at 23m - don't know if dropoff is at 22 or 23
        const wt = new WeaponTest();
        const data = [[1,25], [21,25], [24,22], [45,22], [46,18], [150,18]];
        for (const [dist, dmg] of data) {
            for (let i = 0; i < 10; i++) {
                wt.recordHit(dist, dmg);
            }
        }
        expect(wt.isComplete()).toBe(false);
    });

    test('Should return false when missing MIN_RANGE coverage', () => {
        // [10,25], [21,25], [22,22], [45,22], [46,18], [150,18]
        const wt = new WeaponTest();
        const data = [[10,25], [21,25], [22,22], [45,22], [46,18], [150,18]];
        for (const [dist, dmg] of data) {
            for (let i = 0; i < 10; i++) {
                wt.recordHit(dist, dmg);
            }
        }
        expect(wt.isComplete()).toBe(false);
    });

    test('Should return true for complete basic coverage', () => {
        // [1,25], [21,25], [22,22], [45,22], [46,18], [150,18]
        const wt = new WeaponTest();
        const data = [[1,25], [21,25], [22,22], [45,22], [46,18], [150,18]];
        for (const [dist, dmg] of data) {
            for (let i = 0; i < 10; i++) {
                wt.recordHit(dist, dmg);
            }
        }
        expect(wt.isComplete()).toBe(true);
    });

    test('Should return true with sparse data within ranges', () => {
        // [1,25], [10,25], [21,25], [22,22], [30,22], [45,22], [46,18], [75,18], [150,18]
        const wt = new WeaponTest();
        const data = [[1,25], [10,25], [21,25], [22,22], [30,22], [45,22], [46,18], [75,18], [150,18]];
        for (const [dist, dmg] of data) {
            for (let i = 0; i < 10; i++) {
                wt.recordHit(dist, dmg);
            }
        }
        expect(wt.isComplete()).toBe(true);
    });

    test('Should return true with single-meter damage value', () => {
        // [1,25], [10,25], [20,25], [21,22], [22,18], [45,18], [150,18]
        // Damage 22 only exists at exactly 21m
        const wt = new WeaponTest();
        const data = [[1,25], [10,25], [20,25], [21,22], [22,18], [45,18], [150,18]];
        for (const [dist, dmg] of data) {
            for (let i = 0; i < 10; i++) {
                wt.recordHit(dist, dmg);
            }
        }
        expect(wt.isComplete()).toBe(true);
    });

    test('Should return true with damage increase then decrease', () => {
        // [1,25], [20,25], [21,18], [45,18], [46,22], [100,22], [101,15], [150,15]
        // Damage: 25 → 18 → 22 → 15 (increase then decrease)
        const wt = new WeaponTest();
        const data = [[1,25], [20,25], [21,18], [45,18], [46,22], [100,22], [101,15], [150,15]];
        for (const [dist, dmg] of data) {
            for (let i = 0; i < 10; i++) {
                wt.recordHit(dist, dmg);
            }
        }
        expect(wt.isComplete()).toBe(true);
    });

    test('Should return true with data inserted in reverse order', () => {
        // Insert in reverse order to verify sparse array sorting
        const wt = new WeaponTest();
        const data = [[150,18], [46,18], [45,22], [22,22], [21,25], [1,25]];
        for (const [dist, dmg] of data) {
            for (let i = 0; i < 10; i++) {
                wt.recordHit(dist, dmg);
            }
        }
        expect(wt.isComplete()).toBe(true);
    });

    test('Should return true with data inserted in random order', () => {
        // Insert in random order
        const wt = new WeaponTest();
        const data = [[46,18], [1,25], [150,18], [21,25], [45,22], [22,22]];
        for (const [dist, dmg] of data) {
            for (let i = 0; i < 10; i++) {
                wt.recordHit(dist, dmg);
            }
        }
        expect(wt.isComplete()).toBe(true);
    });

    test('Should detect gap even with data inserted out of order', () => {
        // [1,25], [21,25], [24,22], [45,22], [46,18], [150,18]
        // Gap at 23m - inserted in mixed order
        const wt = new WeaponTest();
        const data = [[150,18], [1,25], [45,22], [21,25], [46,18], [24,22]];
        for (const [dist, dmg] of data) {
            for (let i = 0; i < 10; i++) {
                wt.recordHit(dist, dmg);
            }
        }
        expect(wt.isComplete()).toBe(false);
    });

});

describe('WeaponTest.getNextRangeToTest', () => {
    test('Should return first priority range (MIN_RANGE) when no data', () => {
        const wt = new WeaponTest();
        expect(wt.getNextRangeToTest()).toBe(1);
    });

    test('Should return MAX_RANGE (150) after MIN_RANGE tested', () => {
        const wt = new WeaponTest();
        for (let i = 0; i < 10; i++) {
            wt.recordHit(1, 25);
        }
        expect(wt.getNextRangeToTest()).toBe(150);
    });

    test('Should return a range when insufficient data exists', () => {
        const wt = new WeaponTest();
        
        // Only 5 hits at range 1 (insufficient)
        for (let i = 0; i < 5; i++) {
            wt.recordHit(1, 25);
        }
        
        // Should still return 1 because insufficient samples
        expect(wt.getNextRangeToTest()).toBe(1);
        
        // Add 5 more hits (now sufficient)
        for (let i = 0; i < 5; i++) {
            wt.recordHit(1, 25);
        }
        
        // Should move to next range (not necessarily 150, but shouldn't be 1)
        expect(wt.getNextRangeToTest()).not.toBe(1);
    });

    test('Should fill gap when range coverage exists', () => {
        const wt = new WeaponTest();
        
        // Create gap, but ensure MIN/MAX covered first
        for (let i = 0; i < 10; i++) {
            wt.recordHit(1, 25);
            wt.recordHit(150, 18);
            wt.recordHit(20, 25);
            wt.recordHit(30, 18);
        }
        
        // Should fill gaps - test iteratively
        let gapFilled = false;
        for (let iter = 0; iter < 50; iter++) {
            const next = wt.getNextRangeToTest();
            if (next === null) break;
            
            // Check if filling the 20-30 gap
            if (next > 20 && next < 30) {
                gapFilled = true;
                break;
            }
            
            // Record data at suggested range
            for (let i = 0; i < 10; i++) {
                wt.recordHit(next, next < 25 ? 25 : 18);
            }
        }
        
        expect(gapFilled).toBe(true);
    });

    test('Should return null when no more ranges needed', () => {
        const wt = new WeaponTest();
        
        // Create complete coverage: 1m to 150m with precise boundaries
        for (let i = 0; i < 10; i++) {
            wt.recordHit(1, 25);
            wt.recordHit(20, 25);
            wt.recordHit(21, 25);
            wt.recordHit(22, 22);
            wt.recordHit(35, 22);
            wt.recordHit(36, 22);
            wt.recordHit(37, 18);
            wt.recordHit(149, 18);
            wt.recordHit(150, 18);
        }
        
        // Should eventually return null when isComplete is true
        let next = wt.getNextRangeToTest();
        let iterations = 0;
        while (next !== null && iterations < 100) {
            for (let i = 0; i < 10; i++) {
                wt.recordHit(next, next < 22 ? 25 : next < 37 ? 22 : 18);
            }
            next = wt.getNextRangeToTest();
            iterations++;
        }
        
        expect(next).toBe(null);
        expect(wt.isComplete()).toBe(true);
    });

});
