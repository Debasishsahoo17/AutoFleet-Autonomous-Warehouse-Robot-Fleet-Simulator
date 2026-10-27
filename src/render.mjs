import { WIDTH, HEIGHT } from './engine.mjs';

export const MAP_CELL = 31;
export const MAP_PAD = 26;
export const MAP_W = WIDTH * MAP_CELL + MAP_PAD * 2;
export const MAP_H = HEIGHT * MAP_CELL + MAP_PAD * 2;
const center = p => ({ x: p.x * MAP_CELL + MAP_CELL / 2, y: p.y * MAP_CELL + MAP_CELL / 2 });
const hexAlpha = (hex, alpha) => `${hex}${Math.round(Math.max(0, Math.min(1, alpha)) * 255).toString(16).padStart(2, '0')}`;

export function hitTestRobot(canvas, event, robots) {
  const rect = canvas.getBoundingClientRect();
  const bx = (event.clientX - rect.left) / rect.width * MAP_W - MAP_PAD;
  const by = (event.clientY - rect.top) / rect.height * MAP_H - MAP_PAD;
  return robots.find(r => Math.hypot(bx - center(r).x, by - center(r).y) < 15) || null;
}

export function paintWarehouse(canvas, sim, { selectedRobot = null, showRoutes = true, now = 0 } = {}) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const ratio = Math.min(2, window.devicePixelRatio || 1);
  const desiredWidth = Math.round(MAP_W * ratio), desiredHeight = Math.round(MAP_H * ratio);
  if (canvas.width !== desiredWidth || canvas.height !== desiredHeight) {
    canvas.width = desiredWidth; canvas.height = desiredHeight;
  }
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, MAP_W, MAP_H);
  ctx.fillStyle = '#0b1927';
  ctx.fillRect(0, 0, MAP_W, MAP_H);
  ctx.save(); ctx.translate(MAP_PAD, MAP_PAD);
  ctx.fillStyle = '#102235'; ctx.fillRect(0, 0, WIDTH * MAP_CELL, HEIGHT * MAP_CELL);

  // Discrete navigable cells, inspection grid, and guide lanes.
  ctx.strokeStyle = '#223849'; ctx.lineWidth = .6;
  for (let x = 0; x <= WIDTH; x++) { ctx.beginPath(); ctx.moveTo(x * MAP_CELL, 0); ctx.lineTo(x * MAP_CELL, HEIGHT * MAP_CELL); ctx.stroke(); }
  for (let y = 0; y <= HEIGHT; y++) { ctx.beginPath(); ctx.moveTo(0, y * MAP_CELL); ctx.lineTo(WIDTH * MAP_CELL, y * MAP_CELL); ctx.stroke(); }
  ctx.save(); ctx.setLineDash([7, 17]); ctx.strokeStyle = '#305363'; ctx.lineWidth = 1;
  for (const y of [2, 8, 9, 16]) { ctx.beginPath(); ctx.moveTo(MAP_CELL, (y + .5) * MAP_CELL); ctx.lineTo((WIDTH - 1) * MAP_CELL, (y + .5) * MAP_CELL); ctx.stroke(); }
  ctx.restore();

  // Chargers (static infrastructure).
  for (const c of sim.grid.chargers) {
    const { x, y } = center(c);
    ctx.strokeStyle = '#305d77'; ctx.strokeRect(c.x * MAP_CELL + 5, c.y * MAP_CELL + 5, MAP_CELL - 10, MAP_CELL - 10);
    ctx.fillStyle = '#54819b'; ctx.font = '11px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('⌁', x, y);
  }

  // Shelving bays + inventory slots.
  for (const block of sim.grid.shelfBlocks) {
    const x = block.x * MAP_CELL + 3, y = block.y * MAP_CELL + 3;
    const w = block.w * MAP_CELL - 6, h = block.h * MAP_CELL - 6;
    ctx.fillStyle = '#234153'; ctx.strokeStyle = '#45748a'; ctx.lineWidth = 1;
    roundedRect(ctx, x, y, w, h, 4); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#31596a';
    for (let row = 0; row < 5; row++) {
      ctx.fillRect(x + 7, y + 10 + row * 29, w - 14, 19);
      ctx.fillStyle = '#40697a'; ctx.fillRect(x + 7, y + 26 + row * 29, w - 14, 2); ctx.fillStyle = '#31596a';
    }
    ctx.fillStyle = '#9ec7d7'; ctx.font = 'bold 9px ui-monospace, monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(`R${block.x.toString().padStart(2, '0')}`, x + w / 2, y + h / 2);
  }

  // Delivery ports are accessible service zones.
  for (const dock of sim.grid.stations) {
    const { x, y } = center(dock);
    ctx.fillStyle = '#3d3b30'; ctx.strokeStyle = '#d9af69'; ctx.lineWidth = 1.5;
    roundedRect(ctx, dock.x * MAP_CELL + 2, dock.y * MAP_CELL + 2, MAP_CELL - 4, MAP_CELL - 4, 4); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fbd58f'; ctx.font = 'bold 12px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('⇢', x, y);
    ctx.font = '8px monospace'; ctx.fillStyle = '#f5d18b'; ctx.fillText(dock.id.slice(0, 1), x, y + 20);
  }

  const assigned = sim.tasks.filter(t => t.assignedTo && t.status !== 'completed');
  for (const task of assigned) {
    const p = task.status === 'picked' ? task.dropoff : task.pickup;
    const { x, y } = center(p);
    const pulse = .6 + .4 * Math.sin(now / 350);
    ctx.beginPath(); ctx.arc(x, y, 6 + pulse * 3, 0, Math.PI * 2);
    ctx.fillStyle = hexAlpha(task.status === 'picked' ? '#f8c77b' : '#68ead0', .09 + pulse * .08); ctx.fill();
    ctx.strokeStyle = hexAlpha(task.status === 'picked' ? '#f8c77b' : '#68ead0', .55); ctx.lineWidth = 1.3; ctx.stroke();
  }

  if (showRoutes) {
    for (const r of sim.robots) {
      if (r.route.length < 2 || r.status === 'failed') continue;
      const selected = selectedRobot === r.id;
      ctx.save(); ctx.beginPath();
      r.route.forEach((p, index) => { const q = center(p); index === 0 ? ctx.moveTo(q.x, q.y) : ctx.lineTo(q.x, q.y); });
      ctx.strokeStyle = hexAlpha(r.color, selected ? .95 : .43);
      ctx.lineWidth = selected ? 3 : 2;
      ctx.setLineDash(selected ? [8, 4] : [4, 5]); ctx.stroke(); ctx.restore();
    }
  }

  // Fleet agents. Shape and direction are deliberately distinct from rack and dock symbols.
  for (const robot of sim.robots) {
    const { x, y } = center(robot), offline = robot.status === 'failed', chosen = selectedRobot === robot.id;
    const color = offline ? '#ff7189' : robot.color;
    if (chosen) {
      ctx.beginPath(); ctx.arc(x, y, 20, 0, Math.PI * 2); ctx.strokeStyle = hexAlpha(color, .95); ctx.lineWidth = 1.4; ctx.stroke();
    }
    ctx.beginPath(); ctx.arc(x, y, 16, 0, 2 * Math.PI); ctx.fillStyle = hexAlpha(color, offline ? .16 : .10); ctx.fill();
    ctx.fillStyle = offline ? '#4b2737' : '#112c36'; ctx.strokeStyle = color; ctx.lineWidth = 2.2;
    roundedRect(ctx, x - 11.5, y - 11.5, 23, 23, 6); ctx.fill(); ctx.stroke();
    ctx.font = 'bold 11px ui-monospace,monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = offline ? '#ffb4c1' : '#ddfff8';
    ctx.fillText(offline ? '×' : String(Number(robot.id.slice(-2))), x, y + .5);
    if (!offline) {
      const headX = x + Math.cos(robot.heading) * 12, headY = y + Math.sin(robot.heading) * 12;
      ctx.beginPath(); ctx.arc(headX, headY, 2.5, 0, 2 * Math.PI); ctx.fillStyle = color; ctx.fill();
    } else {
      ctx.beginPath(); ctx.arc(x, y, 18 + Math.sin(now / 280) * 2, 0, Math.PI * 2);
      ctx.strokeStyle = '#ff718988'; ctx.lineWidth = 1; ctx.stroke();
    }
  }
  ctx.restore();
  ctx.strokeStyle = '#345268'; ctx.lineWidth = 1; ctx.strokeRect(MAP_PAD - .5, MAP_PAD - .5, WIDTH * MAP_CELL + 1, HEIGHT * MAP_CELL + 1);
}

function roundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
}
