import { TILE_SIZE, TILE_TYPES, SURFACE_Y } from './constants.js';

export class InteractionManager {
  constructor() {
    this.links = [];
    this.pillars = [];
    this.fragileWalls = new Map();
    this.activePlates = new Map();
    this.latchedPlates = new Set();
    this.openDoors = new Set();
    this.activeTraps = [];
    this.scannerActive = false;
    this.scannerEnergy = 100;
    this.scannerMaxEnergy = 100;
    this.scannerRange = 8;
    this.scannerDrain = 15;
    this.scannerRecharge = 5;
  }

  loadFromData(data) {
    this.links = data.links || [];
    this.pillars = data.pillars || [];
    for (const fw of (data.fragileWalls || [])) {
      this.fragileWalls.set(`${fw.x},${fw.y}`, { x: fw.x, y: fw.y, revealed: false });
    }
  }

  update(dt, player, world, particles, onDoorOpen, onTrap) {
    if (this.scannerActive) {
      this.scannerEnergy -= this.scannerDrain * dt;
      if (this.scannerEnergy <= 0) {
        this.scannerEnergy = 0;
        this.scannerActive = false;
      }
    } else {
      this.scannerEnergy = Math.min(this.scannerMaxEnergy, this.scannerEnergy + this.scannerRecharge * dt);
    }

    this.activePlates.clear();
    const ptx = player.tileX;
    const pty = player.tileY;

    for (const link of this.links) {
      let allActive = true;
      let anyActive = false;

      for (const plate of link.plates) {
        const key = `${plate.x},${plate.y}`;
        const isOnPlate = (plate.x === ptx && plate.y === pty);
        const isLatched = this.latchedPlates.has(key);
        const isActive = isOnPlate || isLatched;

        if (isActive) {
          this.activePlates.set(key, true);
          anyActive = true;
          if (plate.latch && isOnPlate && !isLatched) {
            this.latchedPlates.add(key);
          }
        } else {
          allActive = false;
        }
      }

      const shouldActivate = link.requireAll ? allActive : anyActive;

      for (const target of link.targets) {
        const key = `${target.x},${target.y}`;
        if (shouldActivate) {
          if (target.type === 'door' && !this.openDoors.has(key)) {
            this.openDoors.add(key);
            if (world.getTile(target.x, target.y) === TILE_TYPES.DOOR) {
              const idx = world.getIndex(target.x, target.y);
              world.tiles[idx] = TILE_TYPES.EMPTY;
              world.tileHealth[idx] = 0;
              world.dugTiles[idx] = 1;
              onDoorOpen(target.x, target.y);
            }
          } else if (target.type === 'trap') {
            const existing = this.activeTraps.find(t => t.x === target.x && t.y === target.y);
            if (!existing) {
              this.activeTraps.push({ x: target.x, y: target.y, timer: 3 });
              onTrap(target.x, target.y);
            }
          }
        }
      }
    }

    for (let i = this.activeTraps.length - 1; i >= 0; i--) {
      this.activeTraps[i].timer -= dt;
      if (this.activeTraps[i].timer <= 0) {
        this.activeTraps.splice(i, 1);
      }
    }

    const playerKey = `${ptx},${pty}`;
    for (const trap of this.activeTraps) {
      if (playerKey === `${trap.x},${trap.y}`) {
        player.takeDamage(8 * dt);
        if (Math.random() < 0.15) {
          particles.spawnTrail(player.x, player.y, '#FF4444');
        }
      }
    }
  }

  handlePillarDestroy(x, y) {
    const pillar = this.pillars.find(p => p.x === x && p.y === y);
    if (!pillar) return [];
    const collapseTiles = [];
    const radius = pillar.collapseRadius || 3;
    for (let dy = -radius; dy <= 0; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > radius) continue;
        const collapseSet = this.pillars.some(p => p.x === x + dx && p.y === y + dy && p !== pillar);
        if (collapseSet) continue;
        const collapseX = x + dx;
        const collapseY = y + dy;
        if (collapseX === x && collapseY === y) continue;
        if (Math.random() < 0.6) {
          collapseTiles.push({ x: collapseX, y: collapseY });
        }
      }
    }
    return collapseTiles;
  }

  handleFragileWallBreak(x, y) {
    const key = `${x},${y}`;
    const wall = this.fragileWalls.get(key);
    if (wall && !wall.revealed) {
      wall.revealed = true;
    }
  }

  getScannerHighlightType(tileX, tileY) {
    if (!this.scannerActive) return null;
    for (const pillar of this.pillars) {
      if (pillar.x === tileX && pillar.y === tileY) return 'pillar';
    }
    for (const link of this.links) {
      for (const plate of link.plates) {
        if (plate.x === tileX && plate.y === tileY) return 'plate';
      }
      for (const target of link.targets) {
        if (target.x === tileX && target.y === tileY) {
          return target.type === 'door' ? 'door' : 'trap';
        }
      }
    }
    if (this.fragileWalls.has(`${tileX},${tileY}`)) return 'fragile';
    return null;
  }

  isPlateActive(x, y) {
    return this.activePlates.has(`${x},${y}`);
  }

  isDoorOpen(x, y) {
    return this.openDoors.has(`${x},${y}`);
  }

  toggleScanner() {
    if (this.scannerActive) {
      this.scannerActive = false;
    } else if (this.scannerEnergy > 10) {
      this.scannerActive = true;
    }
  }

  clear() {
    this.links = [];
    this.pillars = [];
    this.fragileWalls.clear();
    this.activePlates.clear();
    this.latchedPlates.clear();
    this.openDoors.clear();
    this.activeTraps = [];
    this.scannerActive = false;
    this.scannerEnergy = this.scannerMaxEnergy;
  }

  render(ctx, worldToScreen, playerTileX, playerTileY) {
    if (this.scannerActive) {
      this.renderScannerHighlights(ctx, worldToScreen, playerTileX, playerTileY);
    }

    for (const trap of this.activeTraps) {
      this.renderSpikeTrap(ctx, worldToScreen, trap);
    }
  }

  renderScannerHighlights(ctx, worldToScreen, ptx, pty) {
    const range = this.scannerRange;
    const time = Date.now() * 0.003;
    const pulse = 0.5 + Math.sin(time) * 0.3;

    for (let dy = -range; dy <= range; dy++) {
      for (let dx = -range; dx <= range; dx++) {
        const tx = ptx + dx;
        const ty = pty + dy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > range) continue;

        const type = this.getScannerHighlightType(tx, ty);
        if (!type) continue;

        const screen = worldToScreen(tx * TILE_SIZE, ty * TILE_SIZE);
        const alpha = pulse * (1 - dist / range * 0.5);

        let color;
        switch (type) {
          case 'pillar': color = `rgba(255, 140, 0, ${alpha})`; break;
          case 'plate': color = `rgba(65, 105, 225, ${alpha})`; break;
          case 'fragile': color = `rgba(50, 205, 50, ${alpha})`; break;
          case 'door': color = `rgba(255, 215, 0, ${alpha})`; break;
          case 'trap': color = `rgba(255, 0, 0, ${alpha})`; break;
          default: color = `rgba(255, 255, 255, ${alpha * 0.5})`;
        }

        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.strokeRect(screen.x, screen.y, TILE_SIZE, TILE_SIZE);

        ctx.fillStyle = color.replace(String(alpha), String(alpha * 0.2));
        ctx.fillRect(screen.x, screen.y, TILE_SIZE, TILE_SIZE);
      }
    }

    const playerScreen = worldToScreen(
      (ptx + 0.5) * TILE_SIZE,
      (pty + 0.5) * TILE_SIZE
    );
    ctx.strokeStyle = `rgba(0, 255, 255, ${0.2 + pulse * 0.1})`;
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.arc(playerScreen.x, playerScreen.y, range * TILE_SIZE, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  renderSpikeTrap(ctx, worldToScreen, trap) {
    const screen = worldToScreen(trap.x * TILE_SIZE, trap.y * TILE_SIZE);
    const time = Date.now() * 0.01;
    const alpha = Math.min(1, trap.timer / 0.5);

    ctx.fillStyle = `rgba(200, 200, 200, ${alpha})`;
    for (let i = 0; i < 4; i++) {
      const ox = 8 + (i % 2) * 16;
      const oy = 8 + Math.floor(i / 2) * 16;
      const height = 12 + Math.sin(time + i) * 4;
      ctx.beginPath();
      ctx.moveTo(screen.x + ox, screen.y + oy + 8);
      ctx.lineTo(screen.x + ox + 4, screen.y + oy + 8 - height);
      ctx.lineTo(screen.x + ox + 8, screen.y + oy + 8);
      ctx.closePath();
      ctx.fill();
    }
  }
}
