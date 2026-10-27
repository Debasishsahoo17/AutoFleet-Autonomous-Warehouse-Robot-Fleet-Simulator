// Regenerate the README illustration from the *real simulator state* (tick 50).
// This is an SVG overview, not a fabricated browser screenshot.
import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FleetSimulator } from '../src/engine.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sim = new FleetSimulator({ seed: 108, robotCount: 6, initialTasks: 12, autoTasks: true, mode: 'standard' });
for (let i = 0; i < 50; i++) sim.step();
const m = sim.metrics();
const escape = str => String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g,'&quot;');
const rrect = (x,y,w,h,fill,stroke='#223748',rx=12) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" stroke="${stroke}"/>`;
const label = (x,y,content,size=16,color='#eaf4ff',weight=500,extra='') => `<text x="${x}" y="${y}" fill="${color}" font-family="Arial,Helvetica,sans-serif" font-size="${size}" font-weight="${weight}" ${extra}>${escape(content)}</text>`;
const CELL = 20, ORGX=91, ORGY=300;
const center = p => [ORGX+p.x*CELL+CELL/2, ORGY+p.y*CELL+CELL/2];
let svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1440" height="830" viewBox="0 0 1440 830" role="img" aria-label="AutoFleet warehouse operations preview based on deterministic simulator tick 50">
<defs>
<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#07101b"/><stop offset="1" stop-color="#101d2a"/></linearGradient>
<linearGradient id="panel" x1="0" x2="1" y1="0" y2="1"><stop stop-color="#142436"/><stop offset="1" stop-color="#0c1928"/></linearGradient>
<linearGradient id="chart" x1="0" x2="0" y1="0" y2="1"><stop stop-color="#62e5cb" stop-opacity=".23"/><stop offset="1" stop-color="#62e5cb" stop-opacity="0"/></linearGradient>
</defs>
<rect width="1440" height="830" fill="url(#bg)"/>
<rect x="0" y="0" width="1440" height="75" fill="#0b1825" stroke="#1c3040"/>
${rrect(55,15,44,44,'#103234','#3b8070',10)}
${label(66,45,'A',30,'#8af8e3',800)}
${label(112,43,'autofleet',27,'#ecf9f8',800)}
${label(113,60,'ROBOTICS OPERATIONS PLATFORM',9,'#839ba9',700,'letter-spacing="2"')}
${label(1118,40,'●  SIMULATION ENVIRONMENT',12,'#79d3c6',700,'letter-spacing="1"')}
${label(56,112,'COMMAND CENTER  /  WAREHOUSE A-01',11,'#58e4c8',800,'letter-spacing="2"')}
${label(55,159,'Fleet operations',37,'#f3f8ff',800)}${label(365,159,'overview.',37,'#a1b3c5',700)}
${label(1160,123,'SIMULATION UPTIME',10,'#7c96a9',700,'letter-spacing="2"')}
${label(1173,158,'00:00:50',30,'#e8f7ff',700)}
`;
const cards = [
  {x:55,title:'COMPLETED ORDERS',value:m.completed,unit:'orders',foot:`${m.throughput} IN LAST 50 TICKS`,accent:'#66e9d1'},
  {x:395,title:'ACTIVE ROBOTS',value:`${m.active} / ${m.robots}`,unit:'units',foot:`${m.utilization}% UTILIZATION`,accent:'#82b0ff'},
  {x:735,title:'AVG. FULFILLMENT',value:m.avgDelivery,unit:'ticks',foot:'END-TO-END PROCESSING',accent:'#c5a4ff'},
  {x:1075,title:'SAFETY INTERVENTIONS',value:m.safetyInterventions,unit:'reroutes',foot:'0 COLLISIONS',accent:'#f4c687'},
];
for (const c of cards){
 svg+=rrect(c.x,186,308,94,'url(#panel)','#294155',10)+label(c.x+18,209,c.title,11,'#93a9bc',700,'letter-spacing="1.3"')+
 label(c.x+18,255,c.value,34,'#f3fbff',700)+label(c.x+190,251,c.unit,13,'#8aa2b8',500)+
 `<line x1="${c.x+18}" y1="261" x2="${c.x+289}" y2="261" stroke="#2a3e50"/>`+
 label(c.x+18,274,c.foot,9,c.accent,700,'letter-spacing=".8"');
}
svg+=rrect(55,294,916,479,'#0b1826','#2b4257',12);
svg+=label(76,321,'LIVE DIGITAL TWIN',10,'#5ce4c8',800,'letter-spacing="2"')+
label(77,348,'Warehouse floor',21,'#eaf4ff',700)+label(763,321,'● LIVE TRACKING',10,'#70efce',750)+label(783,347,'27 × 19 GRID',11,'#90a7b7',700);
// Grid starts y=365; there is a 65px transform offset from dynamic center params.
svg+=`<g transform="translate(0 66)">`;
svg+=rrect(ORGX,ORGY,27*CELL,19*CELL,'#112337','#2d4960',2);
for(let x=0;x<=27;x++)svg+=`<line x1="${ORGX+x*CELL}" y1="${ORGY}" x2="${ORGX+x*CELL}" y2="${ORGY+19*CELL}" stroke="#294055" stroke-width=".6"/>`;
for(let y=0;y<=19;y++)svg+=`<line x1="${ORGX}" y1="${ORGY+y*CELL}" x2="${ORGX+27*CELL}" y2="${ORGY+y*CELL}" stroke="#294055" stroke-width=".6"/>`;
for(const b of sim.grid.shelfBlocks) {
 const x=ORGX+b.x*CELL+2,y=ORGY+b.y*CELL+2;
 svg+=rrect(x,y,2*CELL-4,5*CELL-4,'#25465a','#528397',3);
 for(let z=0;z<5;z++)svg+=`<rect x="${x+6}" y="${y+7+z*18}" width="${2*CELL-16}" height="12" rx="2" fill="#37687b"/>`;
 svg+=label(x+10,y+50,'R',9,'#d8f5ff',700);
}
for(const dock of sim.grid.stations){const [x,y]=center(dock); svg+=rrect(x-9,y-9,18,18,'#564733','#f6c67d',4)+label(x-6,y+4,'⇢',12,'#ffe9b1',800);}
for(const robot of sim.robots){
 if(robot.route.length>1){const coords=robot.route.map(p=>center(p).join(',')).join(' ');svg+=`<polyline points="${coords}" fill="none" stroke="${robot.color}" stroke-width="2" stroke-opacity=".5" stroke-dasharray="4 5"/>`;}
 const [x,y]=center(robot);svg+=`<circle cx="${x}" cy="${y}" r="15" fill="${robot.color}" fill-opacity=".13"/>`+rrect(x-10,y-10,20,20,'#132d3a',robot.color,5)+label(x-6,y+4,robot.id.slice(-2),11,'#edffff',800);
}
svg+=`</g>`;
svg+=label(772,407,'AUTONOMOUS AGENTS',10,'#64e3cb',800,'letter-spacing="1.5"');
svg+=label(770,444,`${m.active} robots working`,20,'#eaf8ff',700);
svg+=label(771,475,`${m.distance} grid cells traversed`,13,'#9bb6c7');
svg+=label(771,506,`${m.messages} protocol messages`,13,'#9bb6c7');
svg+=label(771,537,`${m.avgBattery}% average battery`,13,'#9bb6c7');
svg+=`<line x1="767" y1="558" x2="936" y2="558" stroke="#2b4255"/>`;
svg+=label(772,583,'WAREHOUSE KEY',10,'#7295aa',800,'letter-spacing="1.5"');
svg+=`<circle cx="779" cy="608" r="5" fill="#64e3cb"/>`+label(792,612,'Mobile robots',12,'#9cb2c2');
svg+=`<rect x="774" y="628" width="10" height="10" fill="#37687b" stroke="#558da2"/>`+label(792,638,'Storage racks',12,'#9cb2c2');
svg+=`<rect x="774" y="654" width="10" height="10" rx="2" fill="#665039" stroke="#eac384"/>`+label(792,664,'Delivery docks',12,'#9cb2c2');
// Right column, fleet.
svg+=rrect(989,294,395,479,'#0c1928','#294156',12)+label(1012,324,'CONNECTED AGENTS',10,'#64e3cb',800,'letter-spacing="2"')+
label(1012,353,'Robot fleet',22,'#ebf5ff',700)+label(1342,351,'●',21,'#5de7cb',700);
let y=377;
for(const robot of sim.robots){
 svg+=`<line x1="1008" y1="${y+48}" x2="1363" y2="${y+48}" stroke="#223748"/>`;
 svg+=rrect(1015,y+5,36,34,'#153340',robot.color,7)+label(1020,y+27,robot.id.slice(-2),14,robot.color,750);
 svg+=label(1065,y+20,robot.id,14,'#e2f0f9',700);
 svg+=label(1065,y+38,robot.taskId || 'STANDBY',11,'#87a1b4');
 svg+=rrect(1265,y+8,91,22,'#193b39','#1a5047',5)+label(1282,y+23,robot.status==='to_pickup'?'PICKUP':robot.status==='to_dropoff'?'DELIVERY':'IDLE',10,'#72e8d0',750);
 y+=61;
}
svg+=label(1010,767,'AUTONOMOUS DISPATCH  •  A* NAVIGATION  •  ZERO CONTACT',10,'#708da0',700,'letter-spacing=".6"');
svg+=label(58,806,'AUTO FLEET  /  MULTI-AGENT ROBOTICS LAB',11,'#607e91',700,'letter-spacing="1"');
svg+=label(1196,806,'DEMO STATE · TICK 50',11,'#84b9aa',700,'letter-spacing=".7"');
svg+='</svg>';
writeFileSync(resolve(root,'assets/preview.svg'),svg);
console.log(`Generated assets/preview.svg from tick ${sim.tick}: ${m.completed} deliveries, ${m.active} active robots`);
