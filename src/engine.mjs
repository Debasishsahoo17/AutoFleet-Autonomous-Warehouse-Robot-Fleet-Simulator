/** AutoFleet: deterministic, dependency-free discrete warehouse fleet simulator. */
export const WIDTH = 27;
export const HEIGHT = 19;
export const keyOf = (x, y) => `${x},${y}`;
export const distance = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

export function createWarehouse() {
  const shelves = new Set();
  const shelfBlocks = [];
  for (const x of [6, 11, 16, 21]) {
    for (const y of [3, 10]) {
      for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 5; dy++) shelves.add(keyOf(x + dx, y + dy));
      shelfBlocks.push({ x, y, w: 2, h: 5 });
    }
  }
  const stations = [
    { id: 'NORTH', x: 2, y: 9, name: 'North dock' },
    { id: 'WEST', x: 2, y: 14, name: 'West dock' },
    { id: 'EAST', x: 24, y: 4, name: 'East dock' },
    { id: 'SOUTH', x: 24, y: 14, name: 'South dock' },
  ];
  const chargers = [
    { x: 2, y: 1 }, { x: 3, y: 1 }, { x: 4, y: 1 }, { x: 23, y: 1 },
    { x: 24, y: 1 }, { x: 2, y: 17 }, { x: 3, y: 17 }, { x: 4, y: 17 },
    { x: 23, y: 17 }, { x: 24, y: 17 },
  ];
  const pickupPoints = [];
  for (const { x, y } of shelfBlocks) {
    for (let dy = 0; dy < 5; dy++) {
      pickupPoints.push({ x: x - 1, y: y + dy, shelf: `A${Math.floor(x / 5)}-${y === 3 ? 'N' : 'S'}` });
      pickupPoints.push({ x: x + 2, y: y + dy, shelf: `B${Math.floor(x / 5)}-${y === 3 ? 'N' : 'S'}` });
    }
  }
  return {
    width: WIDTH, height: HEIGHT, shelves, shelfBlocks, stations, chargers, pickupPoints,
    isWalkable(x, y) { return x >= 0 && x < WIDTH && y >= 0 && y < HEIGHT && !shelves.has(keyOf(x, y)); },
  };
}

const DIRS = [{ x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }];
/** A* search with dynamic blocked cells and multiple valid destination cells. */
export function findPath(grid, start, destinations, blocked = new Set()) {
  const goals = destinations.filter(p => grid.isWalkable(p.x, p.y) && !blocked.has(keyOf(p.x, p.y)));
  if (!goals.length) return null;
  const goalKeys = new Set(goals.map(p => keyOf(p.x, p.y)));
  const heuristic = p => Math.min(...goals.map(g => distance(p, g)));
  const startKey = keyOf(start.x, start.y);
  const open = [{ x: start.x, y: start.y, g: 0, f: heuristic(start) }];
  const bestG = new Map([[startKey, 0]]);
  const parents = new Map();
  const closed = new Set();
  while (open.length) {
    let best = 0;
    for (let i = 1; i < open.length; i++) if (open[i].f < open[best].f ||
      (open[i].f === open[best].f && open[i].g > open[best].g)) best = i;
    const node = open.splice(best, 1)[0];
    const nk = keyOf(node.x, node.y);
    if (closed.has(nk)) continue;
    if (goalKeys.has(nk)) {
      const path = [{ x: node.x, y: node.y }];
      let back = nk;
      while (back !== startKey) {
        back = parents.get(back);
        if (!back) return null;
        const [x, y] = back.split(',').map(Number);
        path.unshift({ x, y });
      }
      return path;
    }
    closed.add(nk);
    for (const delta of DIRS) {
      const nx = node.x + delta.x, ny = node.y + delta.y, nkey = keyOf(nx, ny);
      if (!grid.isWalkable(nx, ny) || blocked.has(nkey) || closed.has(nkey)) continue;
      const tentative = node.g + 1;
      if (tentative < (bestG.get(nkey) ?? Infinity)) {
        bestG.set(nkey, tentative);
        parents.set(nkey, nk);
        open.push({ x: nx, y: ny, g: tentative, f: tentative + heuristic({ x: nx, y: ny }) });
      }
    }
  }
  return null;
}

function rngFromSeed(seed) {
  let s = seed >>> 0;
  return () => {
    s += 0x6D2B79F5;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const palette = ['#54e9cd', '#75a4ff', '#fdbf70', '#c7a0ff', '#ff809b', '#a5e47b', '#64d3f8', '#f5a4eb', '#ffd46f', '#b9c9e9'];
const activeStatuses = new Set(['to_pickup', 'to_dropoff']);
const movingStatuses = new Set(['to_pickup', 'to_dropoff', 'to_charge']);
const startingSpots = [{ x: 2, y: 1 }, { x: 24, y: 17 }, { x: 3, y: 1 }, { x: 23, y: 17 }, { x: 24, y: 1 }, { x: 2, y: 17 }, { x: 4, y: 1 }, { x: 3, y: 17 }, { x: 23, y: 1 }, { x: 4, y: 17 }];

export class FleetSimulator {
  constructor(options = {}) {
    this.grid = createWarehouse();
    this.reset(options);
  }

  reset(options = {}) {
    this.options = { seed: 108, robotCount: 6, initialTasks: 10, autoTasks: true, mode: 'standard', ...this.options, ...options };
    const { seed, robotCount, initialTasks } = this.options;
    this.random = rngFromSeed(seed);
    this.tick = 0;
    this.taskSequence = 0;
    this.eventSequence = 0;
    this.messageCount = 0;
    this.blockedMoves = 0;
    this.totalDistance = 0;
    this.waitSteps = 0;
    this.history = [];
    this.events = [];
    this.robots = startingSpots.slice(0, Math.max(1, Math.min(10, robotCount))).map((p, i) => ({
      id: `AMR-${String(i + 1).padStart(2, '0')}`, name: `Robot ${String(i + 1).padStart(2, '0')}`,
      x: p.x, y: p.y, home: { ...p }, color: palette[i], status: 'idle',
      taskId: null, route: [], heading: 0, battery: 84 + Math.floor(this.random() * 16),
      distance: 0, completed: 0, waitTicks: 0, repairUntil: null, lastYield: -99,
    }));
    this.tasks = [];
    for (let i = 0; i < initialTasks; i++) this.addTask(1, { quiet: true });
    this.emit('SYSTEM', 'CONTROL', 'ALL', `${this.robots.length} autonomous robots connected · dispatch online`);
    this.updateHistory();
    return this;
  }

  emit(type, source, target, message) {
    this.messageCount++;
    this.events.unshift({ id: ++this.eventSequence, tick: this.tick, type, source, target, message });
    if (this.events.length > 90) this.events.length = 90;
  }

  addTask(count = 1, { quiet = false, priority = null } = {}) {
    const created = [];
    for (let i = 0; i < count; i++) {
      const pickup = this.grid.pickupPoints[Math.floor(this.random() * this.grid.pickupPoints.length)];
      const station = this.grid.stations[Math.floor(this.random() * this.grid.stations.length)];
      const roll = this.random();
      const task = {
        id: `JOB-${String(++this.taskSequence).padStart(3, '0')}`,
        pickup: { ...pickup }, dropoff: { ...station },
        priority: priority || (roll < .2 ? 'HIGH' : roll < .77 ? 'NORMAL' : 'LOW'),
        status: 'queued', assignedTo: null, createdTick: this.tick, assignedTick: null,
        pickedTick: null, completedTick: null,
      };
      this.tasks.push(task);
      created.push(task);
    }
    if (!quiet) this.emit('JOB_CREATED', 'WMS', 'DISPATCH', `${count} new ${count === 1 ? 'order' : 'orders'} received from warehouse system`);
    return created;
  }

  getTask(robot) { return this.tasks.find(t => t.id === robot.taskId); }

  /** Greedy fleet-wide auction: nearest eligible robot bids on high-priority queued work. */
  assignTasks() {
    const priorities = { HIGH: 0, NORMAL: 1, LOW: 2 };
    const queued = this.tasks.filter(t => t.status === 'queued')
      .sort((a, b) => priorities[a.priority] - priorities[b.priority] || a.createdTick - b.createdTick);
    const free = this.robots.filter(r => r.status === 'idle' && r.battery >= 16);
    for (const task of queued) {
      if (!free.length) break;
      let winner = null, lowest = Infinity;
      for (const robot of free) {
        const path = findPath(this.grid, robot, [task.pickup]);
        if (!path) continue;
        const bid = path.length - 1 + (100 - robot.battery) * .025;
        if (bid < lowest) { winner = robot; lowest = bid; }
      }
      if (!winner) continue;
      winner.taskId = task.id;
      winner.status = 'to_pickup';
      winner.waitTicks = 0;
      task.status = 'assigned';
      task.assignedTo = winner.id;
      task.assignedTick = this.tick;
      free.splice(free.indexOf(winner), 1);
      this.emit('TASK_ASSIGNED', 'DISPATCH', winner.id, `${task.id} allocated · ${task.priority.toLowerCase()} priority · bid ${lowest.toFixed(1)}`);
    }
  }

  failRobot(id, duration = 26) {
    const robot = this.robots.find(r => r.id === id);
    if (!robot || robot.status === 'failed') return false;
    if (robot.taskId) {
      const task = this.getTask(robot);
      if (task && task.status !== 'completed') {
        task.status = 'queued'; task.assignedTo = null; task.assignedTick = null; task.pickedTick = null;
        this.emit('JOB_REQUEUED', 'DISPATCH', 'ALL', `${task.id} returned to the auction queue`);
      }
    }
    robot.taskId = null;
    robot.status = 'failed';
    robot.route = [];
    robot.repairUntil = this.tick + Math.max(1, duration);
    this.emit('ROBOT_FAILURE', robot.id, 'FLEET', `Motor fault detected · physical location (${robot.x},${robot.y}) blocked`);
    return true;
  }

  failRandomRobot() {
    const candidates = this.robots.filter(r => r.status !== 'failed');
    if (!candidates.length) return null;
    const bot = candidates[Math.floor(this.random() * candidates.length)];
    this.failRobot(bot.id);
    return bot.id;
  }

  recoverRobot(id) {
    const robot = this.robots.find(r => r.id === id);
    if (!robot || robot.status !== 'failed') return false;
    robot.status = 'idle';
    robot.repairUntil = null;
    robot.battery = Math.max(robot.battery, 45);
    robot.waitTicks = 0;
    this.emit('ROBOT_RECOVERED', 'MAINTENANCE', robot.id, 'Health checks passed · returning to task auction');
    return true;
  }

  recoverAll() { return this.robots.filter(r => this.recoverRobot(r.id)).length; }

  destinationCells(point) {
    return [point, ...DIRS.map(d => ({ x: point.x + d.x, y: point.y + d.y }))]
      .filter(p => this.grid.isWalkable(p.x, p.y));
  }

  advanceWorkflow(robot) {
    const task = this.getTask(robot);
    if (!task) return;
    if (robot.status === 'to_pickup' && distance(robot, task.pickup) <= 1) {
      task.status = 'picked'; task.pickedTick = this.tick;
      robot.status = 'to_dropoff'; robot.route = [];
      this.emit('PICKUP_CONFIRMED', robot.id, 'DISPATCH', `${task.id} picked at ${task.pickup.shelf}`);
    }
    if (robot.status === 'to_dropoff' && distance(robot, task.dropoff) <= 1) {
      task.status = 'completed'; task.completedTick = this.tick;
      robot.completed++;
      robot.status = 'idle'; robot.taskId = null; robot.route = []; robot.waitTicks = 0;
      this.emit('JOB_COMPLETED', robot.id, 'WMS', `${task.id} delivered to ${task.dropoff.name} · ${this.tick - task.createdTick} ticks`);
    }
  }

  step() {
    this.tick++;
    for (const robot of this.robots) {
      if (robot.status === 'failed' && robot.repairUntil !== null && this.tick >= robot.repairUntil) this.recoverRobot(robot.id);
    }
    if (this.options.autoTasks && this.tick % (this.options.mode === 'rush' ? 6 : 12) === 0 &&
      this.tasks.filter(t => t.status !== 'completed').length < 17) this.addTask(this.options.mode === 'rush' ? 2 : 1);
    // Robots return to their individual charging pads between assignments.
    for (const robot of this.robots) {
      if (robot.status === 'charging') {
        robot.battery = Math.min(100, robot.battery + 4.5);
        if (robot.battery >= 95) {
          robot.status = 'idle';
          this.emit('CHARGE_COMPLETE', robot.id, 'DISPATCH', 'Battery replenished · available for new orders');
        }
      }
      if (robot.status === 'idle' && robot.battery <= 27) {
        robot.status = 'to_charge';
        this.emit('CHARGE_REQUEST', robot.id, 'ENERGY', 'Low battery · seeking assigned charging pad');
      }
      if (robot.status === 'to_charge' && distance(robot, robot.home) <= 1) {
        robot.status = 'charging'; robot.route = [];
        this.emit('CHARGE_STARTED', robot.id, 'ENERGY', 'Docked at autonomous charging pad');
      }
      this.advanceWorkflow(robot);
    }
    this.assignTasks();

    // Hard safety rule: a cell occupied at the start of a tick cannot be entered.
    // This rule also forbids head-on swaps and ensures failed robots act as obstacles.
    const occupied = new Map(this.robots.map(r => [keyOf(r.x, r.y), r.id]));
    const nextCells = new Set();
    const order = this.robots.filter(r => movingStatuses.has(r.status))
      .sort((a, b) => b.waitTicks - a.waitTicks || a.id.localeCompare(b.id));
    const proposals = [];
    for (const robot of order) {
      const task = this.getTask(robot);
      if (!task && robot.status !== 'to_charge') continue;
      const goal = robot.status === 'to_charge' ? robot.home : robot.status === 'to_pickup' ? task.pickup : task.dropoff;
      const blocked = new Set([...occupied.keys()].filter(k => k !== keyOf(robot.x, robot.y)));
      for (const reserved of nextCells) blocked.add(reserved);
      const path = findPath(this.grid, robot, this.destinationCells(goal), blocked);
      const optimal = findPath(this.grid, robot, this.destinationCells(goal));
      if (optimal?.length > 1 && blocked.has(keyOf(optimal[1].x, optimal[1].y))) {
        this.blockedMoves++;
        const blocker = occupied.get(keyOf(optimal[1].x, optimal[1].y)) || 'TRAFFIC';
        if (this.tick - robot.lastYield >= 7) {
          this.emit('YIELD_REQUEST', robot.id, blocker, `Route negotiation at aisle (${optimal[1].x},${optimal[1].y})`);
          robot.lastYield = this.tick;
        }
      }
      robot.route = path || [];
      if (path && path.length > 1) {
        nextCells.add(keyOf(path[1].x, path[1].y));
        proposals.push({ robot, next: path[1] });
      } else {
        robot.waitTicks++;
        this.waitSteps++;
        robot.battery = Math.max(0, robot.battery - .008);
      }
    }
    // Simultaneous commit: no robot may move to an occupied or reserved cell.
    for (const { robot, next } of proposals) {
      if (occupied.has(keyOf(next.x, next.y))) throw new Error(`Unsafe occupied destination for ${robot.id}`);
      robot.heading = Math.atan2(next.y - robot.y, next.x - robot.x);
      robot.x = next.x; robot.y = next.y;
      robot.distance++; this.totalDistance++;
      robot.battery = Math.max(0, robot.battery - .16);
      robot.waitTicks = 0;
    }
    for (const robot of order) {
      this.advanceWorkflow(robot);
      if (robot.status === 'to_charge' && distance(robot, robot.home) <= 1) {
        robot.status = 'charging'; robot.route = [];
        this.emit('CHARGE_STARTED', robot.id, 'ENERGY', 'Docked at autonomous charging pad');
      }
    }
    if (this.tick % 9 === 0) {
      const healthy = this.robots.filter(r => r.status !== 'failed');
      this.emit('HEARTBEAT', 'FLEET', 'DISPATCH', `${healthy.length}/${this.robots.length} robots reporting · ${this.tasks.filter(t => t.status === 'completed').length} deliveries complete`);
    }
    this.verifySafety();
    this.updateHistory();
    return this.metrics();
  }

  verifySafety() {
    const seen = new Set();
    for (const robot of this.robots) {
      const k = keyOf(robot.x, robot.y);
      if (!this.grid.isWalkable(robot.x, robot.y)) throw new Error(`${robot.id} on a shelf`);
      if (seen.has(k)) throw new Error(`Robot collision at ${k}`);
      seen.add(k);
    }
    for (const t of this.tasks.filter(t => t.status === 'completed')) {
      if (t.completedTick === null || !t.assignedTo) throw new Error(`Broken delivery state: ${t.id}`);
    }
    return true;
  }

  updateHistory() {
    const done = this.tasks.filter(t => t.status === 'completed').length;
    this.history.push({ tick: this.tick, completed: done, active: this.robots.filter(r => activeStatuses.has(r.status)).length });
    if (this.history.length > 160) this.history.shift();
  }

  metrics() {
    const completed = this.tasks.filter(t => t.status === 'completed');
    const avgDelivery = completed.length ? completed.reduce((sum, t) => sum + t.completedTick - t.createdTick, 0) / completed.length : 0;
    const busy = this.robots.filter(r => activeStatuses.has(r.status)).length;
    return {
      tick: this.tick, robots: this.robots.length, online: this.robots.filter(r => r.status !== 'failed').length,
      active: busy, failed: this.robots.filter(r => r.status === 'failed').length,
      queued: this.tasks.filter(t => t.status === 'queued').length,
      inProgress: this.tasks.filter(t => t.status === 'picked' || t.status === 'assigned').length,
      completed: completed.length, totalOrders: this.tasks.length,
      utilization: Math.round(100 * busy / Math.max(1, this.robots.filter(r => r.status !== 'failed').length)),
      avgDelivery: +avgDelivery.toFixed(1),
      avgBattery: Math.round(this.robots.reduce((sum, r) => sum + r.battery, 0) / this.robots.length),
      distance: this.totalDistance, safetyInterventions: this.blockedMoves,
      messages: this.messageCount, waitSteps: this.waitSteps,
      throughput: this.tasks.filter(t => t.status === 'completed' && t.completedTick > this.tick - 50).length,
    };
  }

  exportReport() {
    return {
      product: 'AutoFleet', version: '1.0.0', scenario: this.options.mode,
      seed: this.options.seed, generatedAt: new Date().toISOString(),
      metrics: this.metrics(),
      robots: this.robots.map(({ route, ...r }) => ({ ...r })),
      tasks: this.tasks.map(t => ({ ...t })),
      recentMessages: this.events.slice(0, 50),
    };
  }
}
