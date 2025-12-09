import * as modlib from 'modlib';
/**
 * Library Code
 */
namespace Driveways {
    export namespace Metrics {
        interface MetricValue {
            count: number;
            total: number;
            min: number;
            max: number;
            last: number;
        }
        class MetricStore {
            private static metrics: Map<string, MetricValue> = new Map();
            private static totalCalls: number = 0;
            private static resetOnReport: Set<string> = new Set();
            static accumulate(name: string, value: number): void {
                this.totalCalls++;
                const metric = this.metrics.get(name) || {
                    count: 0,
                    total: 0,
                    min: Infinity,
                    max: -Infinity,
                    last: 0
                };
                metric.count++;
                metric.total += value;
                metric.min = Math.min(metric.min, value);
                metric.max = Math.max(metric.max, value);
                metric.last = value;
                this.metrics.set(name, metric);
            }
            static increment(name: string, amount: number = 1): void {
                this.accumulate(name, amount);
            }
            static decrement(name: string, amount: number = 1): void {
                this.accumulate(name, -amount);
            }
            static accumulatePeriodic(name: string, value: number): void {
                this.resetOnReport.add(name);
                this.accumulate(name, value);
            }
            static record(name: string, value: number): void {
                const metric = this.metrics.get(name) || {
                    count: 0,
                    total: 0,
                    min: Infinity,
                    max: -Infinity,
                    last: 0
                };
                metric.last = value;
                if (metric.min === Infinity) {
                    metric.min = value;
                } else {
                    metric.min = Math.min(metric.min, value);
                }
                if (metric.max === -Infinity) {
                    metric.max = value;
                } else {
                    metric.max = Math.max(metric.max, value);
                }
                this.metrics.set(name, metric);
            }
            static reset(name?: string): void {
                if (name) {
                    this.metrics.delete(name);
                    this.resetOnReport.delete(name);
                } else {
                    this.metrics.clear();
                    this.resetOnReport.clear();
                    this.totalCalls = 0;
                }
            }
            static report(): void {
                let output = `[Metrics] === Report (${this.metrics.size} metrics, ${this.totalCalls} total calls) ===\n`;
                for (const [name, metric] of this.metrics.entries()) {
                    if (metric.count > 0) {
                        // Accumulated metric - show full stats
                        const avg = metric.total / metric.count;
                        output += `  ${name}: total=${metric.total}, avg=${avg.toFixed(2)}, min=${metric.min}, max=${metric.max}, last=${metric.last}, n=${metric.count}\n`;
                    } else {
                        // Record-only metric - show just last, min, max
                        const minStr = metric.min === Infinity ? 'N/A' : metric.min.toString();
                        const maxStr = metric.max === -Infinity ? 'N/A' : metric.max.toString();
                        output += `  ${name}: last=${metric.last}, min=${minStr}, max=${maxStr}\n`;
                    }
                }
                Log(output);
                
                // Reset periodic metrics after reporting
                for (const name of this.resetOnReport) {
                    const metric = this.metrics.get(name);
                    if (metric) {
                        metric.count = 0;
                        metric.total = 0;
                        metric.min = Infinity;
                        metric.max = -Infinity;
                        // Keep last value
                    }
                }
            }
        }
        export function accumulate(name: string, value: number): void {
            MetricStore.accumulate(name, value);
        }
        export function accumulatePeriodic(name: string, value: number): void {
            MetricStore.accumulatePeriodic(name, value);
        }
        export function increment(name: string, amount: number = 1): void {
            MetricStore.increment(name, amount);
        }
        export function decrement(name: string, amount: number = 1): void {
            MetricStore.decrement(name, amount);
        }
        export function record(name: string, value: number): void {
            MetricStore.record(name, value);
        }
        export function reset(name?: string): void {
            MetricStore.reset(name);
        }
        export function report(): void {
            MetricStore.report();
        }
    }
    export interface DeregisterFn {
        (): void;
    }
    export namespace Events {
        const callbacks: Map<string, Function[]> = new Map();
        function register(event: string, callback: Function): DeregisterFn {
            if (!callbacks.has(event)) {
                callbacks.set(event, []);
            }
            callbacks.get(event)!.push(callback);
            updateMetrics();
            return () => {
                callbacks.get(event)!.splice(callbacks.get(event)!.indexOf(callback), 1);
                updateMetrics();
            };
        }
        function dispatch(event: string, ...args: any[]): void {
            const eventCallbacks = callbacks.get(event);
            if (!eventCallbacks) return;
            // Create a copy of the callbacks array to avoid issues if callbacks modify the array during iteration
            const callbacksCopy = [...eventCallbacks];
            callbacksCopy.forEach((cb, index) => {
                try {
                    cb(...args);
                } catch (e) {
                    console.error(`[Events] Exception in ${event} handler #${index}:`, e);
                }
            });
        }
        function updateMetrics(): void {
            Driveways.Metrics.record('numCallbacks', callbacks.size);
            for (const [eventName, eventCallbacks] of callbacks.entries()) {
                Driveways.Metrics.record('numCallbacks_' + eventName, eventCallbacks.length);
            }
        }
        export function OngoingGlobal(callback: () => void): DeregisterFn {
            return register('OngoingGlobal', callback);
        }
        export function OnPlayerDeployed(callback: (player: mod.Player) => void): DeregisterFn {
            return register('OnPlayerDeployed', callback);
        }
        export function OnPlayerDied(callback: (player: mod.Player) => void): DeregisterFn {
            return register('OnPlayerDied', callback);
        }
        export function OnPlayerJoinGame(callback: (player: mod.Player) => void): DeregisterFn {
            return register('OnPlayerJoinGame', callback);
        }
        export function OnPlayerLeaveGame(callback: (playerId: number) => void): DeregisterFn {
            return register('OnPlayerLeaveGame', callback);
        }
        export function OngoingPlayer(callback: (player: mod.Player) => void): DeregisterFn {
            return register('OngoingPlayer', callback);
        }
        export function OngoingLivePlayer(callback: (player: mod.Player) => void): DeregisterFn {
            const wrapped = (player: mod.Player) => {
                if (Driveways.Players.isAlive(player)) {
                    callback(player);
                }
            };
            return register('OngoingPlayer', wrapped);
        }
        export function OnGameModeStarted(callback: () => void): DeregisterFn {
            return register('OnGameModeStarted', callback);
        }
        export function OnPlayerUIButtonEvent(callback: (playerId: number, widgetName: string, eventUIButtonEvent: mod.UIButtonEvent) => void): DeregisterFn {
            return register('OnPlayerUIButtonEvent', callback);
        }
        export function dispatchOngoingGlobal(): void { dispatch('OngoingGlobal'); }
        export function dispatchOnPlayerDeployed(player: mod.Player): void { dispatch('OnPlayerDeployed', player); }
        export function dispatchOnPlayerDied(player: mod.Player): void { dispatch('OnPlayerDied', player); }
        export function dispatchOnPlayerJoinGame(player: mod.Player): void { dispatch('OnPlayerJoinGame', player); }
        export function dispatchOnPlayerLeaveGame(playerId: number): void { dispatch('OnPlayerLeaveGame', playerId); }
        export function dispatchOngoingPlayer(player: mod.Player): void { dispatch('OngoingPlayer', player); }
        export function dispatchOnGameModeStarted(): void { dispatch('OnGameModeStarted'); }
        export function dispatchOnPlayerUIButtonEvent(eventPlayer: mod.Player, eventUIWidget: mod.UIWidget, eventUIButtonEvent: mod.UIButtonEvent): void {
            const playerId = mod.GetObjId(eventPlayer);
            const widgetName = mod.GetUIWidgetName(eventUIWidget);
            dispatch('OnPlayerUIButtonEvent', playerId, widgetName, eventUIButtonEvent);
        }
    }
    export namespace Time {        
        let internalTick: number = 0;
        let startTime: number = Date.now();
        Driveways.Events.OngoingGlobal(() => {
            internalTick++;
        });
        export function CurrentTick(): number {
            return internalTick;
        }
        export function TicksSince(tick: number): number {
            return internalTick - tick;
        }
        export function ServerTime(): number {
            return internalTick / 30;
        }
        export function WallTime(): number {
            return (Date.now() - startTime) / 1000;
        }
    }
    export namespace Players {
        const teamMembers: Map<number, Set<number>> = new Map();
        const playerToTeam: Map<number, number> = new Map();
        const playerIsBot: Map<number, boolean> = new Map();
        export function players(): mod.Player[] {
            const allPlayers = mod.AllPlayers();
            const n = mod.CountOf(allPlayers);
            const players: mod.Player[] = [];
            for (let i = 0; i < n; i++) {
                const player = mod.ValueInArray(allPlayers, i) as mod.Player;
                if (isAlive(player)) {
                    players.push(mod.ValueInArray(allPlayers, i) as mod.Player);
                }
            }
            return players;
        }
        function addPlayer(playerId: number, teamId: number, isBot?: boolean): void {
            if (!teamMembers.has(teamId)) {
                teamMembers.set(teamId, new Set());
            }
            teamMembers.get(teamId)!.add(playerId);
            playerToTeam.set(playerId, teamId);
            if (isBot !== undefined) {
                playerIsBot.set(playerId, isBot);
            }
        }
        function removePlayer(playerId: number): void {
            const teamId = playerToTeam.get(playerId);
            if (teamId !== undefined) {
                teamMembers.get(teamId)?.delete(playerId);
                playerToTeam.delete(playerId);
                playerIsBot.delete(playerId);
            }
        }
        export function reset(): void {
            teamMembers.clear();
            playerToTeam.clear();
            playerIsBot.clear();
            const allPlayers = mod.AllPlayers();
            const n = mod.CountOf(allPlayers);
            for (let i = 0; i < n; i++) {
                let player = mod.ValueInArray(allPlayers, i) as mod.Player;
                const playerId = mod.GetObjId(player);
                const team = mod.GetTeam(player);
                const teamId = mod.GetObjId(team);
                if (mod.GetSoldierState(player, mod.SoldierStateBool.IsAlive)) {
                    const isBot = mod.GetSoldierState(player, mod.SoldierStateBool.IsAISoldier);
                    addPlayer(playerId, teamId, isBot);
                }
            }
        }
        export function getPlayerTeam(playerId: number): number | undefined;
        export function getPlayerTeam(player: mod.Player): number | undefined;
        export function getPlayerTeam(playerOrId: number | mod.Player): number | undefined {
            const playerId = typeof playerOrId === 'number' ? playerOrId : mod.GetObjId(playerOrId);
            return playerToTeam.get(playerId);
        }
        export function isPlayerBot(playerId: number): boolean;
        export function isPlayerBot(player: mod.Player): boolean;
        export function isPlayerBot(playerOrId: number | mod.Player): boolean {
            const playerId = typeof playerOrId === 'number' ? playerOrId : mod.GetObjId(playerOrId);
            return playerIsBot.get(playerId) || false;
        }
        export function isAlive(playerId: number): boolean;
        export function isAlive(player: mod.Player): boolean;
        export function isAlive(playerOrId: number | mod.Player): boolean {
            const playerId = typeof playerOrId === 'number' ? playerOrId : mod.GetObjId(playerOrId);
            return playerToTeam.has(playerId);
        }
        export function getPlayerCount(teamId: number): number {
            return teamMembers.get(teamId)?.size || 0;
        }
        const allPlayers = mod.AllPlayers();
        const n = mod.CountOf(allPlayers);
        let foundAlivePlayers = 0;
        for (let i = 0; i < n; i++) {
            let player = mod.ValueInArray(allPlayers, i) as mod.Player;
            const isAlive = mod.GetSoldierState(player, mod.SoldierStateBool.IsAlive);
            if (isAlive) {
                foundAlivePlayers++;
                const playerId = mod.GetObjId(player);
                const team = mod.GetTeam(player);
                const teamId = mod.GetObjId(team);
                const isBot = mod.GetSoldierState(player, mod.SoldierStateBool.IsAISoldier);
                console.error(`[Players] ASSERTION FAILED: Player ${playerId} already alive on script load. This should not happen.`);
                addPlayer(playerId, teamId, isBot);
            }
        }
        if (foundAlivePlayers > 0) {
            console.error(`[Players] ASSERTION FAILED: Found ${foundAlivePlayers} already-deployed player(s) on script load.`);
        }
        Driveways.Events.OnPlayerDeployed((player: mod.Player) => {
            const playerId = mod.GetObjId(player);
            const team = mod.GetTeam(player);
            const teamId = mod.GetObjId(team);
            const isBot = mod.GetSoldierState(player, mod.SoldierStateBool.IsAISoldier);
            addPlayer(playerId, teamId, isBot);
        });
        Driveways.Events.OnPlayerDied((player: mod.Player) => {
            const playerId = mod.GetObjId(player);
            removePlayer(playerId);
        });
        Driveways.Events.OnPlayerLeaveGame((playerId: number) => {
            removePlayer(playerId);
        });
    }
    export class RateLimiter {
        private static lastTicks: Map<string, number> = new Map();
        
        static everyNTicks(key: string, n: number, callback: () => void): void {
            const lastTick = this.lastTicks.get(key) || 0;
            if (Driveways.Time.TicksSince(lastTick) >= n) {
                this.lastTicks.set(key, Driveways.Time.CurrentTick());
                callback();
            }
        }
    }
    export class UIButtons {
        private static callbackRegistry: Map<number, Map<string, Function>> = new Map();
        private static registerCallback(playerId: number, widgetName: string, callback: Function): void {
            if (!UIButtons.callbackRegistry.has(playerId)) {
                UIButtons.callbackRegistry.set(playerId, new Map());
            }
            UIButtons.callbackRegistry.get(playerId)?.set(widgetName, callback);
        }
        static {
            Driveways.Events.OnPlayerUIButtonEvent((playerId, widgetName, eventUIButtonEvent) => {
                const callback = UIButtons.callbackRegistry.get(playerId)?.get(widgetName);
                if (callback) {
                    callback(eventUIButtonEvent);
                }
            });
        }
        private static unregisterCallback(playerId: number, widgetName: string): void {
            UIButtons.callbackRegistry.get(playerId)?.delete(widgetName);
        }
        private upButton: mod.UIWidget;
        private downButton: mod.UIWidget;
        constructor(id: number, upCallback: Function, downCallback: Function) {
            // TODO: Just one base button template, or one per type (button, counter, toggle)
            this.upButton = modlib.ParseUI(
                {
                name: "Button_Up_" + id,
                type: "Button",
                position: [1476 + (id * 120), 714],
                size: [100, 50],
                anchor: mod.UIAnchor.TopLeft,
                visible: true,
                padding: 0,
                bgColor: [1, 1, 1],
                bgAlpha: 1,
                bgFill: mod.UIBgFill.Solid,
                buttonEnabled: true,
                buttonColorBase: [1, 1, 1],
                buttonAlphaBase: 0.5,
                buttonColorDisabled: [0.1, 0.1, 0.1],
                buttonAlphaDisabled: 0.3,
                buttonColorPressed: [0.2, 0.2, 0.2],
                buttonAlphaPressed: 1,
                buttonColorHover: [0.4, 0.4, 0.4],
                buttonAlphaHover: 1,
                buttonColorFocused: [0.5, 0.5, 0.5],
                buttonAlphaFocused: 1
                }
            )!;
            this.downButton = modlib.ParseUI(
                {
                name: "Button_Down_" + id,
                type: "Button",
                position: [1476 + (id * 120), 766],
                size: [100, 50],
                anchor: mod.UIAnchor.TopLeft,
                visible: true,
                padding: 0,
                bgColor: [1, 1, 1],
                bgAlpha: 1,
                bgFill: mod.UIBgFill.Solid,
                buttonEnabled: true,
                buttonColorBase: [1, 1, 1],
                buttonAlphaBase: 0.5,
                buttonColorDisabled: [0.1, 0.1, 0.1],
                buttonAlphaDisabled: 0.3,
                buttonColorPressed: [0.2, 0.2, 0.2],
                buttonAlphaPressed: 1,
                buttonColorHover: [0.4, 0.4, 0.4],
                buttonAlphaHover: 1,
                buttonColorFocused: [0.5, 0.5, 0.5],
                buttonAlphaFocused: 1
                }
            )!;
            Driveways.UIButtons.registerCallback(id, "Button_Up_" + id, upCallback);
            Driveways.UIButtons.registerCallback(id, "Button_Down_" + id, downCallback);
        }
        destroy(playerId: number): void {
            // TODO: all components should be on instance or static, not a mix
            mod.DeleteUIWidget(this.upButton);
            mod.DeleteUIWidget(this.downButton);
            Driveways.UIButtons.unregisterCallback(playerId, "Button_Up_" + playerId);
            Driveways.UIButtons.unregisterCallback(playerId, "Button_Down_" + playerId);
        }
    }
    export namespace Signals {
        export class Boolean {
            private signalVariable: mod.SoldierStateBool;
            private signalValue: boolean;
            private lastSignalValue: boolean;
            private risingSignalCallback: () => void = () => {};
            private fallingSignalCallback: () => void = () => {};
            private deregisterCallbacks: Driveways.DeregisterFn[] = [];
            constructor(playerId: number, signalVariable: mod.SoldierStateBool) {
                this.signalVariable = signalVariable;
                this.signalValue = false;
                this.lastSignalValue = false;
                this.deregisterCallbacks = [];
                this.deregisterCallbacks.push(Events.OngoingLivePlayer((player) => {
                    if (playerId === mod.GetObjId(player)) {
                        this.update(player);
                    }
                }));
                this.deregisterCallbacks.push(Events.OnPlayerDied((player) => {
                    if (playerId === mod.GetObjId(player)) {
                        this.destroy();
                    }
                }));
                this.deregisterCallbacks.push(Events.OnPlayerLeaveGame((leavingPlayerId) => {
                    if (playerId === leavingPlayerId) {
                        this.destroy();
                    }
                }));
            }
            private destroy(): void {
                this.deregisterCallbacks.forEach(deregisterFn => deregisterFn());
                this.deregisterCallbacks = [];
            }
            get Value(): boolean {
                return this.signalValue;
            }
            onRisingSignal(callback: () => void): void {
                this.risingSignalCallback = callback;
            }
            onFallingSignal(callback: () => void): void {
                this.fallingSignalCallback = callback;
            }
            update(player: mod.Player): void {
                this.signalValue = mod.GetSoldierState(player, this.signalVariable);
                if (this.signalValue && !this.lastSignalValue) {
                    Debug("Rising signal");
                    this.risingSignalCallback();
                } else if (!this.signalValue && this.lastSignalValue) {
                    Debug("Falling signal");
                    this.fallingSignalCallback();
                }
                this.lastSignalValue = this.signalValue;
            }
        }
    }
    export namespace Logging {
        export enum LogLevel {
            Debug,
            Info,
            Warn,
            Error,
        }
        class Logger {
            private static logLevel: LogLevel = LogLevel.Info;
            static log(message: string, logLevel: LogLevel): void {
                if (logLevel >= Logger.logLevel) {
                    console.log("[" + Driveways.Time.WallTime().toFixed(3) + "] " + message);
                }
            }
        }
        export function VectorToString(vector: mod.Vector): string {
            return "" + mod.XComponentOf(vector).toFixed(2) + " " + mod.YComponentOf(vector).toFixed(2) + " " + mod.ZComponentOf(vector).toFixed(2) + "";
        }
        export function Log(message: string): void {
            Logger.log(message, LogLevel.Info);
        }
        export function Debug(message: string): void {
            Logger.log(message, LogLevel.Debug);
        }
        export function Info(message: string): void {
            Logger.log(message, LogLevel.Info);
        }
        export function Warn(message: string): void {
            Logger.log(message, LogLevel.Warn);
        }
        export function Error(message: string): void {
            Logger.log(message, LogLevel.Error);
        }
    }
    interface SpawnerObjectFamilyUnit {
        spawnerId: number;
        spatialObjectId?: number;
    }
    interface Spawn {
        spawnerId: number;
        teamId: number;
    }
    export class SpawnGroup {
        private spawners: Map<number, BotSpawner> = new Map();
        private spawnerIds: number[] = [];
        private spawnerIdIndex: number = 0;
        private spawnQueue: Spawn[] = [];
        private ticksPerSpawn: number = 30;
        private lastSpawnTick: number = 0;
        private deregisterCallback?: Driveways.DeregisterFn;
        constructor(spawnerObjectFamilyUnits: SpawnerObjectFamilyUnit[]) {
            this.spawnerIds = spawnerObjectFamilyUnits.map(unit => unit.spawnerId);
            for (const spawnerObjectFamilyUnit of spawnerObjectFamilyUnits) {
                const spawner = mod.GetSpawner(spawnerObjectFamilyUnit.spawnerId);
                mod.AISetUnspawnOnDead(spawner, true);
                mod.SetUnspawnDelayInSeconds(spawner, 0);
                if (spawner) {
                    this.spawners.set(spawnerObjectFamilyUnit.spawnerId, new BotSpawner(spawnerObjectFamilyUnit.spawnerId, spawner));
                }
            }
            this.deregisterCallback = Driveways.Events.OngoingGlobal(() => {
                this.processQueue();
            });
        }
        nextSpawner(): BotSpawner | undefined {
            const spawnerId = this.spawnerIds[this.spawnerIdIndex];
            this.spawnerIdIndex++;
            if (this.spawnerIdIndex >= this.spawnerIds.length) {
                this.spawnerIdIndex = 0;
            }
            return this.spawners.get(spawnerId);
        }
        pushSpawn(teamId: number): void {
            const spawnerId = this.nextSpawner()?.spawnerId;
            if (spawnerId) {
                this.spawnQueue.push({ spawnerId: spawnerId, teamId: teamId });
            } else {
                Warn("No spawner found for team " + teamId);
            }
        }
        processQueue(): void {
            if (this.ticksPerSpawn <= 0) {
                while (this.processNextSpawn()) {}
            } else {
                if (Driveways.Time.TicksSince(this.lastSpawnTick) >= this.ticksPerSpawn) {
                    this.lastSpawnTick = Driveways.Time.CurrentTick();
                    this.processNextSpawn();
                }
            }
        }
        processNextSpawn(): boolean {
            let didSpawn = false;
            const spawn = this.spawnQueue.shift();
            if (spawn) {
                const spawner = this.spawners.get(spawn.spawnerId);
                if (spawner) {
                    mod.SpawnAIFromAISpawner(spawner.spawner, mod.SoldierClass.Engineer, mod.GetTeam(spawn.teamId));
                } else {
                    Warn("No spawner found for spawn " + spawn.spawnerId);
                }
                didSpawn = true;
            }
            return didSpawn;
        }
        fillToCapacity(capacity: number, teamId: number): void {
            Debug("Filling to capacity for team " + teamId + " with capacity " + capacity);
            const teamMembers = Driveways.Players.getPlayerCount(teamId);
            if (teamMembers >= capacity) {
                Debug("Team " + teamId + " already has " + teamMembers + " members, not filling");
                return;
            }


            const pendingSpawnsForTeam = this.spawnQueue.filter(spawn => spawn.teamId === teamId);
            const liveAndPending = pendingSpawnsForTeam.length + teamMembers;
            const otherTeamMembers = Driveways.Players.getPlayerCount(3 - teamId);
            if (liveAndPending >= otherTeamMembers + 1) {
                Debug("Team " + teamId + " has " + liveAndPending + " members, other team has " + otherTeamMembers + " members, not filling");
                return;
            }
            if (liveAndPending >= capacity) {
                Debug("Team " + teamId + " already has " + liveAndPending + " members, not filling");
                return;
            }
            for (let i = 0; i < capacity - liveAndPending; i++) {
                this.pushSpawn(teamId);
            }
        }
    }
    class BotSpawner {
        spawnerId: number;
        spawner: mod.Spawner;
        constructor(spawnerId: number, spawner: mod.Spawner) {
            this.spawnerId = spawnerId;
            this.spawner = spawner;
        }
    }
    export namespace Terrain {
        export class Grid {
            blockWidth: number;
            blockHeight: number;
            blockDepth: number;
            maxBlocks: number;
            origin: Driveways.Physics.Vec3;
            blockObject: mod.RuntimeSpawn_Common;
            constructor(blockWidth: number, blockHeight: number, blockDepth: number, maxBlocks: number, origin: Driveways.Physics.Vec3, blockObject: mod.RuntimeSpawn_Common) {
                this.blockWidth = blockWidth;
                this.blockHeight = blockHeight;
                this.blockDepth = blockDepth;
                this.maxBlocks = maxBlocks;
                this.origin = origin;
                this.blockObject = blockObject;
                Driveways.Events.OnGameModeStarted(() => {
                    Log("Placing terrain");
                    this.placeTerrain();
                });
            }
            static get instance(): Grid {
                if (!Grid._instance) {
                    Grid._instance = new Grid(10, 10, 20, 1000, new Driveways.Physics.Vec3(-400, 120, -200), mod.RuntimeSpawn_Common.HighwayOverpass_Foundation_01);
                }
                return Grid._instance;
            }
            private static _instance: Grid;
            placeTerrain() {
                const aspectRatio = this.blockDepth / this.blockWidth;
                const numRows = Math.ceil(Math.sqrt(this.maxBlocks / aspectRatio));
                const numCols = Math.ceil(Math.sqrt(this.maxBlocks * aspectRatio));
                let blocksPlaced = 0;
                for (let row = 0; row < numRows && blocksPlaced < this.maxBlocks; row++) {
                    for (let col = 0; col < numCols && blocksPlaced < this.maxBlocks; col++) {
                        const blockPosition = mod.CreateVector(
                            this.origin.x + col * this.blockWidth,
                            this.origin.y + (Math.random() * 10) - Math.abs(col - (numCols / 2)) * 2 - Math.abs(row - (numRows / 2)) * 2,
                            this.origin.z + row * this.blockDepth
                        );
                        mod.SpawnObject(this.blockObject, blockPosition, mod.CreateVector(0, 0, 0));
                        blocksPlaced++;
                    }
                }
                Log(`Placed ${blocksPlaced} blocks in ${numRows} rows × ${numCols} cols`);
            }
        }
        interface MapperUpdater extends Updates.Lifecycle<Updates.Updater, Updates.Destructor> {
            playerId: number;
        }
        export class Mapper {
            players: Map<number, mod.Player> = new Map();
            updateGroup: Updates.UpdateGroup<number, MapperUpdater> = new Updates.BatchedRoundRobinUpdater(30);
            recordedPoints: Driveways.Physics.Vec3[] = [];
            spatialGrid: Driveways.Physics.SpatialGrid;
            minPointDistance: number = 5.0;
            recordInterval: number = 1;
            lastRecordTick: Map<number, number> = new Map();
            positions: Float32Array = new Float32Array(10000 * 3);
            pointCount: number = 0;
            private deregisterCallbacks: Driveways.DeregisterFn[] = [];
            constructor(minPointDistance: number = 5.0) {
                this.minPointDistance = minPointDistance;
                this.spatialGrid = new Driveways.Physics.SpatialGrid(minPointDistance);
                const callback = (player: mod.Player) => {
                    const playerId = mod.GetObjId(player);
                    this.players.set(playerId, player);
                    this.lastRecordTick.set(playerId, 0);
                    this.updateGroup.set(playerId, {
                        playerId: playerId,
                        updater: () => {
                            const currentPlayer = this.players.get(playerId);
                            if (currentPlayer) {
                                this.update(currentPlayer);
                            }
                        },
                        destructor: () => this.destroy(playerId),
                    });
                };
                const deregister = Driveways.Events.OnPlayerDeployed(callback);
                this.deregisterCallbacks.push(deregister);
                this.deregisterCallbacks.push(Driveways.Events.OngoingGlobal(() => {
                    Driveways.RateLimiter.everyNTicks('mapper_update', 1, () => {
                        this.updateGroup.update();
                    });
                    Driveways.RateLimiter.everyNTicks('mapper_export', 300, () => {
                        this.exportPoints();
                    });
                }));
            }
            update(player: mod.Player): void {
                const playerId = mod.GetObjId(player);
                if (!Driveways.Players.isAlive(player)) return;
                const ticksSinceLastRecord = Driveways.Time.TicksSince(this.lastRecordTick.get(playerId) || 0);
                if (ticksSinceLastRecord < this.recordInterval) return;
                const playerPosition = mod.GetSoldierState(player, mod.SoldierStateVector.GetPosition);
                const point = Driveways.Physics.Vec3.fromModVector(playerPosition);
                point.y += 2.2;
                if (this.isValidPoint(point)) {
                    this.addPoint(point);
                    this.lastRecordTick.set(playerId, Driveways.Time.CurrentTick());
                    Log(`Recorded point ${this.pointCount}: ${point.x.toFixed(1)}, ${point.y.toFixed(1)}, ${point.z.toFixed(1)}`);
                }
            }
            isValidPoint(newPoint: Driveways.Physics.Vec3): boolean {
                const nearby = this.spatialGrid.getNearbyFromFloats(newPoint.x, newPoint.y, newPoint.z);
                for (const neighborIndex of nearby) {
                    const idx = neighborIndex * 3;
                    const nx = this.positions[idx];
                    const ny = this.positions[idx + 1];
                    const nz = this.positions[idx + 2];
                    const dx = newPoint.x - nx;
                    const dy = newPoint.y - ny;
                    const dz = newPoint.z - nz;
                    const distSq = dx * dx + dy * dy + dz * dz;
                    if (distSq < this.minPointDistance * this.minPointDistance) {
                        return false;
                    }
                }
                return true;
            }
            addPoint(point: Driveways.Physics.Vec3): void {
                const idx = this.pointCount * 3;
                this.positions[idx] = point.x;
                this.positions[idx + 1] = point.y;
                this.positions[idx + 2] = point.z;
                this.recordedPoints.push(point);
                this.pointCount++;
                this.spatialGrid.clearAndRebuild(this.positions.subarray(0, this.pointCount * 3));
                
                // Spawn object at the new point
                const spawnPosition = mod.CreateVector(point.x, point.y + 4, point.z);
                mod.SpawnObject(mod.RuntimeSpawn_Common.BarrierStoneBlock_01_A, spawnPosition, mod.CreateVector(0, 0, 0));
                // VFX.makeABoom(point);
            }
            destroy(playerId: number): void {
                this.players.delete(playerId);
                this.lastRecordTick.delete(playerId);
                this.updateGroup.delete(playerId);
            }
            exportPoints(): void {
                let output = `${this.pointCount} points:\n`;
                for (let i = 0; i < this.pointCount; i++) {
                    if (i % 100 === 0) {
                        Log(output);
                        output = `${this.pointCount} points:\n`;
                    }
                    const p = this.recordedPoints[i];
                    output += `[${p.x.toFixed(2)},${p.y.toFixed(2)},${p.z.toFixed(2)}],\n`;
                }
                Log(output);
            }
        }
    }
    export namespace Updates {
        export interface Updater {
            (): void;
        }
        export interface Destructor {
            (): void;
        }
        export interface Lifecycle<U extends Updater, D extends Destructor> {
            updater: Updater;
            destructor?: Destructor;
        }
        export interface UpdateGroup<K, L extends Lifecycle<Updater, Destructor>> {
            set(key: K, lifecycle: L): void;
            delete(key: K): void;
            update(): void;
        }
        export class BatchedRoundRobinUpdater<K, L extends Lifecycle<Updater, Destructor>> implements UpdateGroup<K, L> {
            updaters: Map<K, L> = new Map();
            updaterKeys: K[] = [];
            maxEntitiesPerUpdate: number = 10;
            lastUpdateIndex: number = 0;
            constructor(maxEntitiesPerUpdate: number, updaters?: Map<K, L>) {
                this.maxEntitiesPerUpdate = maxEntitiesPerUpdate;
                this.updaters = updaters ?? new Map();
            }
            set(key: K, lifecycle: L): void {
                if (!this.updaters.has(key)) {
                    this.updaterKeys.push(key);
                }
                const { destructor: existingDestructor } = this.updaters.get(key) ?? {};
                if (existingDestructor) {
                    existingDestructor();
                }
                this.updaters.set(key, lifecycle);
            }
            delete(key: K): void {
                const lifecycle = this.updaters.get(key);
                if (!lifecycle) return;
                if (lifecycle.destructor) {
                    lifecycle.destructor();
                }
                this.updaters.delete(key);
                const keyIndex = this.updaterKeys.indexOf(key);
                if (keyIndex !== -1) {
                    this.updaterKeys.splice(keyIndex, 1);
                    if (this.updaterKeys.length === 0) {
                        this.lastUpdateIndex = 0;
                    } else if (this.lastUpdateIndex >= this.updaterKeys.length) {
                        this.lastUpdateIndex = 0;
                    } else if (this.lastUpdateIndex > keyIndex) {
                        this.lastUpdateIndex--;
                    }
                }
            }
            update(): void {
                if (this.updaterKeys.length === 0) return;
                const entitiesToUpdate = Math.min(this.maxEntitiesPerUpdate, this.updaterKeys.length);
                for (let i = 0; i < entitiesToUpdate; i++) {
                    const key = this.updaterKeys[this.lastUpdateIndex];
                    const updater = this.updaters.get(key);
                    if (updater) {
                        try {
                            updater.updater();
                        } catch (error) {
                            Error("Error updating updater " + key + ": " + error);
                        }
                    }
                    this.lastUpdateIndex = (this.lastUpdateIndex + 1) % this.updaterKeys.length;
                }
            }
        }
    }
    export namespace Physics {
        export interface NeighborData {
            index: number;
            position: Vec3;
            velocity: Vec3;
            distance: number;
            distanceSq: number;
        }
        export interface IForce {
            name: string;
            weight: number;
            enabled: boolean;
            calculate(blockIndex: number, position: Vec3, velocity: Vec3, neighbors: NeighborData[], outForce: Vec3): void;
        }
        export abstract class BaseNeighborForce implements IForce {
            abstract name: string;
            enabled: boolean = true;
            constructor(public weight: number, protected perceptionRadius: number) {}
            calculate(i: number, pos: Vec3, vel: Vec3, neighbors: NeighborData[], out: Vec3): void {
                out.setZero();
                let count = 0;
                const accumulator = new Vec3(0, 0, 0);
                for (const neighbor of neighbors) {
                    if (neighbor.index === i) continue;
                    if (neighbor.distance > this.perceptionRadius) continue;
                    if (this.shouldAccumulate(neighbor.distance)) {
                        this.accumulate(i, pos, vel, neighbor, accumulator);
                        count++;
                    }
                }
                if (count > 0) {
                    this.processAccumulated(accumulator, count, pos, vel, out);
                }
            }
            protected shouldAccumulate(dist: number): boolean {
                return true;
            }
            protected abstract accumulate(
                i: number, pos: Vec3, vel: Vec3, neighbor: NeighborData,
                accumulator: Vec3
            ): void;
            protected abstract processAccumulated(
                accumulator: Vec3, count: number, pos: Vec3, vel: Vec3, out: Vec3
            ): void;
        }
        export class SpatialGrid {
            cellSize: number;
            grid: Map<string, number[]>;
            blockToCell: Map<number, string>;
            constructor(cellSize: number) {
                this.cellSize = cellSize;
                this.grid = new Map();
                this.blockToCell = new Map();
            }
            getCellKeyFromFloats(x: number, y: number, z: number): string {
                const cx = Math.floor(x / this.cellSize);
                const cy = Math.floor(y / this.cellSize);
                const cz = Math.floor(z / this.cellSize);
                return `${cx},${cy},${cz}`;
            }
            clearAndRebuild(positions: Float32Array): void {
                this.grid.clear();
                this.blockToCell.clear();
                for (let i = 0; i < positions.length / 3; i++) {
                    const idx = i * 3;
                    const key = this.getCellKeyFromFloats(
                        positions[idx],
                        positions[idx + 1],
                        positions[idx + 2]
                    );
                    if (!this.grid.has(key)) {
                        this.grid.set(key, []);
                    }
                    this.grid.get(key)!.push(i);
                    this.blockToCell.set(i, key);
                }
            }
            updateBlock(blockIndex: number, positions: Float32Array): void {
                const idx = blockIndex * 3;
                const newKey = this.getCellKeyFromFloats(
                    positions[idx],
                    positions[idx + 1],
                    positions[idx + 2]
                );
                const oldKey = this.blockToCell.get(blockIndex);
                if (oldKey !== newKey) {
                    if (oldKey !== undefined) {
                        const oldCell = this.grid.get(oldKey);
                        if (oldCell) {
                            const index = oldCell.indexOf(blockIndex);
                            if (index !== -1) {
                                oldCell.splice(index, 1);
                            }
                            if (oldCell.length === 0) {
                                this.grid.delete(oldKey);
                            }
                        }
                    }
                    if (!this.grid.has(newKey)) {
                        this.grid.set(newKey, []);
                    }
                    this.grid.get(newKey)!.push(blockIndex);
                    this.blockToCell.set(blockIndex, newKey);
                }
            }
            updateBlocks(blockIndices: number[], positions: Float32Array): void {
                for (const blockIndex of blockIndices) {
                    this.updateBlock(blockIndex, positions);
                }
            }
            getNearbyFromFloats(x: number, y: number, z: number): number[] {
                const cx = Math.floor(x / this.cellSize);
                const cy = Math.floor(y / this.cellSize);
                const cz = Math.floor(z / this.cellSize);
                const nearby: number[] = [];
                for (let dx = -1; dx <= 1; dx++) {
                    for (let dy = -1; dy <= 1; dy++) {
                        for (let dz = -1; dz <= 1; dz++) {
                            const key = `${cx + dx},${cy + dy},${cz + dz}`;
                            const cell = this.grid.get(key);
                            if (cell) {
                                for (let k = 0; k < cell.length; k++) {
                                    nearby.push(cell[k]);
                                }
                            }
                        }
                    }
                }
                return nearby;
            }
        }
        export class Vec3 {
            constructor(public x: number, public y: number, public z: number) {}
            mul(scalar: number): Vec3 {
                return new Vec3(this.x * scalar, this.y * scalar, this.z * scalar);
            }
            set(x: number, y: number, z: number): Vec3 {
                this.x = x;
                this.y = y;
                this.z = z;
                return this;
            }
            addMut(other: Vec3): Vec3 {
                this.x += other.x;
                this.y += other.y;
                this.z += other.z;
                return this;
            }
            subMut(other: Vec3): Vec3 {
                this.x -= other.x;
                this.y -= other.y;
                this.z -= other.z;
                return this;
            }
            sub(other: Vec3): Vec3 {
                return new Vec3(this.x - other.x, this.y - other.y, this.z - other.z);
            }
            mulMut(scalar: number): Vec3 {
                this.x *= scalar;
                this.y *= scalar;
                this.z *= scalar;
                return this;
            }
            divMut(scalar: number): Vec3 {
                if (scalar !== 0) {
                    this.x /= scalar;
                    this.y /= scalar;
                    this.z /= scalar;
                }
                return this;
            }
            normalizeMut(): Vec3 {
                const mag = this.magnitude();
                if (mag > 0) {
                    this.divMut(mag);
                }
                return this;
            }
            normalize(): Vec3 {
                const mag = this.magnitude();
                if (mag > 0) {
                    return new Vec3(this.x / mag, this.y / mag, this.z / mag);
                }
                return new Vec3(0, 0, 0);
            }
            limitMut(max: number): Vec3 {
                const mag = this.magnitude();
                if (mag > max) {
                    this.mulMut(max / mag);
                }
                return this;
            }
            setZero(): Vec3 {
                this.x = 0;
                this.y = 0;
                this.z = 0;
                return this;
            }
            magnitude(): number {
                return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z);
            }
            distance(other: Vec3): number {
                const dx = this.x - other.x;
                const dy = this.y - other.y;
                const dz = this.z - other.z;
                return Math.sqrt(dx * dx + dy * dy + dz * dz);
            }
            writeToArray(arr: Float32Array, offset: number): void {
                arr[offset] = this.x;
                arr[offset + 1] = this.y;
                arr[offset + 2] = this.z;
            }
            loadFromArray(arr: Float32Array, offset: number): Vec3 {
                this.x = arr[offset];
                this.y = arr[offset + 1];
                this.z = arr[offset + 2];
                return this;
            }
            clone(): Vec3 {
                return new Vec3(this.x, this.y, this.z);
            }
            toModVector(): mod.Vector {
                return mod.CreateVector(this.x, this.y, this.z);
            }
            static fromModVector(v: mod.Vector): Vec3 {
                return new Vec3(
                    mod.XComponentOf(v),
                    mod.YComponentOf(v),
                    mod.ZComponentOf(v)
                );
            }
            static fromArray(arr: number[] | Float32Array, offset: number): Vec3 {
                return new Vec3(arr[offset], arr[offset + 1], arr[offset + 2]);
            }
            directionToEuler(): Vec3 {
                const distanceXZ = Math.sqrt(this.x * this.x + this.z * this.z);
                const pitch = Math.atan2(this.y, distanceXZ);
                const yaw = Math.atan2(this.x, this.z);
                const roll = 0;
                return new Vec3(pitch, yaw, roll);
            }
            xzRadians(): number {
                return Math.atan2(this.x, this.z);
            }
            directionTo(other: Vec3): Vec3 {
                return other.sub(this).normalize();
            }
        }
        export function DirectionToRadians(direction: mod.Vector): number {
            return Math.atan2(mod.XComponentOf(direction), mod.ZComponentOf(direction));
        }
    }
}
export const OngoingGlobal = Driveways.Events.dispatchOngoingGlobal;
export const OnPlayerDeployed = Driveways.Events.dispatchOnPlayerDeployed;
export const OnPlayerDied = Driveways.Events.dispatchOnPlayerDied;
export const OnPlayerJoinGame = Driveways.Events.dispatchOnPlayerJoinGame;
export const OnPlayerLeaveGame = Driveways.Events.dispatchOnPlayerLeaveGame;
export const OngoingPlayer = Driveways.Events.dispatchOngoingPlayer;
export const OnGameModeStarted = Driveways.Events.dispatchOnGameModeStarted;
export const OnPlayerUIButtonEvent = Driveways.Events.dispatchOnPlayerUIButtonEvent;
const buttonWidth = 160;
const buttonHeight = 80;
const buttonsPerRow = 8;
namespace Driveways {
    export class DynamicUI {
        private static buttons: Map<number, Map<string, DynamicUIButton>> = new Map();
        static registerButton(playerId: number, buttonName: string, callback: () => void, message?: mod.Message) {
            if (!this.buttons.has(playerId)) {
                this.buttons.set(playerId, new Map());
            }
            const numButtons = this.buttons.get(playerId)?.size || 0;
            const row = Math.floor(numButtons / buttonsPerRow);
            const column = numButtons % buttonsPerRow;
            this.buttons.get(playerId)?.set(buttonName, new DynamicUIButton(buttonName,
                column * buttonWidth,
                row * buttonHeight, buttonWidth, buttonHeight, callback, message));
        }
        static buttonName(playerId: number, buttonName: string) {
            return "button_" + playerId + "_" + buttonName;
        }
        static updateButtonLabel(playerId: number, buttonName: string, message: mod.Message) {
            const button = this.buttons.get(playerId)?.get(buttonName);
            if (button) {
                button.setLabel(message);
            }
        }
        static destroy(playerId: number) {
            this.buttons.get(playerId)?.forEach(button => {
                button.buttonWidget && mod.DeleteUIWidget(button.buttonWidget);
                button.textWidget && mod.DeleteUIWidget(button.textWidget);
            });
            this.buttons.delete(playerId);
        }
        static {
            Driveways.Events.OnPlayerUIButtonEvent((playerId, widgetName, eventUIButtonEvent) => {
                const button = this.buttons.get(playerId)?.get(widgetName);
                if (button) {
                    button.callback();
                }
            });
        }
    }
    class DynamicUIButton {
        callback: () => void;
        buttonWidget: mod.UIWidget | undefined;
        textWidget: mod.UIWidget | undefined;
        constructor(name: string, x: number, y: number, width: number, height: number, callback: () => void, message?: mod.Message) {
            this.callback = callback;
            Log(`Creating button widget: ${name}`);
            this.buttonWidget = modlib.ParseUI(
                {
                  name: name,
                  type: "Button",
                  position: [x, y],
                  size: [width, height],
                  anchor: mod.UIAnchor.TopLeft,
                  visible: true,
                  padding: 0,
                  bgColor: [1, 1, 1],
                  bgAlpha: 1,
                  bgFill: mod.UIBgFill.Solid,
                  buttonEnabled: true,
                  buttonColorBase: [1, 1, 1],
                  buttonAlphaBase: 1,
                  buttonColorDisabled: [0.1, 0.1, 0.1],
                  buttonAlphaDisabled: 0.5,
                  buttonColorPressed: [0.2, 0.2, 0.2],
                  buttonAlphaPressed: 1,
                  buttonColorHover: [0.4, 0.4, 0.4],
                  buttonAlphaHover: 1,
                  buttonColorFocused: [0.5, 0.5, 0.5],
                  buttonAlphaFocused: 1
                }
              );
              const textName = name + "_text";
              Log(`Creating text widget: ${textName}`);
              this.textWidget = modlib.ParseUI(
                {
                  name: textName,
                  type: "Text",
                  position: [x, y],
                  size: [width, height],
                  anchor: mod.UIAnchor.TopLeft,
                  visible: true,
                  padding: 0,
                  bgColor: [0.2, 0.2, 0.2],
                  bgAlpha: 1,
                  bgFill: mod.UIBgFill.None,
                  textLabel: "",
                  textColor: [0.0314, 0.0431, 0.0431],
                  textAlpha: 1,
                  textSize: 24,
                  textAnchor: mod.UIAnchor.Center
                }
              );
              if (message) {
                this.setLabel(message);
              }
        }
        setLabel(message: mod.Message) {
            this.textWidget && mod.SetUITextLabel(this.textWidget, message);
        }
        delete() {
            this.buttonWidget && mod.DeleteUIWidget(this.buttonWidget);
            this.textWidget && mod.DeleteUIWidget(this.textWidget);
        }
    }
}
/**
 * Mode Implementation
 */
const Log = Driveways.Logging.Log;
const Debug = Driveways.Logging.Debug;
const Info = Driveways.Logging.Info;
const Warn = Driveways.Logging.Warn;
const Error = Driveways.Logging.Error;
const VectorToString = Driveways.Logging.VectorToString;
class SeparationForce extends Driveways.Physics.BaseNeighborForce {
    name = "Separation";
    constructor(weight: number, private distance: number, perceptionRadius: number) {
        super(weight, perceptionRadius);
    }
    protected shouldAccumulate(dist: number): boolean {
        return dist > 0 && dist < this.distance;
    }
    protected accumulate(
        i: number, pos: Driveways.Physics.Vec3, vel: Driveways.Physics.Vec3, neighbor: Driveways.Physics.NeighborData,
        accumulator: Driveways.Physics.Vec3
    ): void {
        const weight = 1.0 / neighbor.distance;
        accumulator.x += (pos.x - neighbor.position.x) * weight;
        accumulator.y += (pos.y - neighbor.position.y) * weight;
        accumulator.z += (pos.z - neighbor.position.z) * weight;
    }
    protected processAccumulated(
        accumulator: Driveways.Physics.Vec3, count: number, pos: Driveways.Physics.Vec3, vel: Driveways.Physics.Vec3, out: Driveways.Physics.Vec3
    ): void {
        out.set(accumulator.x, accumulator.y, accumulator.z);
        out.divMut(count).normalizeMut();
    }
}
class AlignmentForce extends Driveways.Physics.BaseNeighborForce {
    name = "Alignment";
    constructor(weight: number, perceptionRadius: number) {
        super(weight, perceptionRadius);
    }
    protected accumulate(
        i: number, pos: Driveways.Physics.Vec3, vel: Driveways.Physics.Vec3, neighbor: Driveways.Physics.NeighborData,
        accumulator: Driveways.Physics.Vec3
    ): void {
        accumulator.x += neighbor.velocity.x;
        accumulator.y += neighbor.velocity.y;
        accumulator.z += neighbor.velocity.z;
    }
    protected processAccumulated(
        accumulator: Driveways.Physics.Vec3, count: number, pos: Driveways.Physics.Vec3, vel: Driveways.Physics.Vec3, out: Driveways.Physics.Vec3
    ): void {
        out.set(accumulator.x, accumulator.y, accumulator.z);
        out.divMut(count);
        out.subMut(vel).normalizeMut();
    }
}
class CohesionForce extends Driveways.Physics.BaseNeighborForce {
    name = "Cohesion";
    constructor(weight: number, perceptionRadius: number) {
        super(weight, perceptionRadius);
    }
    protected accumulate(
        i: number, pos: Driveways.Physics.Vec3, vel: Driveways.Physics.Vec3, neighbor: Driveways.Physics.NeighborData,
        accumulator: Driveways.Physics.Vec3
    ): void {
        accumulator.x += neighbor.position.x;
        accumulator.y += neighbor.position.y;
        accumulator.z += neighbor.position.z;
    }
    protected processAccumulated(
        accumulator: Driveways.Physics.Vec3, count: number, pos: Driveways.Physics.Vec3, vel: Driveways.Physics.Vec3, out: Driveways.Physics.Vec3
    ): void {
        out.set(accumulator.x, accumulator.y, accumulator.z);
        out.divMut(count);
        out.subMut(pos).normalizeMut();
    }
}
class AttractorForce implements Driveways.Physics.IForce {
    name = "Attractor";
    enabled = true;
    constructor(public position: Driveways.Physics.Vec3, public weight: number, private radius: number) {
        Driveways.Events.OnPlayerDeployed((player) => {
            if (!Driveways.Players.isPlayerBot(player)) {
                const playerPos = mod.GetObjectPosition(player);
                const playerX = mod.XComponentOf(playerPos);
                const playerY = mod.YComponentOf(playerPos);
                const playerZ = mod.ZComponentOf(playerPos);
                this.position.set(playerX, playerY, playerZ);
                Log("Player deployed, setting attractor position to " + playerX + ", " + (playerY + 5) + ", " + playerZ);
            }
        });
        Driveways.Events.OngoingLivePlayer((player) => {
            if (!Driveways.Players.isPlayerBot(player)) {
                const playerPos = mod.GetObjectPosition(player);
                const playerX = mod.XComponentOf(playerPos);
                const playerY = mod.YComponentOf(playerPos);
                const playerZ = mod.ZComponentOf(playerPos);
                this.position.set(playerX, playerY, playerZ);
            }
        });
    }
    calculate(i: number, pos: Driveways.Physics.Vec3, vel: Driveways.Physics.Vec3, neighbors: Driveways.Physics.NeighborData[], out: Driveways.Physics.Vec3): void {
        out.set(
            this.position.x - pos.x,
            (this.position.y - pos.y) * 2,
            this.position.z - pos.z
        );
        const dist = out.magnitude();
        if (dist > this.radius) {
            out.normalizeMut().mulMut(2.0);
        } else {
            out.normalizeMut();
        }
    }
}
const _firingrangeLogoBox = mod.RuntimeSpawn_Common.FiringRange_LogoBox_01; // sweet red test texture box (low render distance)



interface Vec3Transform {
    position: Driveways.Physics.Vec3;
    rotation: Driveways.Physics.Vec3;
}

class WallOfBlocks {
    originPosition: mod.Vector;
    numBlocksPerRow: number;
    numRows: number;
    blockWidth: number;
    blockHeight: number;
    blockDepth: number;
    blockIds: number[];
    blockObjects: mod.Object[];
    positions: Float32Array;
    velocities: Float32Array;
    forces: Float32Array;
    pendingTransforms: Map<number, Vec3Transform> = new Map();
    maxObjectTransformCallsPerTick: number;
    maxPhysUpdatesPerTick: number;
    lastBlockUpdated: number;
    lastTransformTick: Uint32Array;
    transformUpdateInterval: number;
    spatialGrid: Driveways.Physics.SpatialGrid;
    maxSpeed: number = 0.5;
    maxForce: number = 0.01;
    forceSystems: Driveways.Physics.IForce[] = [];
    private lastPhysicsIndex: number = 0;
    private perceptionRadius: number = 6.0;
    private _tempPos: Driveways.Physics.Vec3 = new Driveways.Physics.Vec3(0, 0, 0);
    private _tempVel: Driveways.Physics.Vec3 = new Driveways.Physics.Vec3(0, 0, 0);
    private _tempForce: Driveways.Physics.Vec3 = new Driveways.Physics.Vec3(0, 0, 0);
    constructor(originPosition: mod.Vector, numBlocksPerRow: number, numRows: number, blockWidth: number, blockHeight: number, blockDepth: number) {
        this.originPosition = originPosition;
        this.numBlocksPerRow = numBlocksPerRow;
        this.numRows = numRows;
        this.blockWidth = blockWidth;
        this.blockHeight = blockHeight;
        this.blockDepth = blockDepth;
        this.blockIds = [];
        this.blockObjects = [];
        this.maxObjectTransformCallsPerTick = 20;
        this.maxPhysUpdatesPerTick = 100;
        this.lastBlockUpdated = 0;
        const totalBlocks = numBlocksPerRow * numRows;
        this.perceptionRadius = 20.0;
        this.spatialGrid = new Driveways.Physics.SpatialGrid(this.perceptionRadius * 2);
        this.positions = new Float32Array(totalBlocks * 3);
        this.velocities = new Float32Array(totalBlocks * 3);
        this.forces = new Float32Array(totalBlocks * 3);
        for (let i = 0; i < this.velocities.length; i++) {
            this.velocities[i] = (Math.random() - 0.5) * 0.1;
        }
        this.transformUpdateInterval = 3;
        this.lastTransformTick = new Uint32Array(totalBlocks);
        for (let i = 0; i < this.lastTransformTick.length; i++) {
            this.lastTransformTick[i] = Math.floor(Math.random() * this.transformUpdateInterval);
        }
        this.initializeForceSystems(this.perceptionRadius);
        let destructorMaybe: Driveways.DeregisterFn | null = null;
        destructorMaybe = Driveways.Events.OnPlayerDeployed((player) => {
            if (!Driveways.Players.isPlayerBot(player)) {
                this.create();
                if (destructorMaybe) {
                    destructorMaybe();
                }
            }
        });
        Driveways.Events.OngoingGlobal(() => {
            let timeStart = Driveways.Time.WallTime();
            this.updatePhysicsForAll();
            const physicsTime = Driveways.Time.WallTime() - timeStart;
            timeStart = Driveways.Time.WallTime();
            this.updateTransforms();
            const transformTime = Driveways.Time.WallTime() - timeStart;
            if (Driveways.Metrics) {
                Driveways.Metrics.record('WallOfBlocks_physicsTime', physicsTime);
                Driveways.Metrics.record('WallOfBlocks_transformTime', transformTime);
                // accumulate periodic
                Driveways.Metrics.accumulatePeriodic('WallOfBlocks_physicsTime', physicsTime);
                Driveways.Metrics.accumulatePeriodic('WallOfBlocks_transformTime', transformTime);
                Driveways.Metrics.accumulatePeriodic('WallOfBlocks_totalTime', physicsTime + transformTime);
            }
        });
    }
    private initializeForceSystems(perceptionRadius: number): void {
        this.forceSystems.push(new SeparationForce(4.0, 3.0, perceptionRadius));
        this.forceSystems.push(new AlignmentForce(0, perceptionRadius));
        this.forceSystems.push(new CohesionForce(0, perceptionRadius));
        this.forceSystems.push(new AttractorForce(new Driveways.Physics.Vec3(-204, 220, 135), 0.6, 25.0));
    }
    adjustMaxSpeed(delta: number) {
        const next = this.maxSpeed + delta;
        this.maxSpeed = next > 0 ? next : 0;
        this.logWeights();
    }
    adjustMaxForce(delta: number) {
        const next = this.maxForce + delta;
        this.maxForce = next > 0 ? next : 0;
        this.logWeights();
    }
    adjustForceWeight(name: string, delta: number) {
        const force = this.forceSystems.find((f) => f.name === name);
        if (!force) {
            return;
        }
        const next = force.weight + delta;
        force.weight = next > 0 ? next : 0;
        this.logWeights();
    }
    logWeights() {
        let msg = "Force weights: ";
        for (const force of this.forceSystems) {
            msg += `${force.name}: ${force.weight}, `;
        }
        // max force
        msg += `, Max force: ${this.maxForce}`;
        // max speed
        msg += `, Max speed: ${this.maxSpeed}`;
        Log(msg);
    }
    create() {
        const originX = mod.XComponentOf(this.originPosition);
        const originY = mod.YComponentOf(this.originPosition);
        const originZ = mod.ZComponentOf(this.originPosition);
        let blockIndex = 0;
        for (let i = 0; i < this.numRows; i++) {
            for (let j = 0; j < this.numBlocksPerRow; j++) {
                const idx = blockIndex * 3;
                this.positions[idx] = originX + j * this.blockWidth;
                this.positions[idx + 1] = originY + i * this.blockHeight;
                this.positions[idx + 2] = originZ;
                const blockPosition = mod.CreateVector(
                    this.positions[idx],
                    this.positions[idx + 1],
                    this.positions[idx + 2]
                );
                const block = mod.SpawnObject(
                    // mod.RuntimeSpawn_Common.BarrierStoneBlock_01_A,
                    mod.RuntimeSpawn_Common.FX_Missile_Javelin,
                    blockPosition,
                    mod.CreateVector(0, 0, 0)
                );
                mod.EnableVFX(block as mod.VFX, true);
                this.blockIds.push(mod.GetObjId(block));
                this.blockObjects.push(block);
                blockIndex++;
            }
        }
        this.spatialGrid.clearAndRebuild(this.positions);
    }

    getEngineVFXObject(blockId: number): mod.RuntimeSpawn_Common {
        const velocity = Driveways.Physics.Vec3.fromArray(this.velocities, blockId * 3);
        const velocityMagnitude = velocity.magnitude();
        const maxVelocity = this.maxSpeed;

        // below 20% of max velocity, no engine vfx
        const ratio = velocityMagnitude / maxVelocity;
        if (ratio < 0.6) {
            // return mod.RuntimeSpawn_Common.FX_Grenade_Incendiary_Trail;
            // return mod.RuntimeSpawn_Common.FX_ProjectileTrail_M320_Incendiary;
            return mod.RuntimeSpawn_Common.FX_Granite_Strike_Smoke_Marker_Yellow;
        } else if (ratio < 0.7) {
            // return mod.RuntimeSpawn_Common.FX_Missile_MBTLAW_Trail;
            return mod.RuntimeSpawn_Common.FX_Granite_Strike_Smoke_Marker_Red;
        } else if (ratio < 0.9) {
            // igla
            // return mod.RuntimeSpawn_Common.FX_Missile_Stinger_Trail;
            return mod.RuntimeSpawn_Common.FX_Granite_Strike_Smoke_Marker_Violet
        }
        // return mod.RuntimeSpawn_Common.FX_Missile_Javelin;
        return mod.RuntimeSpawn_Common.FX_Granite_Strike_Smoke_Marker_Green;
    }
    updateTransforms(): void {
        let startBlock = this.lastBlockUpdated;
        let transformsApplied = 0;
        let currentBlock = startBlock;
        do  {
            const currentBlockId = this.blockIds[currentBlock];
            const transform = this.pendingTransforms.get(currentBlockId);
            if (transform) {
                const lastTransformTick = this.lastTransformTick[currentBlock];
                const ticksSinceLastTransform = Driveways.Time.TicksSince(lastTransformTick);
                if (ticksSinceLastTransform >= this.transformUpdateInterval) {
                    this.lastTransformTick[currentBlock] = Driveways.Time.CurrentTick();
                    // mod.SetObjectTransform(this.blockObjects[currentBlock], transform);
                    const blockObject = this.blockObjects[currentBlock];
                    if (blockObject) {
                        // mod.SetObjectTransform(blockObject, transform);
                        // mod.UnspawnObject(blockObject);
                        // const newBlock = mod.SpawnObject(
                        //     this.getEngineVFXObject(currentBlock),
                        //     transform.position.toModVector(),
                        //     transform.rotation.toModVector()
                        // );
                        // mod.EnableVFX(newBlock as mod.VFX, true);
                        // this.blockObjects[currentBlock] = newBlock;
                        // this.blockIds[currentBlock] = mod.GetObjId(newBlock);
                        const newBlock = VFXSpawner.spawnVFX(this.getEngineVFXObject(currentBlock), transform.position, 3000 + Math.random() * 1000, transform.rotation);
                        if (newBlock) {
                            this.blockObjects[currentBlock] = GetVFXObject(newBlock);
                            this.blockIds[currentBlock] = newBlock.vfxObjectId;
                        }

                        // update spatial grid
                        this.spatialGrid.updateBlock(currentBlock, this.positions);


                        // mod.EnableVFX(blockObject as mod.VFX, false);
                        // mod.EnableVFX(blockObject as mod.VFX, true);
                        // mod.MoveVFX(blockObject as mod.VFX, transform.position.toModVector(), transform.rotation.toModVector());
                    }
                    this.pendingTransforms.delete(currentBlockId);
                    transformsApplied++;
                }
            }
            currentBlock++;
            if (currentBlock >= this.blockObjects.length) {
                currentBlock = 0;
            }
        } while (currentBlock !== startBlock && transformsApplied < this.maxObjectTransformCallsPerTick);
        if (Driveways.Metrics) {
            Driveways.Metrics.record('WallOfBlocks_transformsApplied', transformsApplied);
            Driveways.Metrics.record('WallOfBlocks_pendingTransforms', this.pendingTransforms.size);
        }
        this.lastBlockUpdated = currentBlock;
    }
    updatePhysicsForAll() {
        this.forces.fill(0);
        let physUpdates = 0;
        const totalBlocks = this.blockIds.length;
        let currentIndex = this.lastPhysicsIndex;
        const neighborData: Driveways.Physics.NeighborData[] = [];
        const tempNeighborPos = new Driveways.Physics.Vec3(0, 0, 0);
        const tempNeighborVel = new Driveways.Physics.Vec3(0, 0, 0);
        const updatedBlockIndices: number[] = [];
        const maxPerceptionRadiusSq = this.perceptionRadius * this.perceptionRadius;
        for (let count = 0; count < totalBlocks; count++) {
            if (physUpdates >= this.maxPhysUpdatesPerTick) break;
            const i = currentIndex;
            const idx = i * 3;
            this._tempPos.loadFromArray(this.positions, idx);
            this._tempVel.loadFromArray(this.velocities, idx);
            neighborData.length = 0;
            const nearby = this.spatialGrid.getNearbyFromFloats(this._tempPos.x, this._tempPos.y, this._tempPos.z);
            for (const j of nearby) {
                if (j === i) continue;
                const jIdx = j * 3;
                const dx = this._tempPos.x - this.positions[jIdx];
                const dy = this._tempPos.y - this.positions[jIdx + 1];
                const dz = this._tempPos.z - this.positions[jIdx + 2];
                const distSq = dx*dx + dy*dy + dz*dz;
                if (distSq > maxPerceptionRadiusSq) continue;
                const dist = Math.sqrt(distSq);
                tempNeighborPos.loadFromArray(this.positions, jIdx);
                tempNeighborVel.loadFromArray(this.velocities, jIdx);
                neighborData.push({
                    index: j,
                    position: new Driveways.Physics.Vec3(tempNeighborPos.x, tempNeighborPos.y, tempNeighborPos.z),
                    velocity: new Driveways.Physics.Vec3(tempNeighborVel.x, tempNeighborVel.y, tempNeighborVel.z),
                    distance: dist,
                    distanceSq: distSq
                });
            }
            for (const forceSystem of this.forceSystems) {
                if (forceSystem.enabled) {
                    this._tempForce.setZero();
                    forceSystem.calculate(i, this._tempPos, this._tempVel, neighborData, this._tempForce);
                    this.forces[idx] += this._tempForce.x * forceSystem.weight;
                    this.forces[idx + 1] += this._tempForce.y * forceSystem.weight;
                    this.forces[idx + 2] += this._tempForce.z * forceSystem.weight;
                }
            }
            this._tempVel.x += this.forces[idx] * this.maxForce;
            this._tempVel.y += this.forces[idx + 1] * this.maxForce;
            this._tempVel.z += this.forces[idx + 2] * this.maxForce;
            this._tempVel.limitMut(this.maxSpeed);
            this._tempPos.addMut(this._tempVel);
            this._tempPos.writeToArray(this.positions, idx);
            this._tempVel.writeToArray(this.velocities, idx);
            const newX = this.positions[idx];
            const newY = this.positions[idx + 1];
            const newZ = this.positions[idx + 2];
            const oldKey = this.spatialGrid.blockToCell.get(i);
            const newKey = this.spatialGrid.getCellKeyFromFloats(newX, newY, newZ);
            if (oldKey !== newKey) {
                updatedBlockIndices.push(i);
            }
            const velocityEuler = this._tempVel.directionToEuler();
            // const transform = mod.CreateTransform(
            //     this._tempPos.toModVector(),
            //     mod.CreateVector(velocityEuler.x, velocityEuler.y, velocityEuler.z)
            // );
            this.pendingTransforms.set(this.blockIds[i], {
                position: this._tempPos.clone(),
                rotation: velocityEuler.clone()
            });
            physUpdates++;
            currentIndex = (currentIndex + 1) % totalBlocks;
        }
        if (updatedBlockIndices.length > 0) {
            this.spatialGrid.updateBlocks(updatedBlockIndices, this.positions);
        }
        this.lastPhysicsIndex = currentIndex;
        if (Driveways.Metrics) {
            Driveways.Metrics.record('WallOfBlocks_physUpdates', physUpdates);
            Driveways.Metrics.record('WallOfBlocks_totalBlocks', totalBlocks);
            Driveways.Metrics.record('WallOfBlocks_currentIndex', currentIndex);
        }
    }
    destroy() {
        this.blockIds.forEach(blockId => {
            if (blockId && blockId !== -1) {
                const block = mod.GetSpatialObject(blockId);
                if (block) {
                    mod.UnspawnObject(block);
                }
            }
        });
        this.blockIds = [];
    }
}
interface SurferUpdater extends Driveways.Updates.Lifecycle<Driveways.Updates.Updater, Driveways.Updates.Destructor> {
    playerId: number;
}
class Surfers {
    static readonly MAX_JUMP_HEIGHT = 1.25;
    surfers: Map<number, Surfer> = new Map();
    updateGroup: Driveways.Updates.UpdateGroup<number, SurferUpdater> = new Driveways.Updates.BatchedRoundRobinUpdater(30);
    private deregisterCallbacks: Driveways.DeregisterFn[] = [];
    constructor() {
        const destroySurfer = (playerId: number) => {
            const surfer = this.surfers.get(playerId);
            if (surfer) {
                surfer.destroy(playerId);
            }
            this.surfers.delete(playerId);
        };
        this.deregisterCallbacks.push(Driveways.Events.OnPlayerDeployed((player) => {
            Log("Player deployed");
            const playerId = mod.GetObjId(player);
            this.surfers.set(mod.GetObjId(player), new Surfer(player));
            this.updateGroup.set(playerId, {
                playerId: playerId,
                updater: () => this.surfers.get(playerId)?.update(player),
                destructor: () => destroySurfer(playerId),
            });
        }));
        this.deregisterCallbacks.push(Driveways.Events.OngoingGlobal(() => {
            this.updateGroup.update();
        }));
        this.deregisterCallbacks.push(Driveways.Events.OnPlayerDied((player) => {
            this.updateGroup.delete(mod.GetObjId(player));
        }));
        this.deregisterCallbacks.push(Driveways.Events.OnPlayerLeaveGame((playerId) => {
            this.updateGroup.delete(playerId);
        }));
        this.deregisterCallbacks.push(Driveways.Events.OnGameModeStarted(() => {
            Log("Setting up Surfers spawners");
            const spawnGroup1 = new Driveways.SpawnGroup([
                { spawnerId: 100, spatialObjectId: 100 },
            ]);
            const spawnGroup2 = new Driveways.SpawnGroup([
                { spawnerId: 101, spatialObjectId: 101 },
            ]);
            this.deregisterCallbacks.push(Driveways.Events.OngoingGlobal(() => {
                spawnGroup1.fillToCapacity(32, 1);
                spawnGroup2.fillToCapacity(32, 2);
            }));
        }));
        mod.SetCameraTypeForAll(mod.Cameras.ThirdPerson);
        mod.SetAIToHumanDamageModifier(0);
    }
}
class Surfer {
    private static SurfboardObject = mod.RuntimeSpawn_Common.BarrierStoneBlock_01_A;
    // 1.2 meters for barrier stone block places directly at player feet level
    private SurfboardOffset = mod.CreateVector(0, -1.2, 0);
    private static SmallYIncrement = mod.CreateVector(0, 0.1, 0);
    private static SmallYDecrement = mod.CreateVector(0, -0.1, 0);
    private static SurfboardMovementInterval = 1;
    private surfboard: mod.Object;
    private uiButtons: Driveways.UIButtons | undefined;
    constructor(player: mod.Player) {
        const soldierPosition = mod.GetSoldierState(player, mod.SoldierStateVector.GetPosition);
        const surfboardPosition = mod.Add(soldierPosition, this.SurfboardOffset);
        this.surfboard = mod.SpawnObject(Surfer.SurfboardObject, surfboardPosition, mod.CreateVector(0, 0, 0));
        if (!Driveways.Players.isPlayerBot(player)) {
            this.uiButtons = new Driveways.UIButtons(mod.GetObjId(player), () => {
                Log("Up button pressed");
                this.SurfboardOffset = mod.Add(this.SurfboardOffset, Surfer.SmallYIncrement);
            }, () => {
                Log("Down button pressed");
                this.SurfboardOffset = mod.Add(this.SurfboardOffset, Surfer.SmallYDecrement);
            });
        }
    }
    update(player: mod.Player): void {
        if (!Driveways.Players.isAlive(player)) {
            return;
        }
        const playerId = mod.GetObjId(player);
        Driveways.RateLimiter.everyNTicks(`surfer_movement_${playerId}`, Surfer.SurfboardMovementInterval, () => {
            const soldierPosition = mod.GetSoldierState(player, mod.SoldierStateVector.GetPosition);
            const soldierLookDirection = mod.GetSoldierState(player, mod.SoldierStateVector.GetFacingDirection);
            const newSoldierLookDirection = mod.Add(soldierLookDirection, mod.Multiply(Surfer.SmallYIncrement, 0.1));
            const newPlayerPosition = mod.Add(soldierPosition, mod.Multiply(soldierLookDirection, 0.2));
            let newSurfboardPosition = mod.Add(newPlayerPosition, this.SurfboardOffset);
            Debug("Surfboard position: " + VectorToString(newSurfboardPosition) + " Surfboard offset: " + VectorToString(this.SurfboardOffset));
            Debug("Soldier look direction: " + VectorToString(newSoldierLookDirection) + " Surfboard position: "
                + VectorToString(newSurfboardPosition) + " Player position: " + VectorToString(newPlayerPosition));
            const radians = Driveways.Physics.DirectionToRadians(newSoldierLookDirection);
            if (Driveways.Players.isPlayerBot(player)) {
                mod.Teleport(player, newPlayerPosition, radians);
            } else {
                newSurfboardPosition = mod.Add(soldierPosition, this.SurfboardOffset);
            }
            mod.SetObjectTransform(this.surfboard, mod.CreateTransform(newSurfboardPosition, mod.CreateVector(0, 0, 0)));
        });
    }
    destroy(playerId: number) {
        Debug("Destroy called for player " + playerId);
        const surfboardId = mod.GetObjId(this.surfboard);
        if (surfboardId && surfboardId !== -1) {
            mod.UnspawnObject(this.surfboard);
        }
        this.uiButtons?.destroy(playerId);
    }
}
// log all first intances of game mode started, player join, player deploy, player die, player leave
Driveways.Events.OnGameModeStarted(() => {
    Log("Game mode started");
});
Driveways.Events.OnPlayerJoinGame((player) => {
    Log("Player joined");
});
Driveways.Events.OnPlayerDeployed((player) => {
    Log("Player deployed");
});
// const surfers = new Surfers();
const blockSwarm = new WallOfBlocks(mod.CreateVector(-204, 220, 135), 4, 4, 1.5, 1.5, 1.5);
// const mapper = new Driveways.Terrain.Mapper(1.0);
// const grid = new Driveways.Terrain.Grid(10, 10, 20, 1000, new Driveways.Physics.Vec3(0, 180, 0), mod.RuntimeSpawn_Common.HighwayOverpass_Foundation_01);

Driveways.Events.OngoingGlobal(() => {
    Driveways.RateLimiter.everyNTicks('metrics', 90, () => {
        Driveways.Metrics.increment("metric_ticks", 1);
        Driveways.Metrics.report();
    });
});




const FOLLOWER_PATH: number[] = [-84.28,66.57,-61.43,
-84.95,66.20,-60.76,
-85.99,66.20,-60.70,
-87.01,66.20,-60.95,
-88.02,66.20,-61.21,
-89.15,66.20,-61.27,
-90.33,66.20,-61.26,
-91.51,66.20,-61.34,
-92.70,66.20,-61.47,
-93.88,66.20,-61.61,
-95.06,66.20,-61.77,
-96.24,66.20,-61.93,
-97.42,66.20,-62.09,
-98.60,66.20,-62.25,
-99.78,66.20,-62.40,
-100.96,66.20,-62.55,
-102.14,66.20,-62.68,
-103.33,66.20,-62.80,
-104.51,66.20,-62.90,
-105.70,66.20,-63.00,
-106.89,66.20,-63.08,
-108.08,66.20,-63.15,
-109.27,66.20,-63.20,
-110.46,66.20,-63.24,
-111.65,66.20,-63.27,
-112.84,66.20,-63.28,
-114.03,66.20,-63.26,
-115.22,66.20,-63.22,
-116.41,66.20,-63.17,
-117.59,66.20,-63.09,
-118.78,66.20,-62.97,
-119.96,66.20,-62.80,
-121.12,66.20,-62.57,
-122.27,66.20,-62.26,
-123.41,66.20,-61.90,
-124.53,66.20,-61.50,
-125.63,66.20,-61.05,
-126.70,66.20,-60.54,
-127.75,66.20,-59.97,
-128.76,66.20,-59.34,
-129.72,66.20,-58.64,
-130.64,66.20,-57.89,
-131.51,66.20,-57.08,
-132.31,66.20,-56.20,
-133.06,66.20,-55.28,
-133.80,66.20,-54.34,
-134.53,66.20,-53.40,
-135.23,66.20,-52.44,
-135.87,66.20,-51.43,
-136.47,66.20,-50.41,
-137.04,66.20,-49.36,
-137.59,66.20,-48.30,
-138.13,66.20,-47.24,
-138.66,66.20,-46.18,
-139.17,66.20,-45.10,
-139.66,66.20,-44.02,
-140.14,66.20,-42.93,
-140.62,66.20,-41.84,
-141.08,66.20,-40.74,
-141.55,66.20,-39.65,
-142.02,66.20,-38.55,
-142.48,66.20,-37.46,
-142.95,66.20,-36.36,
-143.41,66.20,-35.26,
-143.88,66.20,-34.17,
-144.36,66.20,-33.08,
-144.85,66.20,-31.99,
-145.36,66.20,-30.92,
-145.88,66.20,-29.85,
-146.40,66.20,-28.78,
-146.92,66.20,-27.70,
-147.43,66.20,-26.63,
-147.94,66.20,-25.55,
-148.43,66.20,-24.47,
-148.90,66.20,-23.37,
-149.36,66.20,-22.28,
-149.81,66.20,-21.17,
-150.26,66.20,-20.07,
-150.70,66.20,-18.96,
-151.14,66.20,-17.86,
-151.59,66.20,-16.75,
-152.03,66.20,-15.65,
-152.48,66.20,-14.55,
-152.95,66.20,-13.45,
-153.44,66.20,-12.37,
-153.94,66.20,-11.29,
-154.46,66.20,-10.22,
-154.99,66.20,-9.15,
-155.53,66.20,-8.09,
-156.06,66.20,-7.02,
-156.61,66.20,-5.96,
-157.15,66.20,-4.91,
-157.70,66.20,-3.85,
-158.27,66.20,-2.80,
-158.85,66.20,-1.76,
-159.44,66.20,-0.73,
-160.05,66.20,0.29,
-160.68,66.20,1.31,
-161.31,66.20,2.31,
-161.97,66.20,3.30,
-162.69,66.20,4.25,
-163.52,66.20,5.10,
-164.46,66.20,5.82,
-165.49,66.21,6.41,
-166.57,66.20,6.90,
-167.69,66.20,7.29,
-168.84,66.20,7.60,
-170.00,66.20,7.85,
-171.18,66.20,8.04,
-172.36,66.20,8.19,
-173.55,66.20,8.28,
-174.73,66.20,8.34,
-175.92,66.20,8.39,
-177.11,66.20,8.44,
-178.30,66.20,8.49,
-179.49,66.20,8.54,
-180.68,66.20,8.60,
-181.87,66.20,8.65,
-183.06,66.20,8.71,
-184.25,66.20,8.76,
-185.44,66.20,8.82,
-186.63,66.20,8.88,
-187.82,66.20,8.93,
-189.01,66.20,8.99,
-190.20,66.20,9.05,
-191.39,66.20,9.10,
-192.58,66.20,9.16,
-193.76,66.20,9.22,
-194.95,66.20,9.28,
-196.14,66.20,9.33,
-197.33,66.20,9.39,
-198.52,66.20,9.44,
-199.71,66.20,9.50,
-200.90,66.20,9.56,
-202.09,66.20,9.61,
-203.28,66.20,9.67,
-204.47,66.20,9.72,
-205.66,66.20,9.78,
-206.85,66.20,9.83,
-208.04,66.20,9.91,
-209.22,66.20,10.06,
-210.37,66.20,10.33,
-211.51,66.20,10.69,
-212.62,66.20,11.11,
-213.72,66.20,11.56,
-214.80,66.20,12.06,
-215.87,66.20,12.58,
-216.93,66.20,13.13,
-217.98,66.20,13.68,
-219.00,66.31,14.29,
-220.01,66.38,14.91,
-221.01,66.37,15.55,
-222.01,66.38,16.20,
-222.99,66.39,16.88,
-223.95,66.39,17.59,
-224.85,66.38,18.36,
-225.69,66.37,19.20,
-226.51,66.37,20.06,
-227.33,66.37,20.93,
-228.15,66.37,21.79,
-228.99,66.37,22.64,
-229.84,66.37,23.47,
-230.70,66.37,24.29,
-231.58,66.37,25.09,
-232.48,66.37,25.88,
-233.39,66.37,26.64,
-234.33,66.37,27.37,
-235.29,66.37,28.07,
-236.28,66.38,28.74,
-237.26,66.41,29.41,
-238.23,66.42,30.11,
-239.14,66.36,30.86,
-239.95,66.38,31.72,
-240.61,66.45,32.70,
-241.12,66.52,33.77,
-241.57,66.59,34.87,
-241.95,66.66,36.00,
-242.30,66.73,37.13,
-242.62,66.78,38.28,
-242.92,66.83,39.43,
-243.18,66.88,40.59,
-243.39,66.92,41.76,
-243.58,66.96,42.93,
-243.76,67.01,44.11,
-243.95,67.05,45.28,
-244.13,67.10,46.46,
-244.31,67.14,47.64,
-244.49,67.18,48.81,
-244.67,67.23,49.99,
-244.85,67.27,51.16,
-245.10,67.32,52.31,
-245.66,67.35,53.34,
-246.29,67.39,54.34,
-246.76,67.43,55.40,
-246.69,67.47,56.51,
-246.30,67.52,57.60,
-246.19,67.56,58.76,
-246.23,67.61,59.94,
-246.29,67.65,61.13,
-246.35,67.70,62.31,
-246.40,67.75,63.50,
-246.43,67.78,64.69,
-246.42,67.83,65.88,
-246.37,67.88,67.07,
-246.32,67.92,68.26,
-246.27,67.97,69.45,
-246.21,68.01,70.64,
-246.16,68.06,71.82,
-246.10,68.10,73.01,
-246.03,68.15,74.20,
-245.95,68.19,75.39,
-245.86,68.24,76.57,
-245.73,68.28,77.76,
-245.57,68.33,78.93,
-245.36,68.37,80.11,
-245.12,68.41,81.27,
-244.85,68.46,82.43,
-244.57,68.50,83.58,
-244.26,68.55,84.73,
-243.92,68.59,85.87,
-243.54,68.63,87.00,
-243.11,68.68,88.11,
-242.60,68.72,89.18,
-241.98,68.75,90.19,
-241.23,68.77,91.12,
-240.42,68.77,91.98,
-239.53,68.77,92.77,
-238.57,68.76,93.47,
-237.54,68.76,94.06,
-236.46,68.76,94.55,
-235.34,68.76,94.95,
-234.20,68.76,95.29,
-233.05,68.76,95.60,
-231.89,68.76,95.89,
-230.73,68.76,96.17,
-229.57,68.76,96.43,
-228.40,68.76,96.65,
-227.23,68.76,96.82,
-226.05,68.76,96.98,
-224.86,68.76,97.13,
-223.68,68.76,97.26,
-222.50,68.76,97.39,
-221.31,68.76,97.51,
-220.13,68.76,97.62,
-218.94,68.76,97.72,
-217.75,68.76,97.80,
-216.56,68.76,97.86,
-215.37,68.76,97.92,
-214.19,68.76,97.97,
-213.00,68.74,98.03,
-211.81,68.73,98.09,
-210.62,68.71,98.15,
-209.43,68.69,98.20,
-208.24,68.66,98.24,
-207.05,68.63,98.26,
-205.86,68.61,98.27,
-204.67,68.59,98.26,
-203.48,68.57,98.24,
-202.29,68.56,98.19,
-201.10,68.55,98.13,
-199.91,68.51,98.04,
-198.73,68.47,97.93,
-197.55,68.44,97.80,
-196.36,68.41,97.66,
-195.18,68.38,97.52,
-194.00,68.34,97.36,
-192.82,68.30,97.19,
-191.65,68.27,97.02,
-190.47,68.23,96.85,
-189.29,68.21,96.68,
-188.11,68.17,96.50,
-186.94,68.14,96.32,
-185.76,68.10,96.13,
-184.59,68.06,95.93,
-183.42,68.03,95.72,
-182.25,68.00,95.48,
-181.09,67.97,95.23,
-179.93,67.93,94.96,
-178.77,67.90,94.68,
-177.62,67.86,94.39,
-176.47,67.83,94.08,
-175.32,67.81,93.76,
-174.18,67.77,93.45,
-173.03,67.73,93.13,
-171.88,67.70,92.81,
-170.73,67.66,92.49,
-169.59,67.65,92.18,
-168.44,67.67,91.86,
-167.29,67.64,91.55,
-166.14,67.54,91.24,
-164.99,67.55,90.95,
-163.84,67.61,90.67,
-162.67,67.57,90.43,
-161.50,67.54,90.21,
-160.33,67.50,90.03,
-159.14,67.47,89.91,
-157.95,67.46,89.89,
-156.77,67.44,89.94,
-155.58,67.41,90.06,
-154.41,67.37,90.23,
-153.23,67.33,90.44,
-152.07,67.29,90.67,
-150.90,67.13,90.92,
-149.74,67.05,91.18,
-148.58,67.02,91.45,
-147.43,67.00,91.72,
-146.27,66.96,91.99,
-145.11,66.92,92.25,
-143.94,66.89,92.50,
-142.77,66.85,92.72,
-141.60,66.82,92.93,
-140.42,66.79,93.11,
-139.25,66.76,93.27,
-138.07,66.72,93.43,
-136.88,66.68,93.56,
-135.70,66.65,93.68,
-134.51,66.62,93.77,
-133.33,66.59,93.85,
-132.14,66.55,93.89,
-130.95,66.51,93.89,
-129.76,66.47,93.87,
-128.57,66.44,93.83,
-127.38,66.41,93.76,
-126.19,66.38,93.65,
-125.01,66.33,93.51,
-123.84,66.28,93.29,
-122.69,66.24,93.01,
-121.55,66.21,92.68,
-120.43,66.20,92.28,
-119.33,66.20,91.81,
-118.25,66.20,91.31,
-117.19,66.20,90.77,
-116.15,66.20,90.19,
-115.13,66.21,89.59,
-114.12,66.25,88.95,
-113.12,66.23,88.30,
-112.14,66.20,87.63,
-111.16,66.20,86.95,
-110.20,66.20,86.25,
-109.26,66.20,85.53,
-108.33,66.20,84.78,
-107.41,66.20,84.02,
-106.51,66.20,83.25,
-105.62,66.20,82.46,
-104.73,66.20,81.66,
-103.85,66.20,80.86,
-102.97,66.20,80.05,
-102.10,66.20,79.24,
-101.24,66.20,78.42,
-100.41,66.20,77.57,
-99.59,66.20,76.70,
-98.81,66.20,75.81,
-98.07,66.20,74.87,
-97.37,66.20,73.91,
-96.69,66.20,72.94,
-96.03,66.20,71.94,
-95.40,66.20,70.94,
-94.78,66.20,69.92,
-94.18,66.20,68.89,
-93.58,66.20,67.86,
-92.98,66.20,66.83,
-92.38,66.20,65.80,
-91.78,66.20,64.77,
-91.18,66.20,63.75,
-90.57,66.20,62.72,
-89.97,66.20,61.70,
-89.36,66.20,60.67,
-88.76,66.20,59.65,
-88.14,66.20,58.63,
-87.53,66.20,57.61,
-86.91,66.20,56.59,
-86.29,66.20,55.57,
-85.68,66.20,54.55,
-85.06,66.20,53.53,
-84.45,66.27,52.52,
-83.83,66.37,51.50,
-83.21,66.36,50.49,
-82.60,66.36,49.47,
-81.98,66.22,48.45,
-81.36,66.20,47.44,
-80.72,66.25,46.43,
-80.09,66.41,45.44,
-79.44,66.42,44.44,
-78.78,66.29,43.46,
-78.09,66.25,42.49,
-77.36,66.21,41.55,
-76.58,66.21,40.66,
-75.71,66.20,39.85,
-74.77,66.35,39.14,
-73.76,66.49,38.53,
-72.71,66.33,38.01,
-71.62,66.48,37.59,
-70.51,66.76,37.30,
-69.36,66.65,37.05,
-68.21,66.83,36.82,
-67.06,67.05,36.59,
-65.90,67.05,36.36,
-64.76,66.83,36.13,
-63.62,66.52,35.91,
-62.46,66.35,35.71,
-61.29,66.24,35.55,
-60.11,66.20,35.41,
-58.93,66.20,35.28,
-57.74,66.20,35.16,
-56.56,66.20,35.04,
-55.37,66.20,34.93,
-54.19,66.20,34.83,
-53.00,66.21,34.74,
-51.81,66.22,34.67,
-50.62,66.23,34.61,
-49.43,66.23,34.56,
-48.24,66.22,34.53,
-47.05,66.23,34.49,
-45.86,66.22,34.46,
-44.67,66.20,34.43,
-43.48,66.20,34.40,
-42.29,66.19,34.37,
-41.10,66.20,34.34,
-39.91,66.20,34.30,
-38.72,66.20,34.27,
-37.53,66.20,34.23,
-36.34,66.20,34.20,
-35.15,66.21,34.16,
-33.96,66.26,34.13,
-32.77,66.34,34.09,
-31.59,66.46,34.06,
-30.41,66.67,34.02,
-29.25,66.94,33.99,
-28.08,67.14,33.95,
-26.90,67.19,33.91,
-25.71,67.19,33.88,
-24.52,67.09,33.84,
-23.35,66.87,33.80,
-22.17,66.70,33.76,
-20.99,66.54,33.72,
-19.81,66.44,33.68,
-18.66,66.33,33.64,
-17.58,66.23,33.63,
-16.43,66.20,33.60,
-15.28,66.20,33.57,
-14.10,66.20,33.54,
-12.91,66.20,33.52,
-11.72,66.20,33.49,
-10.53,66.20,33.44,
-9.35,66.19,33.37,
-8.16,66.14,33.24,
-6.99,66.08,33.07,
-5.83,65.92,32.85,
-4.71,65.61,32.57,
-3.61,65.42,32.22,
-2.52,65.15,31.81,
-1.43,65.16,31.35,
-0.35,65.15,30.84,
0.70,65.15,30.29,
1.75,65.19,29.72,
2.76,65.37,29.12,
3.73,65.53,28.49,
4.46,66.16,28.00,
5.39,66.18,27.34,
6.34,66.23,26.64,
7.27,66.24,25.90,
8.19,66.22,25.15,
9.10,66.22,24.38,
10.00,66.22,23.61,
10.91,66.22,22.83,
11.80,66.22,22.05,
12.69,66.22,21.26,
13.59,66.23,20.47,
14.48,66.22,19.68,
15.36,66.22,18.88,
16.23,66.22,18.08,
17.11,66.24,17.27,
17.97,66.20,16.45,
18.83,66.20,15.63,
19.69,66.20,14.80,
20.54,66.20,13.96,
21.38,66.20,13.12,
22.21,66.19,12.27,
23.04,66.18,11.41,
23.87,66.16,10.56,
24.69,66.10,9.70,
25.52,66.03,8.85,
26.34,65.97,7.99,
27.17,65.92,7.13,
27.99,65.88,6.27,
28.81,65.85,5.41,
29.61,65.80,4.54,
30.42,65.74,3.66,
31.21,65.68,2.77,
32.01,65.63,1.89,
32.80,65.59,1.00,
33.59,65.55,0.11,
34.38,65.52,-0.78,
35.17,65.47,-1.67,
35.96,65.43,-2.55,
36.76,65.38,-3.44,
37.55,65.36,-4.33,
38.33,65.33,-5.22,
39.12,65.23,-6.11,
39.91,65.20,-7.00,
40.69,65.20,-7.90,
41.48,65.12,-8.79,
42.26,65.11,-9.68,
43.05,65.06,-10.57,
43.83,65.01,-11.47,
44.62,64.97,-12.36,
45.40,64.93,-13.26,
46.18,64.90,-14.16,
46.96,64.86,-15.06,
47.73,64.83,-15.96,
48.48,64.79,-16.89,
49.20,64.75,-17.83,
49.88,64.71,-18.81,
50.52,64.68,-19.82,
51.12,64.62,-20.84,
51.69,64.58,-21.88,
52.23,64.55,-22.94,
52.74,64.54,-24.02,
53.22,64.51,-25.11,
53.68,64.47,-26.21,
54.12,64.43,-27.31,
54.56,64.43,-28.42,
54.99,64.44,-29.53,
55.42,64.42,-30.64,
55.85,64.34,-31.75,
56.28,64.29,-32.86,
56.71,64.28,-33.97,
57.14,64.28,-35.08,
57.57,64.28,-36.19,
58.00,64.28,-37.30,
58.43,64.28,-38.41,
58.85,64.29,-39.52,
59.27,64.28,-40.63,
59.68,64.28,-41.75,
60.08,64.28,-42.87,
60.47,64.28,-44.00,
60.85,64.28,-45.13,
61.21,64.28,-46.26,
61.54,64.28,-47.41,
61.85,64.28,-48.56,
62.15,64.28,-49.71,
62.43,64.28,-50.87,
62.69,64.28,-52.03,
62.94,64.28,-53.19,
63.15,64.28,-54.36,
63.33,64.28,-55.54,
63.47,64.28,-56.72,
63.59,64.28,-57.91,
63.68,64.28,-59.09,
63.77,64.28,-60.28,
63.84,64.28,-61.47,
63.88,64.28,-62.66,
63.92,64.28,-63.85,
63.92,64.28,-65.04,
63.86,64.28,-66.23,
63.75,64.28,-67.41,
63.59,64.28,-68.59,
63.38,64.28,-69.76,
63.11,64.28,-70.92,
62.79,64.28,-72.07,
62.43,64.28,-73.20,
61.99,64.28,-74.31,
61.49,64.28,-75.39,
60.93,64.28,-76.44,
60.30,64.28,-77.45,
59.64,64.28,-78.44,
58.97,64.28,-79.42,
58.29,64.28,-80.40,
57.60,64.28,-81.36,
56.87,64.28,-82.31,
56.11,64.28,-83.22,
55.32,64.28,-84.12,
54.50,64.28,-84.98,
53.66,64.28,-85.82,
52.80,64.28,-86.65,
51.91,64.28,-87.43,
50.99,64.29,-88.18,
50.05,64.30,-88.92,
49.10,64.32,-89.64,
48.14,64.33,-90.34,
47.17,64.35,-91.03,
46.18,64.36,-91.70,
45.19,64.36,-92.36,
44.19,64.38,-92.99,
43.17,64.40,-93.61,
42.13,64.41,-94.19,
41.07,64.43,-94.73,
39.99,64.46,-95.23,
38.89,64.52,-95.68,
37.77,64.55,-96.08,
36.63,64.57,-96.45,
35.49,64.57,-96.79,
34.34,64.60,-97.08,
33.17,64.62,-97.32,
32.00,64.64,-97.50,
30.82,64.64,-97.64,
29.63,64.67,-97.77,
28.45,64.70,-97.89,
27.27,64.73,-98.02,
26.08,64.76,-98.14,
24.90,64.77,-98.26,
23.71,64.78,-98.38,
22.53,64.79,-98.50,
21.34,64.82,-98.62,
20.16,64.84,-98.74,
18.98,64.67,-98.83,
17.80,64.46,-98.84,
16.62,64.53,-98.79,
15.44,64.69,-98.70,
14.30,65.11,-98.60,
13.18,65.00,-98.49,
12.01,65.11,-98.42,
10.83,65.09,-98.37,
9.64,65.12,-98.33,
8.45,65.14,-98.30,
7.26,65.17,-98.29,
6.07,65.24,-98.30,
4.88,65.29,-98.31,
3.69,65.32,-98.33,
2.50,65.35,-98.35,
1.31,65.38,-98.36,
0.12,65.41,-98.38,
-1.07,65.43,-98.40,
-2.26,65.43,-98.42,
-3.45,65.46,-98.44,
-4.64,65.50,-98.45,
-5.83,65.53,-98.47,
-7.02,65.54,-98.49,
-8.21,65.55,-98.51,
-9.40,65.56,-98.52,
-10.59,65.57,-98.54,
-11.78,65.58,-98.57,
-12.97,65.60,-98.60,
-14.16,65.62,-98.64,
-15.35,65.65,-98.67,
-16.54,65.69,-98.70,
-17.73,65.74,-98.73,
-18.92,65.79,-98.75,
-20.11,65.83,-98.78,
-21.30,65.86,-98.81,
-22.49,65.90,-98.83,
-23.68,65.96,-98.86,
-24.87,65.99,-98.89,
-26.06,66.01,-98.91,
-27.25,66.02,-98.93,
-28.44,66.05,-98.96,
-29.63,66.07,-98.98,
-30.82,66.05,-99.00,
-32.01,66.02,-99.01,
-33.20,66.00,-99.01,
-34.39,66.02,-98.99,
-35.58,66.04,-98.96,
-36.77,66.08,-98.92,
-37.96,66.13,-98.86,
-39.14,66.18,-98.79,
-40.33,66.19,-98.72,
-41.52,66.22,-98.65,
-42.71,66.26,-98.58,
-43.90,66.28,-98.51,
-45.08,66.27,-98.43,
-46.27,66.25,-98.35,
-47.46,66.24,-98.26,
-48.65,66.23,-98.16,
-49.83,66.21,-98.06,
-51.02,66.21,-97.94,
-52.20,66.23,-97.82,
-53.38,66.23,-97.68,
-54.56,66.24,-97.53,
-55.74,66.25,-97.37,
-56.92,66.26,-97.18,
-58.08,66.26,-96.94,
-59.24,66.25,-96.64,
-60.37,66.24,-96.29,
-61.49,66.23,-95.88,
-62.58,66.23,-95.41,
-63.64,66.21,-94.87,
-64.66,66.25,-94.26,
-65.63,66.37,-93.58,
-66.59,66.36,-92.87,
-67.54,66.37,-92.15,
-68.47,66.36,-91.41,
-69.31,66.35,-90.58,
-70.08,66.20,-89.67,
-70.76,66.20,-88.69,
-71.33,66.20,-87.65,
-71.81,66.20,-86.57,
-72.22,66.20,-85.45,
-72.57,66.20,-84.31,
-72.88,66.20,-83.16,
-73.17,66.20,-82.01,
-73.44,66.20,-80.85,
-73.70,66.20,-79.69,
-73.96,66.20,-78.53,
-74.22,66.20,-77.36,
-74.49,66.20,-76.20,
-74.77,66.20,-75.05,
-75.07,66.20,-73.89,
-75.38,66.20,-72.75,
-75.75,66.20,-71.61,
-76.17,66.20,-70.50,
-76.64,66.20,-69.41,
-77.19,66.20,-68.35,
-77.82,66.20,-67.35,
-78.54,66.20,-66.40,
-79.33,66.20,-65.50,
-80.17,66.20,-64.66,
-81.05,66.20,-63.87,
-81.97,66.20,-63.11,
-82.94,66.20,-62.42];


class PathFollower {
    pathIndex: number = 0;
    lastUpdateTick: number = -1;
    updateTickRate: number = 0;
    callback: (position: Driveways.Physics.Vec3) => void;
    constructor(followingReceiver: (position: Driveways.Physics.Vec3) => void, updateTickRate: number = 0) {
        this.callback = followingReceiver;
        this.pathIndex = 0;
        this.lastUpdateTick = 0;
        this.updateTickRate = updateTickRate;
    }
    update(): void {
        if (Driveways.Time.CurrentTick() < this.lastUpdateTick + this.updateTickRate) {
            return;
        }
        this.lastUpdateTick = Driveways.Time.CurrentTick();
        const newPosition = Driveways.Physics.Vec3.fromArray(FOLLOWER_PATH, this.pathIndex);
        this.pathIndex = this.nextIndex();
        this.callback(newPosition);
    }
    nextPosition(): Driveways.Physics.Vec3 {
        return Driveways.Physics.Vec3.fromArray(FOLLOWER_PATH, this.nextIndex());
    }
    nextIndex(): number {
        const nextIndex = this.pathIndex + 3;
        if (nextIndex >= FOLLOWER_PATH.length) {
            return 0;
        }
        return nextIndex;
    }
}

let redwallRotation = new Driveways.Physics.Vec3(0, Math.PI / 2, 0);
// let redwallPosition = new Driveways.Physics.Vec3(-380, 0, 100);
let redwallPosition = new Driveways.Physics.Vec3(0, -100, 700);
let redwallScale = new Driveways.Physics.Vec3(1, 8000, 4000);

let redWall: mod.SpatialObject | null = null;
function makeRedWall() {
    if (redWall) {
        mod.UnspawnObject(redWall);
    }
    redWall = mod.SpawnObject(mod.RuntimeSpawn_Common.FiringRange_LogoBox_01, redwallPosition.toModVector(), redwallRotation.toModVector(), redwallScale.toModVector());
    Log("Red wall spawned at " + VectorToString(redwallPosition.toModVector()) + " with scale " + VectorToString(redwallScale.toModVector()) + " and rotation " + VectorToString(redwallRotation.toModVector()));
}

Driveways.Events.OnGameModeStarted(() => {
    makeRedWall();
});

const FollowTickRate = 3;

const followers: PathFollower[] = [];
let gameStarted = false;


let numFollowers = 1;
let lastFollowerSpawned = -1;
Driveways.Events.OngoingGlobal(() => {
    if (!gameStarted) {
        return;
    }
    if (followers.length < numFollowers && Driveways.Time.CurrentTick() > lastFollowerSpawned + 30) {
        followers.push(new PathFollower((position: Driveways.Physics.Vec3) => {
            const newPosition = new Driveways.Physics.Vec3(position.x, position.y + -1, position.z);
            // VFX.makeABoom(newPosition);
            Debug("VFX spawned at " + newPosition.x + ", " + newPosition.y + ", " + newPosition.z);
        }, FollowTickRate * Math.random() + 3));
        Log("Follower spawned at " + lastFollowerSpawned);
        lastFollowerSpawned = Driveways.Time.CurrentTick();
    }
    for (const follower of followers) {
        follower.update();
    }
});
// each player every 30 ticks if they are more than 5m from the target position, move them towards the target position
// ongoingplayer dummy

let grenadeInterval = 10;
let uiOpen = false;
Driveways.Events.OnPlayerDeployed((player) => {
    gameStarted = true;
    // const playerId = mod.GetObjId(player);
    uiOpen = false;
    // PlayerUIButtons(player);
  });

function PlayerUIButtons(player: mod.Player) {
    const playerId = mod.GetObjId(player);
    viewingPlatform?.registerButtons(playerId);
    VFXSpawner.registerButtons(player);
    Driveways.DynamicUI.registerButton(playerId, "close_menu", () => {
        if (uiOpen) {
          mod.EnableUIInputMode(false, player);
          uiOpen = false;
          Driveways.DynamicUI.destroy(playerId);
        }
      }, mod.Message(-1));
      // make red wall button
      Driveways.DynamicUI.registerButton(playerId, "make_red_wall", () => {
        makeRedWall();
      }, mod.Message(2000));
      // position and scale
      const positionMask = 2100;
      const scaleMask = 2300;
      const rotationMask = 2200;
      const xMask = 1;
      const yMask = 2;
      const zMask = 3;
      Driveways.DynamicUI.registerButton(playerId, "red_wall_position_x_inc", () => {
        redwallPosition.x += 100;
        makeRedWall();
      }, mod.Message(positionMask + xMask));
      Driveways.DynamicUI.registerButton(playerId, "red_wall_position_x_dec", () => {
        redwallPosition.x -= 100;
        makeRedWall();
      }, mod.Message((positionMask + xMask) * -1));
      Driveways.DynamicUI.registerButton(playerId, "red_wall_position_y_inc", () => {
        redwallPosition.y += 100;
        makeRedWall();
      }, mod.Message(positionMask + yMask));
      Driveways.DynamicUI.registerButton(playerId, "red_wall_position_y_dec", () => {
        redwallPosition.y -= 100;
        makeRedWall();
      }, mod.Message((positionMask + yMask) * -1));
      Driveways.DynamicUI.registerButton(playerId, "red_wall_position_z_inc", () => {
        redwallPosition.z += 100;
        makeRedWall();
      }, mod.Message(positionMask + zMask));
      Driveways.DynamicUI.registerButton(playerId, "red_wall_position_z_dec", () => {
        redwallPosition.z -= 100;
        makeRedWall();
      }, mod.Message((positionMask + zMask) * -1));
      Driveways.DynamicUI.registerButton(playerId, "red_wall_scale_y_inc", () => {
        redwallScale.y += 100;
        makeRedWall();
      }, mod.Message(scaleMask + yMask));
      Driveways.DynamicUI.registerButton(playerId, "red_wall_scale_y_dec", () => {
        redwallScale.y -= 100;
        makeRedWall();
      }, mod.Message((scaleMask + yMask) * -1));
      Driveways.DynamicUI.registerButton(playerId, "red_wall_scale_z_inc", () => {
        redwallScale.z += 100;
        makeRedWall();
      }, mod.Message(scaleMask + zMask));
      Driveways.DynamicUI.registerButton(playerId, "red_wall_scale_z_dec", () => {
        redwallScale.z -= 100;
        makeRedWall();
      }, mod.Message((scaleMask + zMask) * -1));
      // redwall rotation xyz
      Driveways.DynamicUI.registerButton(playerId, "red_wall_rotation_x_inc", () => {
        redwallRotation.x += 0.1;
        makeRedWall();
      }, mod.Message(rotationMask + xMask));
      Driveways.DynamicUI.registerButton(playerId, "red_wall_rotation_x_dec", () => {
        redwallRotation.x -= 0.1;
        makeRedWall();
      }, mod.Message((rotationMask + xMask) * -1));
      Driveways.DynamicUI.registerButton(playerId, "red_wall_rotation_y_inc", () => {
        redwallRotation.y += 0.1;
        makeRedWall();
      }, mod.Message(rotationMask + yMask));
      Driveways.DynamicUI.registerButton(playerId, "red_wall_rotation_y_dec", () => {
        redwallRotation.y -= 0.1;
        makeRedWall();
      }, mod.Message((rotationMask + yMask) * -1));
      Driveways.DynamicUI.registerButton(playerId, "red_wall_rotation_z_inc", () => {
        redwallRotation.z += 0.1;
        makeRedWall();
      }, mod.Message(rotationMask + zMask));
      Driveways.DynamicUI.registerButton(playerId, "red_wall_rotation_z_dec", () => {
        redwallRotation.z -= 0.1;
        makeRedWall();
      }, mod.Message((rotationMask + zMask) * -1));
      const blockSwarmMask = 4000;
      const speedMessage = blockSwarmMask + 1;
      const forceMessage = blockSwarmMask + 2;
      const separationMessage = blockSwarmMask + 3;
      const alignmentMessage = blockSwarmMask + 4;
      const cohesionMessage = blockSwarmMask + 5;
      const attractorMessage = blockSwarmMask + 6;
      Driveways.DynamicUI.registerButton(playerId, "block_swarm_speed_inc", () => {
        blockSwarm.adjustMaxSpeed(0.1);
      }, mod.Message(speedMessage));
      Driveways.DynamicUI.registerButton(playerId, "block_swarm_speed_dec", () => {
        blockSwarm.adjustMaxSpeed(-0.1);
      }, mod.Message(-speedMessage));
      Driveways.DynamicUI.registerButton(playerId, "block_swarm_force_inc", () => {
        blockSwarm.adjustMaxForce(0.01);
      }, mod.Message(forceMessage));
      Driveways.DynamicUI.registerButton(playerId, "block_swarm_force_dec", () => {
        blockSwarm.adjustMaxForce(-0.01);
      }, mod.Message(-forceMessage));
      Driveways.DynamicUI.registerButton(playerId, "block_swarm_separation_inc", () => {
        blockSwarm.adjustForceWeight("Separation", 0.1);
      }, mod.Message(separationMessage));
      Driveways.DynamicUI.registerButton(playerId, "block_swarm_separation_dec", () => {
        blockSwarm.adjustForceWeight("Separation", -0.1);
      }, mod.Message(-separationMessage));
      Driveways.DynamicUI.registerButton(playerId, "block_swarm_alignment_inc", () => {
        blockSwarm.adjustForceWeight("Alignment", 0.1);
      }, mod.Message(alignmentMessage));
      Driveways.DynamicUI.registerButton(playerId, "block_swarm_alignment_dec", () => {
        blockSwarm.adjustForceWeight("Alignment", -0.1);
      }, mod.Message(-alignmentMessage));
      Driveways.DynamicUI.registerButton(playerId, "block_swarm_cohesion_inc", () => {
        blockSwarm.adjustForceWeight("Cohesion", 0.1);
      }, mod.Message(cohesionMessage));
      Driveways.DynamicUI.registerButton(playerId, "block_swarm_cohesion_dec", () => {
        blockSwarm.adjustForceWeight("Cohesion", -0.1);
      }, mod.Message(-cohesionMessage));
      Driveways.DynamicUI.registerButton(playerId, "block_swarm_attractor_inc", () => {
        blockSwarm.adjustForceWeight("Attractor", 0.1);
      }, mod.Message(attractorMessage));
      Driveways.DynamicUI.registerButton(playerId, "block_swarm_attractor_dec", () => {
        blockSwarm.adjustForceWeight("Attractor", -0.1);
      }, mod.Message(-attractorMessage));

      Driveways.DynamicUI.registerButton(mod.GetObjId(player), "start_vfx_demo", () => {
        vfxDemo = new VFXDemo(new Driveways.Physics.Vec3(-200, 385, 353), 300);
        vfxDemo.registerButtons(player);
        if (viewingPlatform) {
            vfxDemo.moveTo(viewingPlatform.position);
            viewingPlatform.reposition();
        }
        //     viewingPlatform = new ViewingPlatform(new Driveways.Physics.Vec3(-200, 385, 353));
    }, mod.Message(9000));
    vfxDemo?.registerButtons(player);
}

let initialPlayerPosition: mod.Vector | null = null;
let vfxObject: mod.VFX | null = null;
let vfxObject2: mod.VFX | null = null;
let vfxObjectPosition: mod.Vector | null = null;
let markerObject: mod.SpatialObject | null = null;
let flipFlop = false; /// <--- wow i am dumb
Driveways.Events.OngoingPlayer((player: mod.Player) => {
    if (!Driveways.Players.isAlive(player)) {
        return;
    }
    Driveways.RateLimiter.everyNTicks('log_player_position', 30, () => {
        const playerPosition = mod.GetSoldierState(player, mod.SoldierStateVector.GetPosition);
        Log("Player position: " + VectorToString(playerPosition));
    });


    // if (initialPlayerPosition === null) {
    //     initialPlayerPosition = mod.GetSoldierState(player, mod.SoldierStateVector.GetPosition);
    //     vfxObject = mod.SpawnObject(mod.RuntimeSpawn_Common.FX_Grenade_Fragmentation_Detonation, initialPlayerPosition, mod.CreateVector(0, 0, 0), mod.CreateVector(1, 1, 1));
    //     vfxObject2 = mod.SpawnObject(mod.RuntimeSpawn_Common.FX_Grenade_Fragmentation_Detonation, initialPlayerPosition, mod.CreateVector(0, 0, 0), mod.CreateVector(1, 1, 1));
    //     markerObject = mod.SpawnObject(mod.RuntimeSpawn_Common.BarrierStoneBlock_01_A, initialPlayerPosition, mod.CreateVector(0, 0, 0), mod.CreateVector(1, 1, 1));
    //     if (vfxObject) {
    //         mod.EnableVFX(vfxObject, false);
    //     }
    //     if (vfxObject) {
    //         vfxObjectPosition = initialPlayerPosition;
    //     }
    // }
    // if jumping and not uiopen then open it
    if (mod.GetSoldierState(player, mod.SoldierStateBool.IsJumping) && !uiOpen) {
        PlayerUIButtons(player);
        mod.EnableUIInputMode(true, player);
        uiOpen = true;
    }
    // Driveways.RateLimiter.everyNTicks('player_movement', FollowTickRate, () => {
    //     const playerPosition = mod.GetSoldierState(player, mod.SoldierStateVector.GetPosition);
    //     const position = followers[0].nextPosition().toModVector();
    //     const distance = mod.DistanceBetween(playerPosition, position);
    //     const currentPosition = Driveways.Physics.Vec3.fromModVector(position);
    //     const nextPosition = followers[0].nextPosition();
    //     const raisedNextPosition = new Driveways.Physics.Vec3(nextPosition.x, nextPosition.y + 10, nextPosition.z);
    //     const direction = currentPosition.directionTo(raisedNextPosition);
    //     const yaw = direction.xzRadians();
    //     if (distance > 5) {
    //         // mod.Teleport(player, playerTargetPosition, yaw);
    //     }
    // });
    // emite metrics for player state
    // const states = [
    //     //IsInAir  IsJumping IsOnGround IsParachuting
    //     mod.SoldierStateBool.IsInAir,
    //     mod.SoldierStateBool.IsJumping,
    //     mod.SoldierStateBool.IsOnGround,
    //     mod.SoldierStateBool.IsParachuting,
    // ];
    // const stateNameMap: Map<mod.SoldierStateBool, string> = new Map([
    //     [mod.SoldierStateBool.IsInAir, 'IsInAir'],
    //     [mod.SoldierStateBool.IsJumping, 'IsJumping'],
    //     [mod.SoldierStateBool.IsOnGround, 'IsOnGround'],
    //     [mod.SoldierStateBool.IsParachuting, 'IsParachuting'],
    // ]);
    // for (const state of states) {
    //     const isState = mod.GetSoldierState(player, state);
    //     const stateName = stateNameMap.get(state) || 'Unknown';
    //     Driveways.Metrics.accumulatePeriodic(`player_state_${stateName}`, isState ? 1 : 0);
    // }

    // Driveways.RateLimiter.everyNTicks('player_grenades', grenadeInterval, () => {
    //     if (vfxObject === null || vfxObject2 === null || markerObject === null || vfxObjectPosition === null) {
    //         return;
    //     }
    //     const playerPosition = mod.GetSoldierState(player, mod.SoldierStateVector.GetPosition);
    //     const targetPosition = Driveways.Physics.Vec3.fromModVector(playerPosition);
    //     const target2Position = Driveways.Physics.Vec3.fromModVector(playerPosition);
    //     targetPosition.y += 20;
    //     target2Position.y += 20;
    //     target2Position.x += 10;

    //     if (flipFlop) {
    //         // const vfxPosition = vfxObjectPosition;
    //         // const vfxPositionVec3 = Driveways.Physics.Vec3.fromModVector(vfxPosition);
    //         // Log('VFX Position: ' + vfxPositionVec3.x + ', ' + vfxPositionVec3.y + ', ' + vfxPositionVec3.z);
    //         // const positionDelta = targetPosition.sub(vfxPositionVec3);
    //         // vfxObjectPosition = mod.Add(vfxPosition, positionDelta.toModVector());
    //         // Log('Position Delta: ' + positionDelta.x + ', ' + positionDelta.y + ', ' + positionDelta.z);
    //         // mod.MoveObject(vfxObject, positionDelta.toModVector());
    //         // const markerPosition = mod.GetObjectPosition(markerObject);
    //         // const markerPositionVec3 = Driveways.Physics.Vec3.fromModVector(markerPosition);
    //         // Log('Marker Position: ' + markerPositionVec3.x + ', ' + markerPositionVec3.y + ', ' + markerPositionVec3.z);
    //         // const markerPositionDelta = targetPosition.sub(markerPositionVec3);
    //         // Log('Marker Position Delta: ' + markerPositionDelta.x + ', ' + markerPositionDelta.y + ', ' + markerPositionDelta.z);
    //         mod.MoveVFX(vfxObject, targetPosition.toModVector(), mod.CreateVector(0, 0, 0));
    //         mod.MoveVFX(vfxObject2, target2Position.toModVector(), mod.CreateVector(0, 0, 0));
    //         mod.SetObjectTransform(markerObject, mod.CreateTransform(targetPosition.toModVector(), mod.CreateVector(0, 0, 0)));
    //         // const positionDelta = 
    //         mod.EnableVFX(vfxObject, true);
    //         mod.EnableVFX(vfxObject2, true);
    //         mod.EnableVFX(vfxObject, false);
    //         mod.EnableVFX(vfxObject2, false);
    //         Debug("Enabling VFX");
    //     } else {
    //         Debug('Disabling VFX');
    //         mod.EnableVFX(vfxObject, false);
    //         mod.EnableVFX(vfxObject2, false);
    //     }
    //     flipFlop = !flipFlop;
    //     // VFXSpawner.spawnVFX(mod.RuntimeSpawn_Common.FX_Grenade_Fragmentation_Detonation, position, 10000);
    //     // VFX.makeABoom(targetPosition);
    //     // mod.EnableVFX(vfxObject, true);
    // });
});
const playerCameraTypes = new Map<number, number>();
Driveways.Events.OnPlayerDeployed((player: mod.Player) => {
    playerCameraTypes.set(mod.GetObjId(player), 3);
    mod.SetCameraTypeForPlayer(player, mod.Cameras.ThirdPerson);
    // button to toggle camera type
    Driveways.DynamicUI.registerButton(mod.GetObjId(player), "toggle_camera_type", () => {
        const cameraType = playerCameraTypes.get(mod.GetObjId(player));
        if (cameraType) {
            playerCameraTypes.set(mod.GetObjId(player), cameraType === 3 ? 1 : 3);
            mod.SetCameraTypeForPlayer(player, cameraType === 3 ? mod.Cameras.FirstPerson : mod.Cameras.ThirdPerson);
        }
    }, mod.Message(8000));
});



interface SpawnedVFX {
    type: mod.RuntimeSpawn_Common;
    // vfx: mod.VFX;
    vfxObjectId: number;
    position: Driveways.Physics.Vec3;
    expiresAt: Date;
    disablesAt: Date;
}
function GetVFXObject(spawned: SpawnedVFX): mod.VFX {
    return mod.GetVFX(spawned.vfxObjectId);
}

function IsValidVFXObject(vfxObject: mod.VFX): boolean {
    if (vfxObject === undefined || vfxObject === null) {
        Error("VFX object is undefined or null");
        return false;
    }
    const objId = mod.GetObjId(vfxObject);
    if (objId <= 0) {
        Error("VFX object is invalid: " + objId);
        return false;
    }
    return true;
}

let vfxRotation = new Driveways.Physics.Vec3(0, 0, 0);
let vfxRotationDisplay: CustomDisplayText | undefined;
function UpdateVFXRotationDisplay() {
    const text = "Rot " + VectorToString(vfxRotation.toModVector());
    if (vfxRotationDisplay) {
        vfxRotationDisplay.destroy();
    }
    vfxRotationDisplay = new CustomDisplayText(text, [0, 520]);
}
let store_free_vfx = false;
class VFXSpawner {
    static spawnedVFX: SpawnedVFX[] = [];
    static VFX_LIMIT = 1000;
    static freeList = new Map<mod.RuntimeSpawn_Common, SpawnedVFX[]>();
    static spawnVFX(vfx: mod.RuntimeSpawn_Common, position: Driveways.Physics.Vec3, expiresAfter: number, rotation?: Driveways.Physics.Vec3): SpawnedVFX | null {
        let _rotation = vfxRotation.clone();
        if (rotation) {
            _rotation.addMut(rotation);
        }
        // if item in freeList, use it
        const free = this.freeList.get(vfx);
        if (free && free.length > 0) {
            const freeVfx = free.shift();
            if (free.length === 0) {
                this.freeList.delete(vfx);
            }

            if (freeVfx && IsValidVFXObject(GetVFXObject(freeVfx))) {
                const vfxObject = GetVFXObject(freeVfx);
                if (!IsValidVFXObject(vfxObject)) {
                    Driveways.Metrics.increment('vfx_reused_error');
                    Error("VFX object is undefined or null");
                } else {
                    mod.EnableVFX(vfxObject, true);
                    mod.MoveVFX(vfxObject, position.toModVector(), _rotation.toModVector());
                    this.spawnedVFX.push(freeVfx);
                    freeVfx.position = position;
                    freeVfx.expiresAt = new Date(Date.now() + expiresAfter);
                    Driveways.Metrics.increment('vfx_reused');
                    return freeVfx;
                }
            }
        }
        // if at vfx limit, try to unspawn an item from the freeList
        if (this.spawnedVFX.length + this.numFree() >= this.VFX_LIMIT) {
            const vfxKeys = Array.from(this.freeList.keys());
            for (const vfxKey of vfxKeys) {
                const free = this.freeList.get(vfxKey);
                if (free && free.length > 0) {
                    const freeVfx = free.shift();
                    if (freeVfx) {
                        const vfxObject = GetVFXObject(freeVfx);
                        if (!IsValidVFXObject(vfxObject)) {
                            Driveways.Metrics.increment('vfx_unspawned_freelist_error');
                            Error("VFX object is undefined or null");
                            return null;
                        }
                        mod.UnspawnObject(vfxObject);
                        Driveways.Metrics.increment('vfx_unspawned_freelist');
                        break;
                    }
                    if (free.length === 0) {
                        this.freeList.delete(vfxKey);
                    }
                }
            }
        }
        // if no item in freeList, return null
        // otherwise spawn it and return the spawned item
        if (this.spawnedVFX.length + this.numFree() >= this.VFX_LIMIT) {
            Driveways.Metrics.increment('vfx_limit_reached');
            return null;
        }
        const vfxObject = mod.SpawnObject(vfx, position.toModVector(), _rotation.toModVector(), mod.CreateVector(1, 1, 1));
        
        if (!IsValidVFXObject(vfxObject)) {
            Driveways.Metrics.increment('vfx_spawn_error');
            Error("VFX object is undefined or null");
            return null;
        }
        mod.EnableVFX(vfxObject, true);
        if (Driveways.Metrics) {
            Driveways.Metrics.increment('vfx_spawned');
        }
        const spawned = {
            type: vfx,
            vfxObjectId: mod.GetObjId(vfxObject),
            position: position,
            expiresAt: new Date(Date.now() + expiresAfter + 5000),
            disablesAt: new Date(Date.now() + expiresAfter),
        };
        // Log(`Spawning VFX: ${vfx} at ${position.x}, ${position.y}, ${position.z}`);
        this.spawnedVFX.push(spawned);
        return spawned;
    }
    static logVfxRotation() {
        Log("VFX rotation: " + VectorToString(vfxRotation.toModVector()));
        UpdateVFXRotationDisplay();
    }
    static registerButtons(player: mod.Player) {
        // rotation x,y,z +- by Pi/16
        const rotDelta = Math.PI / 2;
        const vfxSpawnerRotationPrefix = 5000;
        Driveways.DynamicUI.registerButton(mod.GetObjId(player), "vfx_spawner_rotation_x", () => {
            vfxRotation.x += rotDelta;
            this.logVfxRotation();
        }, mod.Message(vfxSpawnerRotationPrefix + 0));
        Driveways.DynamicUI.registerButton(mod.GetObjId(player), "vfx_spawner_rotation_y", () => {
            vfxRotation.y += rotDelta;
            this.logVfxRotation();
        }, mod.Message(vfxSpawnerRotationPrefix + 1));
        Driveways.DynamicUI.registerButton(mod.GetObjId(player), "vfx_spawner_rotation_z", () => {
            vfxRotation.z += rotDelta;
            this.logVfxRotation();
        }, mod.Message(vfxSpawnerRotationPrefix + 2));
        Driveways.DynamicUI.registerButton(mod.GetObjId(player), "vfx_spawner_rotation_x_minus", () => {
            vfxRotation.x -= rotDelta;
            this.logVfxRotation();
        }, mod.Message(vfxSpawnerRotationPrefix * -1));
        Driveways.DynamicUI.registerButton(mod.GetObjId(player), "vfx_spawner_rotation_y_minus", () => {
            vfxRotation.y -= rotDelta;
            this.logVfxRotation();
        }, mod.Message(vfxSpawnerRotationPrefix * -1 - 1));
        Driveways.DynamicUI.registerButton(mod.GetObjId(player), "vfx_spawner_rotation_z_minus", () => {
            vfxRotation.z -= rotDelta;
            this.logVfxRotation();
        }, mod.Message(vfxSpawnerRotationPrefix * -1 - 2));
    }
    static numFree(): number {
        let numFree = 0;
        for (const free of this.freeList.values()) {
            numFree += free.length;
        }
        return numFree;
    }
    static update(): void {
        const now = new Date();
        let freed = 0;
        let unspawnedAtLimit = 0;
        this.spawnedVFX = this.spawnedVFX.filter(spawned => {
            if (spawned.disablesAt < now) {
                // disable vfx
                const vfxObject = GetVFXObject(spawned);
                if (IsValidVFXObject(vfxObject)) {
                    mod.EnableVFX(vfxObject, false);
                }
            }

            if (spawned.expiresAt < now) {
                if (store_free_vfx && this.spawnedVFX.length + this.numFree() < this.VFX_LIMIT) {
                    Log("Freeing VFX: " + GetVFXName(spawned.type));
                    Driveways.Metrics.increment('vfx_freed_internal');
                    const vfxObject = GetVFXObject(spawned);
                    if (!IsValidVFXObject(vfxObject)) {
                        Driveways.Metrics.increment('vfx_freed_error');
                        Error("VFX object is undefined or null");
                        return false;
                    }
                    mod.EnableVFX(vfxObject, false);
                    const free = this.freeList.get(spawned.type);
                    if (free) {
                        free.push(spawned);
                    } else {
                        this.freeList.set(spawned.type, [spawned]);
                    }
                    freed++;
                } else {
                    Log("Unspawning VFX at limit: " + GetVFXName(spawned.type));
                    Driveways.Metrics.increment('vfx_unspawned_at_limit_internal');
                    const vfxObject = GetVFXObject(spawned);
                    if (!vfxObject) {
                        Driveways.Metrics.increment('vfx_unspawned_at_limit_error');
                        Error("VFX object is undefined or null");
                        return false;
                    }

                    mod.UnspawnObject(vfxObject);
                    unspawnedAtLimit++;
                }
                return false;
            }
            return true;
        });
        if (Driveways.Metrics) {
            Driveways.Metrics.record('vfx_living', this.spawnedVFX.length);
            if (freed > 0) {
                Driveways.Metrics.increment('vfx_freed', freed);
            }
            Driveways.Metrics.record('vfx_free', this.numFree());
            if (unspawnedAtLimit > 0) {
                Driveways.Metrics.increment('vfx_unspawned_at_limit', unspawnedAtLimit);
            }
        }
    }
}

class VFX {
    static makeABoom(position: Driveways.Physics.Vec3) {
        VFXSpawner.spawnVFX(mod.RuntimeSpawn_Common.FX_Grenade_Fragmentation_Detonation, position, 1000);
    }
}

Driveways.Events.OngoingGlobal(() => {
    Driveways.RateLimiter.everyNTicks('vfx_spawner', 1, () => {
        VFXSpawner.update();
    });
});


// export function OngoingGlobal() {
//     if (lastNTicks.length < numTicksToTrack) {
//         lastNTicks.push(Driveways.Time.CurrentTick());
//     } else {
//         const oldestTime = lastNTicks.shift();
//         if (oldestTime) {
//             const timeSinceOldest = Driveways.Time.CurrentTick() - oldestTime;
//             const expectedTimeSinceOldest = TickRate * (numTicksToTrack - 1);
//             performanceRatio = timeSinceOldest / expectedTimeSinceOldest;
//         }

//         lastNTicks.push(Driveways.Time.CurrentTick());
//     }
// }
const TickRate = 30; // could calculate from time
const numTicksToTrack = TickRate * 2;
let lastNTicks: number[] = [];
let performanceRatio = 1;
Driveways.Events.OngoingGlobal(() => {
    if (!Driveways.Metrics) {
        return;
    }
    if (lastNTicks.length < numTicksToTrack) {
        lastNTicks.push(Date.now());
    } else {
        const oldestTime = lastNTicks.shift();
        if (oldestTime) {
            const timeSinceOldest = Date.now() - oldestTime;
            Driveways.Metrics.record('time_since_oldest', timeSinceOldest);
            const expectedTimeSinceOldest = (1000 / TickRate) * numTicksToTrack;
            performanceRatio = expectedTimeSinceOldest / timeSinceOldest;
        }
        lastNTicks.push(Date.now());
    }
    Driveways.Metrics.record('performance_ratio', GetPerformanceRatio());
});
// > 1 is good, < 1 is bad
function GetPerformanceRatio(): number {
    return performanceRatio;
}

// class VFXTestGrid {
//     origin: Driveways.Physics.Vec3;
//     numRows: number;
//     numCols: number;
//     spacing: number;
//     markerObject: mod.SpatialObject;
//     vfxOffset: number;
//     constructor(origin: Driveways.Physics.Vec3, numRows: number, numCols: number, spacing: number) {
//         this.origin = origin;
//         this.numRows = numRows;
//         this.numCols = numCols;
//         this.spacing = spacing;
//         this.markerObject = mod.SpawnObject(mod.RuntimeSpawn_Common.BarrierStoneBlock_01_A, origin.toModVector(), mod.CreateVector(0, 0, 0), mod.CreateVector(1, 1, 1));
//         this.vfxOffset = 0;
//     }
//     makeBooms() {
//         mod.SetObjectTransform(this.markerObject, mod.CreateTransform(this.origin.toModVector(), mod.CreateVector(0, 0, 0)));
//         for (let row = 0; row < this.numRows; row++) {
//             for (let col = 0; col < this.numCols; col++) {
//                 const position = new Driveways.Physics.Vec3(this.origin.x + col * this.spacing, this.origin.y + row * this.spacing, this.origin.z);
//                 // VFX.makeABoom(position);
//                 let index = (this.vfxOffset + row * this.numCols + col) % explosionsVFX.length;
//                 VFXSpawner.spawnVFX(explosionsVFX[index], position, 1000);
//             }
//         }
//     }
//     public moveOriginForward(distance: number) {
//         this.origin.z += distance;
//     }
//     public nextVFX() {
//         this.vfxOffset++;
//         this.vfxOffset %= explosionsVFX.length;
//     }
// }

// test max good-ish performance move rate is 5 ticks for 16 vfx objects, 1000ms vfx object lifetime ~100 living, ~150 freed

// class VFXFollower {
//     index: number;
//     lastVFXSpawnTick: number;
//     maxConcurrentVFX: number;
//     constructor(index: number) {
//         this.index = index;
//         this.lastVFXSpawnTick = 0;
//         this.maxConcurrentVFX = 16;
//     }
//     update() {
//         if (Driveways.Time.CurrentTick() > this.lastVFXSpawnTick + 5) {
//             this.lastVFXSpawnTick = Driveways.Time.CurrentTick();
//             for (let i = 0; i < this.maxConcurrentVFX; i++) {
//                 const combinedIndex = this.index + i;
//                 const vfxIndex = combinedIndex % explosionsVFX.length;
//                 const followerIndex = combinedIndex * 3 % FOLLOWER_PATH.length;
//                 const vfx = explosionsVFX[vfxIndex];
//                 if (!vfx) {
//                     Error("VFX not found");
//                     return;
//                 }
//                 VFXSpawner.spawnVFX(explosionsVFX[vfxIndex], Driveways.Physics.Vec3.fromArray(FOLLOWER_PATH, followerIndex), 1000);
//                 Log("VFX spawned at " + Driveways.Physics.Vec3.fromArray(FOLLOWER_PATH, followerIndex).x + ", " + Driveways.Physics.Vec3.fromArray(FOLLOWER_PATH, followerIndex).y + ", " + Driveways.Physics.Vec3.fromArray(FOLLOWER_PATH, followerIndex).z);
//             }
//             this.index += this.maxConcurrentVFX;
//             this.index %= explosionsVFX.length;
//         }
//     }
//     getPosition(index: number) {
//         // follower path position
//         const followerPathIndex = ((this.index + index) * 3) % FOLLOWER_PATH.length;
//         const position = Driveways.Physics.Vec3.fromArray(FOLLOWER_PATH, followerPathIndex);
//         return position;
//     }
// }

// on game start make vfx grid
// let vfxGrid: VFXTestGrid | null = null;
// let vfxFollowers: VFXFollower[] = [];
// Driveways.Events.OnGameModeStarted(() => {
//     // vfxGrid = new VFXTestGrid(new Driveways.Physics.Vec3(-84.28,70,-61.43), 4, 4, 10);
//     // for (let i = 0; i < 1; i++) {
//     //     vfxFollowers.push(new VFXFollower(i));
//     // }
// });
let ticksInDirection = 0;
let direction = 1;
let gridMoveTickRate = 10;
// Driveways.Events.OngoingGlobal(() => {
//     for (const follower of vfxFollowers) {
//         follower.update();
//     }
//     // Driveways.RateLimiter.everyNTicks('vfx_grid_move', gridMoveTickRate, () => {
//     //     if (vfxGrid) {
//     //         vfxGrid.moveOriginForward(10 * direction);
//     //         vfxGrid.makeBooms();
//     //         vfxGrid.nextVFX();
//     //         ticksInDirection++;
//     //         if (ticksInDirection >= 10) {
//     //             direction *= -1;
//     //             ticksInDirection = 0;
//     //         }
//     //     }
//     // });
// });
let vfxDemo: VFXDemo | null = null;
Driveways.Events.OnPlayerDeployed((player: mod.Player) => {
    // Driveways.DynamicUI.registerButton(mod.GetObjId(player), "vfx_grid_more_rows", () => {
    //     if (vfxGrid) {
    //         vfxGrid.numRows++;
    //         Log("vfxGrid.numRows: " + vfxGrid.numRows);
    //     }
    // }, mod.Message(mod.stringkeys.a));
    // Driveways.DynamicUI.registerButton(mod.GetObjId(player), "vfx_grid_less_rows", () => {
    //     if (vfxGrid) {
    //         vfxGrid.numRows--;
    //         Log("vfxGrid.numRows: " + vfxGrid.numRows);
    //     }
    // }, mod.Message(mod.stringkeys.b));
    // // move tickrate
    // // disaply tickrate
    // Driveways.DynamicUI.registerButton(mod.GetObjId(player), "vfx_grid_more_move_tick_rate", () => {
    //     gridMoveTickRate++;
    //     Log("gridMoveTickRate: " + gridMoveTickRate);
    // }, mod.Message(mod.stringkeys.a));
    // Driveways.DynamicUI.registerButton(mod.GetObjId(player), "vfx_grid_less_move_tick_rate", () => {
    //     gridMoveTickRate--;
    //     Log("gridMoveTickRate: " + gridMoveTickRate);
    // }, mod.Message(mod.stringkeys.b));

    // register button to start vfx demo

});

class ViewingPlatform {
    public position: Driveways.Physics.Vec3;
    platformObjId: number;
    platformObject: mod.SpatialObject;
    constructor(position: Driveways.Physics.Vec3) {
        this.position = position;
        this.platformObject = mod.SpawnObject(mod.RuntimeSpawn_Common.BarrierStoneBlock_01_A, position.toModVector(), mod.CreateVector(0, 0, 0));
        this.platformObjId = mod.GetObjId(this.platformObject);
    }
    reposition() {
        mod.SetObjectTransform(this.platformObject, mod.CreateTransform(this.position.toModVector(), mod.CreateVector(0, 0, 0)));
        const players = Driveways.Players.players();
        for (const player of players) {
            const playerFacing = mod.GetSoldierState(player, mod.SoldierStateVector.GetFacingDirection);
            const playerFacingVec3 = Driveways.Physics.Vec3.fromModVector(playerFacing);
            // log facing
            Log("Player facing: " + VectorToString(playerFacingVec3.toModVector()) + " " + playerFacingVec3.xzRadians());
            mod.Teleport(player, this.position.toModVector(), 0);
        }
        if (vfxDemo) {
            vfxDemo.moveTo(this.position);
        }
    }
    registerButtons(playerId: number) {
        const xMask = 1;
        const yMask = 2;
        const zMask = 3;
        const positionMask = 1000;
        Driveways.DynamicUI.registerButton(playerId, "viewing_platform_up", () => {
            this.position.y += 10;
            this.reposition();
            Log("Viewing platform up " + VectorToString(this.position.toModVector()));
        }, mod.Message(positionMask + yMask));
        Driveways.DynamicUI.registerButton(playerId, "viewing_platform_down", () => {
            this.position.y -= 10;
            this.reposition();
            Log("Viewing platform down " + VectorToString(this.position.toModVector()));
        }, mod.Message((positionMask + yMask) * -1));
        Driveways.DynamicUI.registerButton(playerId, "viewing_platform_left", () => {
            this.position.x -= 10;
            this.reposition();
            Log("Viewing platform left " + VectorToString(this.position.toModVector()));
        }, mod.Message(positionMask + xMask));
        Driveways.DynamicUI.registerButton(playerId, "viewing_platform_right", () => {
            this.position.x += 10;
            this.reposition();
        }, mod.Message((positionMask + xMask) * -1));
        Driveways.DynamicUI.registerButton(playerId, "viewing_platform_forward", () => {
            this.position.z += 10;
            this.reposition();
            Log("Viewing platform forward " + VectorToString(this.position.toModVector()));
        }, mod.Message(positionMask + zMask));
        Driveways.DynamicUI.registerButton(playerId, "viewing_platform_backward", () => {
            this.position.z -= 10;
            this.reposition();
        }, mod.Message((positionMask + zMask) * -1));
    }
    moveTo(newPosition: Driveways.Physics.Vec3) {
        this.position = newPosition;
        this.reposition();
    }
    destroy() {
        mod.UnspawnObject(this.platformObject);
    }
}


let viewingPlatform: ViewingPlatform | null = null;

Driveways.Events.OnGameModeStarted(() => {
    viewingPlatform = new ViewingPlatform(new Driveways.Physics.Vec3(-120, 656, 353));
});

Driveways.Events.OnPlayerDeployed((player: mod.Player) => {
    // const playerPosition = mod.GetSoldierState(player, mod.SoldierStateVector.GetPosition);
    // const playerPositionVec3 = Driveways.Physics.Vec3.fromModVector(playerPosition);
    // viewingPlatform?.moveTo(playerPositionVec3);
    // viewingPlatform?.registerButtons(mod.GetObjId(player));
    viewingPlatform?.reposition();
});


// update vfxdemo every tick
Driveways.Events.OngoingGlobal(() => {
    if (vfxDemo) {
        vfxDemo.update();
    }
});


enum VFXDemoStates {
    DelayStart,
    Positioning,
    WaitPositioning,
    Firing,
    Idle,
}
const DemoStateDurations = {
    [VFXDemoStates.DelayStart]: 300,
    [VFXDemoStates.Positioning]: 0,
    [VFXDemoStates.WaitPositioning]: 15,
    [VFXDemoStates.Firing]: 0,
    [VFXDemoStates.Idle]: 300,
    //     [VFXDemoStates.Positioning]: 0,
    // [VFXDemoStates.WaitPositioning]: 5,
    // [VFXDemoStates.Firing]: 0,
    // [VFXDemoStates.Idle]: 10,
}
class VFXDemo {
    spawnLocation: Driveways.Physics.Vec3;
    vfxIndex: number;
    lastFireTick: number;
    fireInterval: number;
    textWidget: mod.UIWidget | undefined;
    customDisplayText: CustomDisplayText | undefined;
    mannequin: mod.SpatialObject | undefined;
    vfxMap: Map<string, mod.RuntimeSpawn_Common>;
    vfxKeys: string[];
    floor: mod.SpatialObject | undefined;
    lastStateTransition: number;
    state: VFXDemoStates;
    constructor(spawnLocation: Driveways.Physics.Vec3, fireInterval: number) {
        this.lastStateTransition = Driveways.Time.CurrentTick();
        this.spawnLocation = spawnLocation;
        this.vfxIndex = 0;



        

        this.lastFireTick = 0;
        this.fireInterval = fireInterval;
        this.vfxMap = GetCommonVFX();
        this.vfxKeys = Array.from(this.vfxMap.keys());
        // find index of key "FX_Impact_SupplyDrop_Brick"
        // this.vfxIndex = this.vfxKeys.findIndex(key => key.indexOf("FX_Impact_SupplyDrop_Brick") !== -1);
        const displayTestName = "vfx_demo_display";
        const existing = mod.FindUIWidgetWithName(displayTestName);
        if (existing) {
            mod.DeleteUIWidget(existing);
        }
        this.state = VFXDemoStates.DelayStart;
        this.customDisplayText = new CustomDisplayText(displayTestName, [-100, 400]);
        // this.mannequin = mod.SpawnObject(mod.RuntimeSpawn_Common.BarrierStoneBlock_01_A, this.spawnLocation.toModVector(), mod.CreateVector(0, 0, 0));
        this.floor = mod.SpawnObject(mod.RuntimeSpawn_Common.FiringRange_Floor_01, this.spawnLocation.toModVector(), mod.CreateVector(0, 0, 0));
    }

    registerButtons(player: mod.Player) {
        // next, previous, fire
        const VFXDemoButtonPrefix = 3000;

        Driveways.DynamicUI.registerButton(mod.GetObjId(player), "vfx_demo_previous", () => {
            this.previous();
            this.transitionTo(VFXDemoStates.Firing);
        }, mod.Message(VFXDemoButtonPrefix + 1));
        Driveways.DynamicUI.registerButton(mod.GetObjId(player), "vfx_demo_next", () => {
            this.next();
            this.transitionTo(VFXDemoStates.Firing);
        }, mod.Message(VFXDemoButtonPrefix + 2));
        Driveways.DynamicUI.registerButton(mod.GetObjId(player), "vfx_demo_fire", () => {
            this.fire();
            this.transitionTo(VFXDemoStates.Firing);
        }, mod.Message(VFXDemoButtonPrefix + 3));
    }
    next() {
        this.vfxIndex++;
        this.vfxIndex %= this.vfxKeys.length;
        this.fire();
    }
    previous() {
        this.vfxIndex--;
        if (this.vfxIndex < 0) {
            this.vfxIndex = this.vfxKeys.length - 1;
        }
        this.fire();
    }
    shouldTransition(): boolean {
        return Driveways.Time.CurrentTick() > this.lastStateTransition + DemoStateDurations[this.state];
    }
    transitionTo(newState: VFXDemoStates) {
        this.state = newState;
        this.lastStateTransition = Driveways.Time.CurrentTick();
        Log("Transitioning to state: " + this.state);
    }
    update() {
        if (!Driveways.Time || !Driveways.Metrics) {
            return;
        }
        switch (this.state) {
            case VFXDemoStates.DelayStart:
                if (this.shouldTransition()) {
                    this.transitionTo(VFXDemoStates.Positioning);
                }
                break;
            case VFXDemoStates.Positioning:
                let vfxIndex = this.vfxIndex + 1;
                vfxIndex %= this.vfxKeys.length;
                this.vfxIndex = vfxIndex;
                if (this.customDisplayText) {
                    this.customDisplayText.destroy();
                }
                this.moveFloor();
                this.transitionTo(VFXDemoStates.WaitPositioning);
                break;
            case VFXDemoStates.WaitPositioning:
                // wait for floor to move
                if (this.shouldTransition()) {
                    this.transitionTo(VFXDemoStates.Firing);
                }
                break;
            case VFXDemoStates.Firing:
                // fire vfx
                this.fire();
                this.updateLabel();
                this.transitionTo(VFXDemoStates.Idle);
                break;
            case VFXDemoStates.Idle:
                // idle
                // wait for vfx to finish
                if (this.shouldTransition()) {
                    this.transitionTo(VFXDemoStates.Positioning);
                }
                break;
        }
        // Driveways.Metrics.record('vfx_demo_start_ticks', 1);
        // if (Driveways.Time.CurrentTick() > this.lastFireTick + this.fireInterval) {
        //     Driveways.Metrics.increment('vfx_demo_fires');
        //     this.fire();
        //     let vfxIndex = this.vfxIndex + 1;
        //     vfxIndex %= this.vfxKeys.length;
        //     this.vfxIndex = vfxIndex;
        // }
        Driveways.Metrics.accumulate('vfx_demo_ticks', 1);
    }
    moveFloor() {
        if (this.floor) {
            const vfxKey = this.vfxKeys[this.vfxIndex];
            const explosion = this.vfxMap.get(vfxKey);
            if (!explosion) {
                Error("VFX not found");
                return;
            }
            const vfxSpawnPosition = this.vfxSpawnPosition(vfxKey, explosion);
            const floorTransform = FloorTransform(vfxKey, vfxSpawnPosition);
            mod.SetObjectTransform(this.floor, floorTransform);
        }
    }

    vfxSpawnPosition(vfxKey: string, vfx: mod.RuntimeSpawn_Common): Driveways.Physics.Vec3 {
        const offset = VFXDemoPositionOffset(vfxKey, vfx);
        return new Driveways.Physics.Vec3(this.spawnLocation.x + offset.x, this.spawnLocation.y + offset.y, this.spawnLocation.z + offset.z);
    }

    updateLabel() {
        const vfxKey = this.vfxKeys[this.vfxIndex];
        if (vfxKey) {
            if (this.customDisplayText) {
                this.customDisplayText.destroy();
            }
            Driveways.Metrics.record('vfx_demo_string_key_length_1', vfxKey.length);
            Log("Explosion string: " + vfxKey);
            // const toPrint = vfxKey + " " + VectorToString(vfxRotation.toModVector());
            this.customDisplayText = new CustomDisplayText(vfxKey, [0, 450]);
        } else {
            Driveways.Metrics.record('vfx_demo_string_key_has', 0);
            Error("Explosion not found");
        }
    }

    fire() {
        Driveways.Metrics.increment('vfx_demo_fires_internal');
        this.lastFireTick = Driveways.Time.CurrentTick();
        // const explosion = explosionsVFX[vfxIndex];
        const vfxKey = this.vfxKeys[this.vfxIndex];
        const explosion = this.vfxMap.get(vfxKey);
        if (!explosion) {
            Error("VFX not found");
            return;
        }
        Driveways.Metrics.record('vfx_demo_string_key_length_0', explosion.toString().length);
        // const explosionString = mod.stringkeys[explosion as keyof typeof mod.stringkeys];

        Driveways.Metrics.accumulate('vfx_demo_spawns_internal', 1);
        const vfxSpawnPosition = this.vfxSpawnPosition(vfxKey, explosion);
        VFXSpawner.spawnVFX(explosion, vfxSpawnPosition, 5000);
        Driveways.Metrics.increment('vfx_demo_spawns');
    }

    moveTo(newPosition: Driveways.Physics.Vec3) {
        this.spawnLocation = new Driveways.Physics.Vec3(newPosition.x, newPosition.y, newPosition.z);
        if (this.mannequin) {
            mod.SetObjectTransform(this.mannequin, mod.CreateTransform(mod.CreateVector(this.spawnLocation.x + 5, this.spawnLocation.y, this.spawnLocation.z), mod.CreateVector(0, 0, 0)));
        }
    }
}
// function FloorTransform(vfxKey: string, origin: Driveways.Physics.Vec3): mod.Transform {
//     // target areas
//     let offset = new Driveways.Physics.Vec3(-10, -7.27, 0);
//     let rotation = new Driveways.Physics.Vec3(Math.PI / -4, 0, 0);
//     if (vfxKey.indexOf("TargetArea") !== -1) {
//         return mod.CreateTransform(mod.CreateVector(origin.x, origin.y, origin.z), mod.CreateVector(Math.PI / -4, 0, 0));
//     }
//     return mod.CreateTransform(mod.CreateVector(origin.x + offset.x, origin.y + offset.y, origin.z + offset.z), rotation.toModVector());
// }

// const floorOffset = new Driveways.Physics.Vec3(-10.24, 10.24, 20.48);
// const floorPosition = mod.CreateVector(vfxSpawnPosition.x + floorOffset.x, vfxSpawnPosition.y + floorOffset.y, vfxSpawnPosition.z + floorOffset.z);
// mod.SetObjectTransform(this.floor, mod.CreateTransform(floorPosition, mod.CreateVector(Math.PI / 4, 0, 0)));


const floorCloseups = [
    "Target_Area",
    "Range_Indicator",
    "FX_Gadget_AT4_Projectile_Trail",
    "FX_BASE_Fire_Oil_Medium",
    "FX_MF_CarlGustaf_MK4_Launch",
    "FX_BASE_Fire_XL",
]
function FloorTransform(vfxKey: string, origin: Driveways.Physics.Vec3): mod.Transform {
    // target areas
    // let offset = new Driveways.Physics.Vec3(-10.24, -7.27, 0);
    let offset = new Driveways.Physics.Vec3(-10.24, -10.24, 10.48);
    let rotation = new Driveways.Physics.Vec3(Math.PI / -2, 0, 0);
    if (floorCloseups.some(closeup => vfxKey.indexOf(closeup) !== -1)) {
        offset = new Driveways.Physics.Vec3(-10.24, -5, -2);
        rotation = new Driveways.Physics.Vec3(Math.PI / -4, 0, 0);
    }
    return mod.CreateTransform(mod.CreateVector(origin.x + offset.x, origin.y + offset.y, origin.z + offset.z), rotation.toModVector());
}


const veryClose = new Driveways.Physics.Vec3(0, 2.2, 3);
const mediumFar = new Driveways.Physics.Vec3(0, 2, 50);
const mediumFarAndDownABit = new Driveways.Physics.Vec3(0, -2, 50);
const mediumAndToTheRight = new Driveways.Physics.Vec3(-15, 2, 25);
const prettyFar = new Driveways.Physics.Vec3(0, -20, 100);
const veryFar = new Driveways.Physics.Vec3(0, -75, 300);
const veryFarAndWayDown = new Driveways.Physics.Vec3(0, -200, 300);
const upABit = new Driveways.Physics.Vec3(0, 4, 20);
const upABitMore = new Driveways.Physics.Vec3(0, 6.5, 20);
const closeAndUpABit = new Driveways.Physics.Vec3(0, 3, 10);
const defaultOffset = new Driveways.Physics.Vec3(0, 2, 20);
const forTheBirds = new Driveways.Physics.Vec3(0, -120, 60);
const totheLeft = new Driveways.Physics.Vec3(5, 2, 20);
const positionMap = {
    "FX_Gadget_SmokeBarrage_AirBurst_Det": new Driveways.Physics.Vec3(-30, 2, 50),
    "FX_AW_Distant_Cluster_Bomb_Line_Outskirts": veryFar,
    "Jetwash": new Driveways.Physics.Vec3(40, 2, 50),
    "FX_ArtilleryStrike_Explosion_01": mediumFarAndDownABit,
    "FX_ArtilleryStrike_Explosion_GS": mediumFarAndDownABit,
    "fx_ambwar_artillarystrike": mediumFar,
    "FX_Autocannon_30mm_AP_Hit_GS": veryClose,
    "FX_Grenade_AntiTank_Trail": veryClose,
    "FX_ProjectileTrail_M320": veryClose,
    "FX_Defib": veryClose,
    "FX_BASE_Fire": veryClose,
    "FX_BASE_Flies_Small": veryClose,
    "FX_Gadget_AirburstLauncher_Predicted_Line": upABitMore,
    "FX_BASE_Smoke_Column_XXL": prettyFar,
    "FX_Carrier_Explosion_Dist": veryFar,
    "FX_Gadget_IGLA_Launch": upABitMore,
    "Repair_Tool": veryClose,
    "EODBot": veryClose,
    "Mine_Detonation": mediumFar,
    "FX_Gadget_PTKM_Submunition_Trail": veryClose,
    "Horizon": veryFar,
    "FX_Bomb_Mk82_AIR_Detonation": mediumFar,
    "FX_Mine_M18_Claymore_Detonation": mediumAndToTheRight,
    "FX_Mine_M18_Claymore_Laser_Tripwire": veryClose,
    "FX_Gadget_EIDOS_Projectile_Launch": mediumAndToTheRight,
    "FX_Gadget_MPAPS_Projectile_Launch": mediumAndToTheRight,
    "_Sabotage_": upABit,
    "Impact_LoadoutCrate": upABitMore,
    "Impact_LootCrate": closeAndUpABit,
    "FX_LoadoutCrate_AirSpawn": mediumFarAndDownABit,
    "FX_Missile_Javelin_Detonation": mediumFar,
    "FX_Missile_MBTLAW_Hit": mediumFar,
    "FX_Gadget_DeployableMortar_Projectile_Trail": veryClose,
    "FX_CAP_AmbWar_Rocket_Strike": veryFar,
    "FX_Decoy_Destruction": mediumAndToTheRight,
    "FX_WireGuidedMissile_SpooledWire": veryClose,
    "FX_Gadget_M320_Reload": veryClose,
    "FX_Rocket_RPG7V2_Dud": veryClose,
    "FX_Gadget_M4_SLAM_Detonation": mediumFarAndDownABit,
    "FX_Granite_Strike_Smoke_Marker": closeAndUpABit,
    "FX_Grenade_SignalSmoke_INV": mediumFarAndDownABit,
    "FX_BASE_Birds_Black_Circulating": new Driveways.Physics.Vec3(0, -25, 40),
    "FX_ShellEjection_DP12_12g_Buckshot": veryClose,
    "FX_Panzerfaust_Projectile_Stabilizers": veryClose,
    "FX_BD_Huge_Horizon_Exp": veryFarAndWayDown,
    "FX_BD_Med_Horizon_Exp": veryFarAndWayDown,
    "FX_ThrowingKnife_Trail": veryClose,
    "FX_SP_Glint_Collectable": veryClose,
    "FX_Missile_MBTLAW_Trail": totheLeft,
    "FX_Missile_Stinger_Trail": totheLeft,
    "FX_Missile_Javelin": totheLeft,
    "RPG7V2_Trail": veryClose,
    "FX_MF": veryClose,
    "BreachingDart": veryClose,
    "_Static": veryClose,
    "_Flock": forTheBirds,
    "_Underwater": mediumFarAndDownABit,
};
const reshootList = [
    "fx_ambwar_artillarystrike",
    "FX_AmbWar_UAV_Circling",
    "FX_BASE_Flies_Small",
    "FX_Gadget_AirburstLauncher_Predicted_Line",
    "FX_Grenade_AntiTank_Trail",
    "FX_ProjectileTrail_M320_Incendiary",
    "FX_ProjectileTrail_M320_Lethal",
    "FX_ProjectileTrail_M320_NonLethal",

]

const ignoredVFX = [
    "FX_BASE_DeployClouds_Var_A",
    "FX_BASE_DeployClouds_Var_B",
    "FX_BASE_Dust_Large_Area",
    "FX_BASE_Flies_Small",
    "FX_BASE_Smoke_Dark_M",
    "FX_Blackhawk_Rotor_Vortex_Vapor",
    "FX_Gadget_AirburstLauncher_Predicted_Point_GroundConnect",
    "FX_Gadget_AirburstLauncher_Predicted_Point",
    "FX_Gadget_AmmoCrate_Area",
    "FX_Gadget_Binoculars_ScopeGlint",
    "FX_Gadget_Defib_LED",
    "FX_Gadget_Defib_Recharge_LED",
    "FX_Gadget_EIDOS_Lights_Active",
    "FX_Gadget_EIDOS_Lights_Standby",
    "FX_Gadget_InterativeSpectator_Camera_Light_Green",
    "FX_Gadget_InterativeSpectator_Camera_Light_Yellow",
    "FX_Gadget_Mine_AT_Warning_Light",
    "FX_Gadget_MPAPS_Lights_Active",
    "FX_Gadget_MPAPS_Lights_Standby",
    "FX_Gadget_ReconDrone_Light",
    "FX_Gadget_ReconDrone_OutOfRange_Distortion",
    "FX_Gadget_SmokeBarrage_Cluster_Trail",
    "FX_Gadget_SmokeBarrage_Cluster_VE",
    "FX_Gadget_SupplyCrate_Range_Indicator_Upgraded",
    "FX_Gadget_SupplyCrate_Range_Indicator",
    "FX_Gadget_Trophy_Range_Indicator",
    "FX_Grenade_BreachingDartFlashbang_BurnIn_ScreenEffect",
    "FX_Grenade_Fragmentation_Trail",
    "FX_Grenade_M67_Fragmentation_Trail",
    "FX_Grenade_M84_Flashbang_Trail",
    "FX_Grenade_MK32A_Concussion_Trail",
    "FX_Grenade_Smoke_Disarmed",
    "FX_Grenade_Smoke_Explosion_High_Wind",
    "FX_Grenade_Smoke_Trail",
    "FX_Missile_Javelin_Launch_SmokeTrail",
    "FX_MortarStrike_Trail",
    "FX_Panzerfaust_Projectile_Stabilizers",
    "FX_ProximityGrenade_Trail",
    "FX_RepairTool_Overheat_1P",
    "FX_RepairTool_Overheat_3P",
];

function VFXDemoPositionOffset(vfxKey: string, vfx: mod.RuntimeSpawn_Common): Driveways.Physics.Vec3 {
    let offsetPosition = defaultOffset;
    for (const [key, offset] of Object.entries(positionMap)) {
        if (vfxKey.indexOf(key) !== -1) {
            offsetPosition = offset;
        }
    }
    return new Driveways.Physics.Vec3(offsetPosition.x, offsetPosition.y, offsetPosition.z);
}

function GetCommonVFX(): Map<string, mod.RuntimeSpawn_Common> {
    const vfxMap = new Map<string, mod.RuntimeSpawn_Common>();
    for (const vfxKey of Object.keys(mod.RuntimeSpawn_Common)) {
        if (typeof vfxKey === 'string' && vfxKey in mod.RuntimeSpawn_Common && vfxKey.toLowerCase().startsWith("fx_") && !ignoredVFX.includes(vfxKey)) {
            const vfx = mod.RuntimeSpawn_Common[vfxKey as keyof typeof mod.RuntimeSpawn_Common];
            if (vfx) {
                vfxMap.set(vfxKey, vfx);
            }
        }
    }
    return vfxMap;
}
const vfxList = GetCommonVFX();
for (const vfxKey of vfxList.keys()) {
    Log("VFX: " + vfxKey);
}

function GetVFXName(vfx: mod.RuntimeSpawn_Common): string {
    const stringkey = GetVFXEnumString(vfx);
    return mod.stringkeys[stringkey as keyof typeof mod.stringkeys] || mod.stringkeys.weapon_unknown;
}

function GetVFXEnumString(vfxIncoming: mod.RuntimeSpawn_Common): string {
    for (const vfxKey of Object.keys(mod.RuntimeSpawn_Common)) {
        if (typeof vfxKey === 'string' && vfxKey in mod.RuntimeSpawn_Common) {
            const w = mod.RuntimeSpawn_Common[vfxKey as keyof typeof mod.RuntimeSpawn_Common];
            if (w === vfxIncoming) {
                return vfxKey;
            }
        }
    }
    return "vfx_unknown";
}

class CustomDisplayText {
    text: string;
    textWidgets: mod.UIWidget[] = [];
    defaultCharWidth: number = 30;
    private static counter = 0;
    private id: number;
    constructor(text: string, position: number[]) {
        this.id = CustomDisplayText.counter++;
        this.text = text;
        let index = 0;
        const textWidth = text.length * this.defaultCharWidth;
        for (const character of text) {
            const textName = "custom_display_text_" + this.id + "_" + index + "_" + character;
            const existing = mod.FindUIWidgetWithName(textName);
            if (existing) {
                mod.DeleteUIWidget(existing);
            }
            const textWidget = modlib.ParseUI({
                type: "Text",
                name: textName,
                position: [position[0] - textWidth / 2 + this.charWidth(character) * index, position[1]],
                size: [this.defaultCharWidth, 50],
                anchor: mod.UIAnchor.Center,
                visible: true,
                bgColor: [0, 0, 0],
                bgAlpha: 0.9,
                bgFill: mod.UIBgFill.Solid,
                textLabel: mod.Message(character),
                textColor: [1, 1, 1],
                textAlpha: 1,
                textSize: 48,
                textAnchor: mod.UIAnchor.Center,
            });
            if (textWidget) {
                this.textWidgets.push(textWidget);
            } else {
                Error("Failed to create text widget");
            }
            index++;
        }
    }
    destroy() {
        for (const textWidget of this.textWidgets) {
            if (textWidget) {
                mod.DeleteUIWidget(textWidget);
            }
        }
        this.textWidgets = [];
    }
    charWidth(character: string): number {
        return this.defaultCharWidth;
    }
}
UpdateVFXRotationDisplay();