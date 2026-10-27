import assert from 'node:assert/strict';
import test from 'node:test';
import { FleetSimulator, createWarehouse, findPath, distance, keyOf } from '../src/engine.mjs';

test('warehouse has walkable aisles and impassable shelf blocks', () => {
  const grid = createWarehouse();
  assert.equal(grid.isWalkable(6, 3), false);
  assert.equal(grid.isWalkable(7, 7), false);
  assert.equal(grid.isWalkable(8, 3), true);
  assert.equal(grid.isWalkable(-1, 4), false);
  assert.equal(grid.pickupPoints.length, 80);
});

test('A* returns a valid adjacent path that never traverses racks', () => {
  const grid = createWarehouse();
  const route = findPath(grid, { x: 2, y: 4 }, [{ x: 24, y: 14 }]);
  assert.ok(route && route.length > 20);
  assert.deepEqual(route[0], { x: 2, y: 4 });
  assert.deepEqual(route.at(-1), { x: 24, y: 14 });
  for (let i = 0; i < route.length; i++) {
    assert.ok(grid.isWalkable(route[i].x, route[i].y));
    if (i) assert.equal(distance(route[i], route[i - 1]), 1);
  }
});

test('A* reroutes around obstacles and reports an unreachable target', () => {
  const grid = createWarehouse();
  const unblocked = findPath(grid, { x: 3, y: 8 }, [{ x: 3, y: 13 }]);
  const detour = findPath(grid, { x: 3, y: 8 }, [{ x: 3, y: 13 }], new Set(['3,9', '3,10', '3,11', '3,12']));
  assert.ok(detour.length > unblocked.length);
  assert.equal(findPath(grid, { x: 3, y: 8 }, [{ x: 3, y: 13 }], new Set([keyOf(3, 13)])), null);
});

test('dispatch allocates to nearest eligible robot, prioritizes high jobs', () => {
  const sim = new FleetSimulator({ seed: 1, robotCount: 2, initialTasks: 0, autoTasks: false });
  const [first] = sim.addTask(1, { quiet: true, priority: 'HIGH' });
  first.pickup = { x: 23, y: 16, shelf: 'TEST' };
  const [second] = sim.addTask(1, { quiet: true, priority: 'LOW' });
  second.pickup = { x: 3, y: 2, shelf: 'TEST' };
  sim.assignTasks();
  assert.equal(first.assignedTo, 'AMR-02');
  assert.equal(second.assignedTo, 'AMR-01');
  assert.equal(sim.robots.filter(r => r.status === 'to_pickup').length, 2);
});

test('fleet remains collision-free under heavy load for 1,500 ticks', () => {
  const sim = new FleetSimulator({ seed: 27, robotCount: 10, initialTasks: 40, autoTasks: true, mode: 'rush' });
  for (let i = 0; i < 1500; i++) {
    if (i % 85 === 0) sim.addTask(3);
    if (i % 130 === 40) sim.failRandomRobot();
    sim.step();
    sim.verifySafety();
    assert.equal(new Set(sim.robots.map(r => keyOf(r.x, r.y))).size, sim.robots.length);
  }
  const m = sim.metrics();
  assert.ok(m.completed > 0, 'must complete real jobs');
  assert.ok(m.safetyInterventions > 0, 'must actively negotiate congested paths');
  assert.ok(m.messages > 0);
});

test('a failed robot requeues its task; recovery restores dispatchability', () => {
  const sim = new FleetSimulator({ robotCount: 3, initialTasks: 5, autoTasks: false });
  sim.assignTasks();
  const bot = sim.robots.find(r => r.taskId);
  const oldTask = sim.getTask(bot);
  assert.equal(sim.failRobot(bot.id, 3), true);
  assert.equal(bot.status, 'failed');
  assert.equal(bot.taskId, null);
  assert.equal(oldTask.status, 'queued');
  assert.equal(oldTask.assignedTo, null);
  assert.equal(sim.failRobot(bot.id), false);
  sim.step(); sim.step(); sim.step();
  assert.notEqual(bot.status, 'failed');
  assert.equal(bot.repairUntil, null);
});

test('deterministic seed reproduces assignments and robot positions', () => {
  const opts = { seed: 123, robotCount: 5, initialTasks: 9, autoTasks: false };
  const a = new FleetSimulator(opts), b = new FleetSimulator(opts);
  for (let i = 0; i < 85; i++) { a.step(); b.step(); }
  assert.deepEqual(a.robots, b.robots);
  assert.deepEqual(a.tasks, b.tasks);
  assert.deepEqual(a.metrics(), b.metrics());
});

test('completed jobs preserve assignment, pickup, and completion timestamp', () => {
  const sim = new FleetSimulator({ seed: 108, robotCount: 6, initialTasks: 13, autoTasks: false });
  for (let i = 0; i < 250; i++) sim.step();
  const complete = sim.tasks.filter(t => t.status === 'completed');
  assert.ok(complete.length >= 3, `only ${complete.length} deliveries in 250 ticks`);
  for (const task of complete) {
    assert.ok(task.assignedTo);
    assert.ok(task.pickedTick !== null);
    assert.ok(task.completedTick >= task.pickedTick);
  }
  assert.equal(sim.metrics().completed, complete.length);
});

test('JSON report contains metrics, all tasks, and communication events', () => {
  const sim = new FleetSimulator({ initialTasks: 3 });
  sim.step();
  const report = sim.exportReport();
  assert.equal(report.product, 'AutoFleet');
  assert.equal(report.tasks.length, 3);
  assert.equal(report.robots.length, 6);
  assert.ok(report.recentMessages.length > 0);
  assert.ok(JSON.parse(JSON.stringify(report)).metrics);
});

test('low battery robots dock, recharge, and rejoin dispatch', () => {
  const sim = new FleetSimulator({ robotCount: 1, initialTasks: 0, autoTasks: false });
  const robot = sim.robots[0];
  robot.battery = 20;
  sim.step();
  assert.equal(robot.status, 'charging');
  for (let i = 0; i < 20; i++) sim.step();
  assert.equal(robot.status, 'idle');
  assert.ok(robot.battery >= 95);
  assert.ok(sim.events.some(event => event.type === 'CHARGE_COMPLETE'));
});
