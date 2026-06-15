import { SimplexNoise } from '../utils/noise.js';
import {
  TILE_SIZE,
  WORLD_WIDTH,
  WORLD_HEIGHT,
  SURFACE_Y,
  TILE_TYPES,
  TILE_HARDNESS,
  TILE_ORE_MAP
} from './constants.js';

export class World {
  constructor(seed = Date.now()) {
    this.seed = seed;
    this.noise = new SimplexNoise(seed);
    this.noise2 = new SimplexNoise(seed + 1);
    this.noise3 = new SimplexNoise(seed + 2);
    this.tiles = new Uint8Array(WORLD_WIDTH * WORLD_HEIGHT);
    this.tileHealth = new Float32Array(WORLD_WIDTH * WORLD_HEIGHT);
    this.dugTiles = new Uint8Array(WORLD_WIDTH * WORLD_HEIGHT);
    this.generate();
  }

  getIndex(x, y) {
    return y * WORLD_WIDTH + x;
  }

  inBounds(x, y) {
    return x >= 0 && x < WORLD_WIDTH && y >= 0 && y < WORLD_HEIGHT;
  }

  getTile(x, y) {
    if (!this.inBounds(x, y)) return TILE_TYPES.BEDROCK;
    return this.tiles[this.getIndex(x, y)];
  }

  setTile(x, y, type) {
    if (!this.inBounds(x, y)) return;
    const idx = this.getIndex(x, y);
    this.tiles[idx] = type;
    if (type !== TILE_TYPES.EMPTY) {
      this.tileHealth[idx] = TILE_HARDNESS[type] * 100;
    }
  }

  isDug(x, y) {
    if (!this.inBounds(x, y)) return false;
    return this.dugTiles[this.getIndex(x, y)] === 1;
  }

  generate() {
    for (let y = 0; y < WORLD_HEIGHT; y++) {
      for (let x = 0; x < WORLD_WIDTH; x++) {
        const idx = this.getIndex(x, y);
        
        if (y >= WORLD_HEIGHT - 2) {
          this.tiles[idx] = TILE_TYPES.BEDROCK;
          continue;
        }

        if (y < SURFACE_Y) {
          this.tiles[idx] = TILE_TYPES.EMPTY;
          continue;
        }

        if (y === SURFACE_Y) {
          this.tiles[idx] = TILE_TYPES.DIRT;
          this.tileHealth[idx] = TILE_HARDNESS[TILE_TYPES.DIRT] * 100;
          continue;
        }

        const depth = y - SURFACE_Y;
        const maxDepth = WORLD_HEIGHT - SURFACE_Y;
        const depthRatio = depth / maxDepth;

        const baseNoise = this.noise.fbm(x * 0.03, y * 0.03, 4, 0.5, 2);
        const caveNoise = this.noise2.fbm(x * 0.05, y * 0.05, 3, 0.6, 2.2);
        const detailNoise = this.noise3.fbm(x * 0.1, y * 0.1, 2, 0.5, 2);

        const combined = baseNoise * 0.7 + detailNoise * 0.3;
        const stoneThreshold = 0.05 + depthRatio * 0.15;
        const hardStoneThreshold = 0.25 + depthRatio * 0.2;

        let tileType;

        if (caveNoise > 0.55 && depthRatio > 0.1 && depthRatio < 0.95) {
          const caveSize = (caveNoise - 0.55) / 0.45;
          if (caveSize > 0.3 || Math.random() < caveSize * 0.5) {
            tileType = TILE_TYPES.CAVE;
          } else {
            tileType = this.pickStoneType(combined, stoneThreshold, hardStoneThreshold, depthRatio);
          }
        } else {
          tileType = this.pickStoneType(combined, stoneThreshold, hardStoneThreshold, depthRatio);
        }

        if (tileType !== TILE_TYPES.CAVE && Math.random() < 0.003 + depthRatio * 0.008) {
          tileType = this.pickOre(depthRatio);
        }

        if (tileType !== TILE_TYPES.CAVE && depthRatio > 0.7 && Math.random() < 0.015) {
          tileType = TILE_TYPES.LAVA;
        }

        if (tileType === TILE_TYPES.CAVE) {
          this.tiles[idx] = TILE_TYPES.CAVE;
          continue;
        }

        if (depthRatio > 0.3 && tileType === TILE_TYPES.STONE && Math.random() < 0.008) {
          tileType = TILE_TYPES.INSTABILITY;
        }

        if (depthRatio > 0.2 && tileType === TILE_TYPES.DIRT && Math.random() < 0.005) {
          tileType = TILE_TYPES.POISON_GAS;
        }

        this.tiles[idx] = tileType;
        if (tileType !== TILE_TYPES.EMPTY && tileType !== TILE_TYPES.CAVE) {
          this.tileHealth[idx] = TILE_HARDNESS[tileType] * 100;
        }
      }
    }
  }

  pickStoneType(noiseVal, stoneThresh, hardThresh, depthRatio) {
    if (noiseVal < stoneThresh) {
      return depthRatio < 0.15 ? TILE_TYPES.DIRT : TILE_TYPES.STONE;
    } else if (noiseVal < hardThresh) {
      return TILE_TYPES.STONE;
    } else {
      return TILE_TYPES.HARD_STONE;
    }
  }

  pickOre(depthRatio) {
    const r = Math.random();
    if (depthRatio < 0.2) {
      if (r < 0.7) return TILE_TYPES.ORE_COAL;
      if (r < 0.95) return TILE_TYPES.ORE_IRON;
      return TILE_TYPES.ORE_GOLD;
    } else if (depthRatio < 0.4) {
      if (r < 0.4) return TILE_TYPES.ORE_COAL;
      if (r < 0.75) return TILE_TYPES.ORE_IRON;
      if (r < 0.92) return TILE_TYPES.ORE_GOLD;
      return TILE_TYPES.ORE_EMERALD;
    } else if (depthRatio < 0.6) {
      if (r < 0.2) return TILE_TYPES.ORE_IRON;
      if (r < 0.5) return TILE_TYPES.ORE_GOLD;
      if (r < 0.75) return TILE_TYPES.ORE_EMERALD;
      if (r < 0.9) return TILE_TYPES.ORE_RUBY;
      return TILE_TYPES.ORE_DIAMOND;
    } else if (depthRatio < 0.8) {
      if (r < 0.15) return TILE_TYPES.ORE_GOLD;
      if (r < 0.35) return TILE_TYPES.ORE_EMERALD;
      if (r < 0.6) return TILE_TYPES.ORE_RUBY;
      return TILE_TYPES.ORE_DIAMOND;
    } else {
      if (r < 0.1) return TILE_TYPES.ORE_EMERALD;
      if (r < 0.4) return TILE_TYPES.ORE_RUBY;
      return TILE_TYPES.ORE_DIAMOND;
    }
  }

  digTile(x, y, drillPower) {
    if (!this.inBounds(x, y)) return { success: false, ore: null };
    const tile = this.getTile(x, y);
    const idx = this.getIndex(x, y);

    if (tile === TILE_TYPES.EMPTY || tile === TILE_TYPES.CAVE) {
      return { success: true, ore: null, passable: true };
    }

    if (tile === TILE_TYPES.BEDROCK || tile === TILE_TYPES.LAVA) {
      return { success: false, ore: null, hazard: tile === TILE_TYPES.LAVA ? 'lava' : null };
    }

    const hardness = TILE_HARDNESS[tile];
    if (hardness > drillPower) {
      return { success: false, ore: null, tooHard: true };
    }

    this.tileHealth[idx] -= drillPower * 25;
    
    if (this.tileHealth[idx] <= 0) {
      const oreType = TILE_ORE_MAP[tile];
      const hazard = this.getHazardEffect(tile);
      const originalType = tile;
      this.tiles[idx] = TILE_TYPES.EMPTY;
      this.tileHealth[idx] = 0;
      this.dugTiles[idx] = 1;
      return { success: true, ore: oreType, broke: true, hazard, originalType };
    }

    return { success: true, ore: null, damaged: true };
  }

  getHazardEffect(tile) {
    if (tile === TILE_TYPES.POISON_GAS) return 'poison';
    if (tile === TILE_TYPES.INSTABILITY) return 'instability';
    return null;
  }

  isSolid(x, y) {
    const tile = this.getTile(x, y);
    return tile !== TILE_TYPES.EMPTY && tile !== TILE_TYPES.CAVE && tile !== TILE_TYPES.PRESSURE_PLATE;
  }

  checkCollapse(x, y) {
    const collapses = [];
    if (!this.inBounds(x, y)) return collapses;

    for (let dy = -2; dy <= 0; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const checkX = x + dx;
        const checkY = y + dy;
        if (checkY < SURFACE_Y + 1) continue;
        
        const tile = this.getTile(checkX, checkY);
        if (tile === TILE_TYPES.EMPTY || tile === TILE_TYPES.CAVE) continue;
        
        const below = this.getTile(checkX, checkY + 1);
        if (below === TILE_TYPES.EMPTY || below === TILE_TYPES.CAVE) {
          const supportLeft = this.isSolid(checkX - 1, checkY + 1);
          const supportRight = this.isSolid(checkX + 1, checkY + 1);
          
          if (!supportLeft && !supportRight && Math.random() < 0.3) {
            collapses.push({ x: checkX, y: checkY });
          }
        }
      }
    }
    return collapses;
  }

  generateInteractions() {
    const data = { links: [], pillars: [], fragileWalls: [] };

    this._generatePillars(data);
    this._generateDoorPlateCombos(data);
    this._generateFragileWalls(data);

    return data;
  }

  _generatePillars(data) {
    for (let y = SURFACE_Y + 15; y < WORLD_HEIGHT - 10; y += 12 + Math.floor(this.noise.fbm(y * 0.1, 0, 2, 0.5, 2) * 15)) {
      for (let x = 5; x < WORLD_WIDTH - 5; x += 15 + Math.floor(this.noise.fbm(0, x * 0.1, 2, 0.5, 2) * 20)) {
        if (this.getTile(x, y) !== TILE_TYPES.CAVE && this.getTile(x, y) !== TILE_TYPES.EMPTY) continue;

        for (let dy = -4; dy <= -1; dy++) {
          const checkY = y + dy;
          const tile = this.getTile(x, checkY);
          if (tile === TILE_TYPES.STONE || tile === TILE_TYPES.HARD_STONE) {
            const idx = this.getIndex(x, checkY);
            this.tiles[idx] = TILE_TYPES.SUPPORT_PILLAR;
            this.tileHealth[idx] = TILE_HARDNESS[TILE_TYPES.SUPPORT_PILLAR] * 100;
            const collapseRadius = 2 + Math.floor(Math.random() * 2);
            data.pillars.push({ x, y: checkY, collapseRadius });
            break;
          }
        }
      }
    }
  }

  _generateDoorPlateCombos(data) {
    const placed = new Set();

    for (let attempt = 0; attempt < 80; attempt++) {
      const x = 5 + Math.floor(Math.random() * (WORLD_WIDTH - 10));
      const y = SURFACE_Y + 8 + Math.floor(Math.random() * (WORLD_HEIGHT - SURFACE_Y - 20));

      if (this.getTile(x, y) !== TILE_TYPES.CAVE && this.getTile(x, y) !== TILE_TYPES.EMPTY) continue;
      if (!this.isSolid(x - 1, y) || !this.isSolid(x + 1, y)) continue;

      const key = `${x},${y}`;
      if (placed.has(key)) continue;

      const idx = this.getIndex(x, y);
      this.tiles[idx] = TILE_TYPES.DOOR;
      this.tileHealth[idx] = TILE_HARDNESS[TILE_TYPES.DOOR] * 100;
      placed.add(key);

      const isCombo = Math.random() < 0.35;
      const numPlates = isCombo ? 2 : 1;
      const plates = [];

      for (let pi = 0; pi < numPlates; pi++) {
        let plateX = -1, plateY = -1;
        for (let search = 0; search < 20; search++) {
          const ox = x + (pi === 0 ? -1 : 1) * (2 + Math.floor(Math.random() * 4));
          const oy = y + Math.floor((Math.random() - 0.5) * 3);
          if (ox < 0 || ox >= WORLD_WIDTH || oy < 0 || oy >= WORLD_HEIGHT) continue;
          const ptile = this.getTile(ox, oy);
          if (ptile === TILE_TYPES.CAVE || ptile === TILE_TYPES.EMPTY) {
            plateX = ox;
            plateY = oy;
            break;
          }
        }

        if (plateX < 0) continue;

        const plateIdx = this.getIndex(plateX, plateY);
        this.tiles[plateIdx] = TILE_TYPES.PRESSURE_PLATE;
        this.tileHealth[plateIdx] = 0;
        this.dugTiles[plateIdx] = 1;
        placed.add(`${plateX},${plateY}`);

        plates.push({
          x: plateX,
          y: plateY,
          latch: isCombo ? true : Math.random() < 0.3
        });
      }

      const targets = [{ x, y, type: 'door' }];

      if (Math.random() < 0.4) {
        for (let ti = 0; ti < 2; ti++) {
          const trapX = x + (Math.random() < 0.5 ? -1 : 1);
          const trapY = y + ti;
          if (trapX >= 0 && trapX < WORLD_WIDTH && trapY >= 0 && trapY < WORLD_HEIGHT) {
            const trapTile = this.getTile(trapX, trapY);
            if (trapTile === TILE_TYPES.CAVE || trapTile === TILE_TYPES.EMPTY) {
              targets.push({ x: trapX, y: trapY, type: 'trap' });
            }
          }
        }
      }

      if (plates.length > 0) {
        data.links.push({
          plates,
          targets,
          requireAll: isCombo
        });
      }
    }
  }

  _generateFragileWalls(data) {
    const placed = new Set();

    for (let attempt = 0; attempt < 40; attempt++) {
      const x = 5 + Math.floor(Math.random() * (WORLD_WIDTH - 10));
      const y = SURFACE_Y + 10 + Math.floor(Math.random() * (WORLD_HEIGHT - SURFACE_Y - 20));

      if (this.getTile(x, y) !== TILE_TYPES.CAVE && this.getTile(x, y) !== TILE_TYPES.EMPTY) continue;

      let wallX = -1, wallY = -1;
      const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
      const shuffled = dirs.sort(() => Math.random() - 0.5);

      for (const [ddx, ddy] of shuffled) {
        const nx = x + ddx;
        const ny = y + ddy;
        const tile = this.getTile(nx, ny);
        if (tile === TILE_TYPES.STONE || tile === TILE_TYPES.HARD_STONE) {
          wallX = nx;
          wallY = ny;
          break;
        }
      }

      if (wallX < 0) continue;

      const wallKey = `${wallX},${wallY}`;
      if (placed.has(wallKey)) continue;

      const roomSizeX = 3;
      const roomSizeY = 3;
      let roomBaseX = wallX;
      let roomBaseY = wallY;

      if (wallX > x) roomBaseX = wallX + 1;
      else if (wallX < x) roomBaseX = wallX - roomSizeX;
      else if (wallY > y) roomBaseY = wallY + 1;
      else if (wallY < y) roomBaseY = wallY - roomSizeY;

      let canCarve = true;
      for (let ry = 0; ry < roomSizeY; ry++) {
        for (let rx = 0; rx < roomSizeX; rx++) {
          const cx = roomBaseX + rx;
          const cy = roomBaseY + ry;
          if (!this.inBounds(cx, cy)) { canCarve = false; break; }
          const t = this.getTile(cx, cy);
          if (t === TILE_TYPES.EMPTY || t === TILE_TYPES.CAVE || t === TILE_TYPES.LAVA || t === TILE_TYPES.BEDROCK) {
            canCarve = false; break;
          }
        }
        if (!canCarve) break;
      }

      if (!canCarve) continue;

      const wallIdx = this.getIndex(wallX, wallY);
      this.tiles[wallIdx] = TILE_TYPES.FRAGILE_WALL;
      this.tileHealth[wallIdx] = TILE_HARDNESS[TILE_TYPES.FRAGILE_WALL] * 100;
      placed.add(wallKey);

      const depthRatio = (wallY - SURFACE_Y) / (WORLD_HEIGHT - SURFACE_Y);

      for (let ry = 0; ry < roomSizeY; ry++) {
        for (let rx = 0; rx < roomSizeX; rx++) {
          const cx = roomBaseX + rx;
          const cy = roomBaseY + ry;
          const idx = this.getIndex(cx, cy);

          if (Math.random() < 0.5) {
            const oreTile = this._pickHiddenOre(depthRatio);
            this.tiles[idx] = oreTile;
            this.tileHealth[idx] = TILE_HARDNESS[oreTile] * 100;
          } else {
            this.tiles[idx] = TILE_TYPES.EMPTY;
            this.tileHealth[idx] = 0;
            this.dugTiles[idx] = 1;
          }
        }
      }

      data.fragileWalls.push({ x: wallX, y: wallY });
    }
  }

  _pickHiddenOre(depthRatio) {
    const r = Math.random();
    if (depthRatio < 0.3) {
      if (r < 0.3) return TILE_TYPES.ORE_COAL;
      if (r < 0.6) return TILE_TYPES.ORE_IRON;
      if (r < 0.85) return TILE_TYPES.ORE_GOLD;
      return TILE_TYPES.ORE_EMERALD;
    } else if (depthRatio < 0.6) {
      if (r < 0.15) return TILE_TYPES.ORE_IRON;
      if (r < 0.4) return TILE_TYPES.ORE_GOLD;
      if (r < 0.65) return TILE_TYPES.ORE_EMERALD;
      if (r < 0.85) return TILE_TYPES.ORE_RUBY;
      return TILE_TYPES.ORE_DIAMOND;
    } else {
      if (r < 0.1) return TILE_TYPES.ORE_GOLD;
      if (r < 0.3) return TILE_TYPES.ORE_EMERALD;
      if (r < 0.55) return TILE_TYPES.ORE_RUBY;
      return TILE_TYPES.ORE_DIAMOND;
    }
  }
}
