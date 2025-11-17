jest.mock('modlib', () => ({}), { virtual: true });

(globalThis as any).mod = {
    AllPlayers: jest.fn(() => []),
    CountOf: jest.fn(() => 0),
    Cameras: { ThirdPerson: 'third-person' },
    SetCameraTypeForAll: jest.fn(),
    SetAIToHumanDamageModifier: jest.fn(),
    GetObjId: jest.fn(),
    GetTeam: jest.fn(),
    GetSoldierState: jest.fn(),
};

import { BatchedRoundRobinUpdater } from './Surfers';

class MockUpdater {
    updateCount = 0;
    update(): void {
        this.updateCount++;
    }
}

class MockDestructor {
    destroyCount = 0;
    destroy(): void {
        this.destroyCount++;
    }
}

describe('BatchedRoundRobinUpdater', () => {
    it('should update entities in round-robin order', () => {
        const updater = new BatchedRoundRobinUpdater<number, MockUpdater, MockDestructor>(10);
        const mock1 = new MockUpdater();
        const mock2 = new MockUpdater();
        const mock3 = new MockUpdater();
        updater.set(1, mock1);
        updater.set(2, mock2);
        updater.set(3, mock3);
        updater.update();
        expect(mock1.updateCount).toBe(1);
        expect(mock2.updateCount).toBe(1);
        expect(mock3.updateCount).toBe(1);
    });

    it('should respect maxEntitiesPerUpdate limit', () => {
        const updater = new BatchedRoundRobinUpdater<number, MockUpdater, MockDestructor>(2);
        const mock1 = new MockUpdater();
        const mock2 = new MockUpdater();
        const mock3 = new MockUpdater();
        updater.set(1, mock1);
        updater.set(2, mock2);
        updater.set(3, mock3);
        updater.update();
        expect(mock1.updateCount).toBe(1);
        expect(mock2.updateCount).toBe(1);
        expect(mock3.updateCount).toBe(0);
    });

    it('should continue from where it left off on next update', () => {
        const updater = new BatchedRoundRobinUpdater<number, MockUpdater, MockDestructor>(2);
        const mock1 = new MockUpdater();
        const mock2 = new MockUpdater();
        const mock3 = new MockUpdater();
        updater.set(1, mock1);
        updater.set(2, mock2);
        updater.set(3, mock3);
        updater.update();
        updater.update();
        expect(mock1.updateCount).toBe(2);
        expect(mock2.updateCount).toBe(1);
        expect(mock3.updateCount).toBe(1);
    });

    it('should call destructor when deleting', () => {
        const updater = new BatchedRoundRobinUpdater<number, MockUpdater, MockDestructor>(10);
        const mock = new MockUpdater();
        const destructor = new MockDestructor();
        updater.set(1, mock, destructor);
        updater.delete(1);
        expect(destructor.destroyCount).toBe(1);
    });

    it('should call old destructor when replacing updater', () => {
        const updater = new BatchedRoundRobinUpdater<number, MockUpdater, MockDestructor>(10);
        const mock1 = new MockUpdater();
        const destructor1 = new MockDestructor();
        const mock2 = new MockUpdater();
        updater.set(1, mock1, destructor1);
        updater.set(1, mock2);
        expect(destructor1.destroyCount).toBe(1);
    });

    it('should handle empty updater list', () => {
        const updater = new BatchedRoundRobinUpdater<number, MockUpdater, MockDestructor>(10);
        expect(() => updater.update()).not.toThrow();
    });

    it('should handle single updater correctly', () => {
        const updater = new BatchedRoundRobinUpdater<number, MockUpdater, MockDestructor>(10);
        const mock = new MockUpdater();
        updater.set(1, mock);
        updater.update();
        updater.update();
        expect(mock.updateCount).toBe(2);
    });

    it('should wrap around after reaching end', () => {
        const updater = new BatchedRoundRobinUpdater<number, MockUpdater, MockDestructor>(10);
        const mock1 = new MockUpdater();
        const mock2 = new MockUpdater();
        updater.set(1, mock1);
        updater.set(2, mock2);
        updater.update();
        updater.update();
        expect(mock1.updateCount).toBe(2);
        expect(mock2.updateCount).toBe(2);
    });

    it('should handle deletion of non-existent key', () => {
        const updater = new BatchedRoundRobinUpdater<number, MockUpdater, MockDestructor>(10);
        expect(() => updater.delete(999)).not.toThrow();
    });

    it('should adjust index correctly when deleting before current position', () => {
        const updater = new BatchedRoundRobinUpdater<number, MockUpdater, MockDestructor>(1);
        const mock1 = new MockUpdater();
        const mock2 = new MockUpdater();
        const mock3 = new MockUpdater();
        updater.set(1, mock1);
        updater.set(2, mock2);
        updater.set(3, mock3);
        updater.update();
        updater.update();
        updater.delete(1);
        updater.update();
        expect(mock2.updateCount).toBe(2);
    });

    it('should adjust index correctly when deleting at current position', () => {
        const updater = new BatchedRoundRobinUpdater<number, MockUpdater, MockDestructor>(1);
        const mock1 = new MockUpdater();
        const mock2 = new MockUpdater();
        const mock3 = new MockUpdater();
        updater.set(1, mock1);
        updater.set(2, mock2);
        updater.set(3, mock3);
        updater.update();
        updater.delete(2);
        updater.update();
        expect(mock3.updateCount).toBe(1);
    });

    it('should handle deletion of last element', () => {
        const updater = new BatchedRoundRobinUpdater<number, MockUpdater, MockDestructor>(10);
        const mock1 = new MockUpdater();
        const mock2 = new MockUpdater();
        updater.set(1, mock1);
        updater.set(2, mock2);
        updater.update();
        updater.update();
        updater.delete(2);
        updater.update();
        expect(mock1.updateCount).toBe(3);
    });

    it('should reset index to 0 when all elements deleted', () => {
        const updater = new BatchedRoundRobinUpdater<number, MockUpdater, MockDestructor>(10);
        const mock1 = new MockUpdater();
        updater.set(1, mock1);
        updater.update();
        updater.delete(1);
        const mock2 = new MockUpdater();
        updater.set(2, mock2);
        updater.update();
        expect(mock2.updateCount).toBe(1);
    });

    it('should not call destructor when none provided', () => {
        const updater = new BatchedRoundRobinUpdater<number, MockUpdater, MockDestructor>(10);
        const mock = new MockUpdater();
        updater.set(1, mock);
        expect(() => updater.delete(1)).not.toThrow();
    });
});

