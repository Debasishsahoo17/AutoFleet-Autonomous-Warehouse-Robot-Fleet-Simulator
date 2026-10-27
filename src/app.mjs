import { FleetSimulator } from './engine.mjs';
import { paintWarehouse, hitTestRobot } from './render.mjs';

const $ = id => document.getElementById(id);
const simOptions = {
  standard: { seed: 108, robotCount: 6, initialTasks: 12, autoTasks: true, mode: 'standard' },
  rush: { seed: 752, robotCount: 9, initialTasks: 24, autoTasks: true, mode: 'rush' },
  failure: { seed: 331, robotCount: 7, initialTasks: 15, autoTasks: true, mode: 'failure' },
};
let scenario = 'standard';
let sim = new FleetSimulator(simOptions[scenario]);
let playing = false, speed = 1, lastFrame = 0, accumulator = 0;
let selectedRobot = 'AMR-01';
let showRoutes = true;
let drillTriggered = false;
const canvas = $('warehouse-canvas');
const safe = s => String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
const statusLabel = status => ({ idle: 'IDLE', to_pickup: 'PICKUP', to_dropoff: 'DELIVERY', failed: 'OFFLINE', to_charge: 'TO DOCK', charging: 'CHARGING' })[status] ?? status.toUpperCase();
const simTime = tick => {
  const s = tick;
  return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

function updatePlayButton() {
  $('play-label').textContent = playing ? 'Pause simulation' : 'Start simulation';
  $('play-icon').textContent = playing ? 'Ⅱ' : '▶';
  $('run-state').textContent = playing ? 'SIMULATION RUNNING' : (sim.tick ? 'SIMULATION PAUSED' : 'SYSTEM STANDBY');
  $('map-status').textContent = playing ? 'LIVE TRACKING' : (sim.tick ? 'PAUSED' : 'STANDBY');
  document.querySelector('.pulse-dot').classList.toggle('paused', !playing);
}

function refresh() {
  const m = sim.metrics();
  const values = {
    elapsed: simTime(m.tick), 'metric-completed': m.completed, 'metric-throughput': `${m.throughput} in last 50 ticks`,
    'metric-active': m.active, 'metric-total-robots': m.robots, 'metric-utilization': `${m.utilization}% utilization`,
    'metric-failed': `${m.failed} offline`, 'metric-delivery': m.completed ? m.avgDelivery : '—',
    'metric-safety': m.safetyInterventions, 'metric-distance': m.distance,
    'metric-battery': m.avgBattery, 'metric-messages': m.messages, 'fleet-count': m.robots,
    'queue-count': m.queued, 'orders-queued': m.queued, 'orders-progress': m.inProgress,
    'orders-completed': m.completed,
  };
  for (const [id, value] of Object.entries(values)) $(id).textContent = value;
  $('chart-total').innerHTML = `${m.completed} <small>total</small>`;
  updateRobotList(); updateOrderList(); updateEventList(); updateSelectedRobot(); drawChart(); updatePlayButton();
}

function updateRobotList() {
  const holder = $('fleet-list');
  holder.innerHTML = sim.robots.map(robot => {
    const active = robot.status === 'to_pickup' || robot.status === 'to_dropoff';
    const statusClass = robot.status === 'failed' ? 'status-failed' : active ? 'status-active' : (robot.status === 'to_charge' || robot.status === 'charging') ? 'status-other' : 'status-idle';
    const color = robot.status === 'failed' ? '#ff809b' : robot.color;
    const batt = Math.round(robot.battery);
    return `<button class="robot-row ${selectedRobot === robot.id ? 'selected' : ''}" data-robot="${robot.id}" aria-label="Inspect ${robot.id}">
      <span class="robot-avatar" style="color:${color};border-color:${color}66;background:${color}15">${robot.id.slice(-2)}</span>
      <span class="robot-info"><span class="robot-info-main"><strong>${robot.id}</strong><span class="status-pill ${statusClass}">${statusLabel(robot.status)}</span></span>
      <span class="robot-info-meta"><span>${robot.taskId || (robot.status === 'failed' ? 'Maintenance required' : 'Awaiting assignment')}</span><span>${batt}%</span></span>
      <span class="battery-track"><span class="battery-fill ${batt < 20 ? 'critical' : batt < 45 ? 'low' : ''}" style="display:block;width:${batt}%"></span></span></span></button>`;
  }).join('');
}

function updateSelectedRobot() {
  const r = sim.robots.find(bot => bot.id === selectedRobot);
  if (!r) { $('robot-detail').textContent = 'Select a robot to inspect its current mission.'; return; }
  const task = sim.getTask(r);
  const location = `(${r.x}, ${r.y})`;
  const mission = task ? `<span class="detail-link">${safe(task.id)}</span> · ${r.status === 'to_pickup' ? 'en route to pickup' : 'transporting to delivery dock'}` : (r.status === 'failed' ? 'maintenance intervention pending' : r.status === 'to_charge' ? 'heading to charging dock' : r.status === 'charging' ? 'charging at home dock' : 'standing by for next task');
  $('robot-detail').innerHTML = `<strong>${safe(r.id)}</strong> at ${location} · ${Math.round(r.battery)}% battery<br>${mission}<br>Travel: <strong>${r.distance} cells</strong> · Deliveries: <strong>${r.completed}</strong>`;
}

function updateOrderList() {
  const queued = sim.tasks.filter(t => t.status !== 'completed');
  const rank = { picked: 0, assigned: 1, queued: 2 };
  const priority = { HIGH: 0, NORMAL: 1, LOW: 2 };
  const display = queued.sort((a, b) => rank[a.status] - rank[b.status] || priority[a.priority] - priority[b.priority] || a.createdTick - b.createdTick).slice(0, 7);
  $('orders-list').innerHTML = display.length ? display.map(t => {
    const label = t.status === 'picked' ? 'In transit' : t.status === 'assigned' ? 'To pickup' : 'Awaiting robot';
    const progress = t.status === 'picked' ? 72 : t.status === 'assigned' ? 33 : 3;
    return `<div class="order-item"><div class="order-top"><strong>${t.id}</strong><span class="priority priority-${t.priority}">${t.priority}</span></div>
      <div class="order-bottom"><span>${safe(t.pickup.shelf)} → ${safe(t.dropoff.id)}</span><span>${label}</span></div>
      <div class="order-progress"><span style="width:${progress}%"></span></div></div>`;
  }).join('') : `<p style="color:#91a5b7;font-size:11px;padding:12px">All queued orders dispatched. Add a task to keep the fleet moving.</p>`;
}

function updateEventList() {
  const styles = { ROBOT_FAILURE: 'alert', ROBOT_RECOVERED: 'success', JOB_COMPLETED: 'success', PICKUP_CONFIRMED: 'success', YIELD_REQUEST: 'warning', JOB_REQUEUED: 'warning' };
  $('event-list').innerHTML = sim.events.slice(0, 10).map(event => `<div class="event-row">
    <span class="event-time">${simTime(event.tick)}</span>
    <span class="event-type ${styles[event.type] || ''}">${safe(event.type.replace(/_/g, ' '))}</span>
    <span class="event-from">${safe(event.source)} → ${safe(event.target)}</span>
    <span class="event-message" title="${safe(event.message)}">${safe(event.message)}</span>
  </div>`).join('');
}

function drawChart() {
  const svg = $('performance-chart');
  const points = sim.history;
  const max = Math.max(3, ...points.map(p => p.completed));
  let path = 'M 0 100';
  for (let i = 0; i < points.length; i++) {
    const x = points.length <= 1 ? 0 : i / (points.length - 1) * 600;
    const y = 99 - points[i].completed / max * 87;
    path += ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
  }
  const endY = 99 - points[points.length - 1].completed / max * 87;
  svg.innerHTML = `<defs><linearGradient id="chart-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#5de7cb" stop-opacity=".25"/><stop offset="100%" stop-color="#5de7cb" stop-opacity=".005"/></linearGradient></defs>
    <path d="M0 13 H600 M0 42 H600 M0 71 H600 M0 99 H600" stroke="#2b4253" stroke-width=".8" fill="none" stroke-dasharray="3 6"/>
    <path d="${path} L 600 104 L0 104 Z" fill="url(#chart-fill)" />
    <path d="${path}" fill="none" stroke="#5de7cb" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="600" cy="${endY.toFixed(1)}" r="4" fill="#5de7cb" stroke="#153c38" stroke-width="2"/>`;
}

function toast(message, alert = false) {
  const el = document.createElement('div');
  el.className = `toast ${alert ? 'alert' : ''}`;
  el.textContent = message;
  $('toast').append(el);
  setTimeout(() => el.remove(), 3200);
}

function applyScenario(next) {
  playing = false;
  scenario = next;
  sim = new FleetSimulator(simOptions[next]);
  sim.assignTasks();
  selectedRobot = sim.robots[0].id;
  accumulator = 0;
  drillTriggered = false;
  refresh();
  toast(next === 'rush' ? 'Peak-hour demand scenario loaded' : next === 'failure' ? 'Failure drill armed · fault at tick 12' : 'Standard operations initialized');
}

function stepOnce() {
  if (scenario === 'failure' && !drillTriggered && sim.tick === 11) {
    const victim = sim.robots.find(r => r.taskId) || sim.robots[0];
    sim.failRobot(victim.id, 24);
    drillTriggered = true;
    toast(`${victim.id} lost communication. Dispatch rerouting tasks.`, true);
  }
  sim.step();
  refresh();
}

$('play-button').addEventListener('click', () => { playing = !playing; accumulator = 0; lastFrame = performance.now(); updatePlayButton(); });
$('step-button').addEventListener('click', () => { playing = false; stepOnce(); });
$('reset-button').addEventListener('click', () => applyScenario(scenario));
$('scenario-select').addEventListener('change', e => applyScenario(e.target.value));
$('speed-control').addEventListener('input', e => { speed = Number(e.target.value); $('speed-value').textContent = `${speed}×`; });
$('routes-toggle').addEventListener('change', e => { showRoutes = e.target.checked; });
$('add-task-button').addEventListener('click', () => { sim.addTask(); sim.assignTasks(); refresh(); toast('New order sent to fleet dispatcher'); });
$('fail-button').addEventListener('click', () => {
  const id = (sim.robots.find(r => r.id === selectedRobot && r.status !== 'failed') ||
    sim.robots.find(r => r.status !== 'failed'))?.id;
  if (!id) { toast('All robots are already offline', true); return; }
  sim.failRobot(id);
  refresh(); toast(`${id} offline — mission returned to queue`, true);
});
$('recover-button').addEventListener('click', () => {
  const count = sim.recoverAll();
  sim.assignTasks(); refresh(); toast(count ? `${count} robot${count === 1 ? '' : 's'} recovered` : 'No offline robots to recover');
});
$('export-button').addEventListener('click', () => {
  const report = JSON.stringify(sim.exportReport(), null, 2);
  const url = URL.createObjectURL(new Blob([report], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url;
  a.download = `autofleet-report-${scenario}-tick-${sim.tick}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('Simulation report exported');
});
$('fleet-list').addEventListener('click', e => {
  const el = e.target.closest('[data-robot]');
  if (el) { selectedRobot = el.dataset.robot; refresh(); }
});
canvas.addEventListener('click', e => {
  const found = hitTestRobot(canvas, e, sim.robots);
  if (found) { selectedRobot = found.id; refresh(); }
});
$('help-button').addEventListener('click', () => $('help-dialog').showModal());
$('help-close').addEventListener('click', () => $('help-dialog').close());
$('help-dialog').addEventListener('click', e => { if (e.target.id === 'help-dialog') $('help-dialog').close(); });

document.addEventListener('keydown', e => {
  if (e.code === 'Space' && !['INPUT', 'BUTTON', 'SELECT'].includes(document.activeElement?.tagName) && !$('help-dialog').open) {
    e.preventDefault(); playing = !playing; accumulator = 0; updatePlayButton();
  }
});
function frame(now) {
  if (playing) {
    accumulator += Math.min(1000, now - (lastFrame || now));
    const tickMs = 550 / speed;
    let steps = 0;
    while (accumulator >= tickMs && steps++ < 6) { stepOnce(); accumulator -= tickMs; }
    if (steps >= 6) accumulator = 0;
  }
  lastFrame = now;
  paintWarehouse(canvas, sim, { selectedRobot, showRoutes, now });
  requestAnimationFrame(frame);
}
applyScenario('standard');
requestAnimationFrame(frame);
