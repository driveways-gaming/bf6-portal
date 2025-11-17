interface TilePos {
    x: number;
    y: number;
}

class Gunshow {

}

class MovingFloor {

    private static floorRootX = 0;
    private static floorRootZ = 0;
    private static tileSize = 1.3;
    private static propOffsetX = 0.65;
    private static propOffsetY = -1;
    private static propOffsetZ = 0.65;
    // private static tileObject = mod.RuntimeSpawn_Common.FiringRange_Floor_01;
    private static tileObject = mod.RuntimeSpawn_Common.BarrierStoneBlock_01_A;
    private static currentTiles: Map<string, number> = new Map(); // TilePosKey -> ObjectId

    static getTileKey(tile: TilePos): string {
        return `${tile.x},${tile.y}`;
    }

    static positionTiles() {
        const neededTiles = this.getNeededTiles();
        const neededTileKeys = neededTiles.map(tile => this.getTileKey(tile));
        const neededTileKeysSet = new Set(neededTileKeys);
        const newTilesSet = new Set(neededTileKeys.filter(key => !this.currentTiles.has(key)));
        const oldTiles = Array.from(this.currentTiles.keys()).filter(key => !neededTileKeysSet.has(key));
        for (const key of oldTiles) {
            const tileId = this.currentTiles.get(key);
            if (tileId) {
                const spatialObject = mod.GetSpatialObject(tileId);
                if (spatialObject) {
                    try {
                        mod.UnspawnObject(spatialObject);
                        this.currentTiles.delete(key);
                        console.log("Tile unspawned");
                    } catch (e) {
                        console.log("Failed to unspawn tile: " + e);
                        this.currentTiles.delete(key);
                    }
                } else {
                    console.log("Tile not found in UnspawnObject");
                    this.currentTiles.delete(key);
                }
            } else {
                console.log("Tile ID not found");
            }
        }
        for (const tile of neededTiles) {
            const key = this.getTileKey(tile);
            if (newTilesSet.has(key)) {
                const tilePosition = mod.CreateVector(this.floorRootX + tile.x * this.tileSize + this.propOffsetX, 220 + this.propOffsetY, this.floorRootZ + tile.y * this.tileSize + this.propOffsetZ);
                const spawnedTile = mod.SpawnObject(this.tileObject, tilePosition, mod.CreateVector(0, 0, 0));
                const tileId = mod.GetObjId(spawnedTile);
                this.currentTiles.set(key, tileId);
                console.log("Tile spawned with id " + tileId + " and key " + key);
            }
        }
        // console.log("Tiles positioned");
    }

    static getNeededTiles(): TilePos[] {
        const neededTiles: TilePos[] = [];
        const tileMap = new Map<string, boolean>();
        const players = mod.AllPlayers();
        const count = mod.CountOf(players);
        const coverageRadius = this.tileSize / 4;
        const offsets = [[0,0], [1,0], [-1,0], [0,1], [0,-1], [1,1], [1,-1], [-1,1], [-1,-1]];
        
        const addTile = (x: number, y: number) => {
            const key = `${x},${y}`;
            if (!tileMap.has(key)) {
                tileMap.set(key, true);
                neededTiles.push({ x, y });
            }
        };
        
        for (let i = 0; i < count; i++) {
            const player = mod.ValueInArray(players, i);
            if (mod.GetSoldierState(player, mod.SoldierStateBool.IsAlive)) {
                const pos = mod.GetSoldierState(player, mod.SoldierStateVector.GetPosition);
                const px = mod.XComponentOf(pos);
                const pz = mod.ZComponentOf(pos);
                const tileX = Math.floor((px - this.floorRootX) / this.tileSize);
                const tileY = Math.floor((pz - this.floorRootZ) / this.tileSize);
                const tileMinX = this.floorRootX + tileX * this.tileSize;
                const tileMinZ = this.floorRootZ + tileY * this.tileSize;
                
                for (const [dx, dy] of offsets) {
                    if (dx === 0 && dy === 0) {
                        addTile(tileX, tileY);
                    } else {
                        const checkX = dx === 0 ? true : (dx > 0 ? px + coverageRadius > tileMinX + this.tileSize : px - coverageRadius < tileMinX);
                        const checkZ = dy === 0 ? true : (dy > 0 ? pz + coverageRadius > tileMinZ + this.tileSize : pz - coverageRadius < tileMinZ);
                        if (checkX && checkZ) addTile(tileX + dx, tileY + dy);
                    }
                }
            }
        }
        return neededTiles;
    }



    static moveFloorToPosition(floorId: number, position: mod.Vector) {
        const floor = mod.GetSpatialObject(floorId);
        if (!floor) {
            console.log("Floor not found");
            return;
        } else {
            console.log("Floor found");
        }
        // mod.MoveObject(floor, position);
        const transform = mod.CreateTransform(position, mod.CreateVector(0, 0, 0));
        mod.SetObjectTransform(floor, transform);
    }
}

export async function OngoingPlayer(player: mod.Player) {
    if (IsLivePlayer(player) && mod.GetSoldierState(player, mod.SoldierStateBool.IsAlive) && !mod.GetSoldierState(player, mod.SoldierStateBool.IsAISoldier)) {
        const soldierPosition = mod.GetSoldierState(player, mod.SoldierStateVector.GetPosition);
        const destinationPosition = mod.CreateVector(mod.XComponentOf(soldierPosition), mod.YComponentOf(soldierPosition) + 10, mod.ZComponentOf(soldierPosition));
        // MovingFloor.moveFloorToPosition(1000, destinationPosition);
        MovingFloor.positionTiles();
    }
}



const LivePlayers: Set<number> = new Set();

function IsLivePlayer(player: mod.Player): boolean {
    const playerId = mod.GetObjId(player);
    return LivePlayers.has(playerId);
}

export async function OnPlayerDeployed(player: mod.Player) {
    const playerId = mod.GetObjId(player);
    LivePlayers.add(playerId);
    console.log("Player deployed: " + playerId);
}

export async function OnPlayerDied(player: mod.Player) {
    const playerId = mod.GetObjId(player);
    LivePlayers.delete(playerId);
    console.log("Player died: " + playerId);
}

export async function OnPlayerLeft(player: mod.Player) {
    const playerId = mod.GetObjId(player);
    LivePlayers.delete(playerId);
    console.log("Player left: " + playerId);
}