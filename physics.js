// Server-authoritative tabletop physics, in logical table units.
const TABLE = Object.freeze({ width: 660, edge: 1112.6, back: -369, radius: 29 });
const DT = 1 / 120;
const FRICTION = 800;
const RESTITUTION = 0.9;

function startPosition(index, count) {
  return { x: TABLE.width / 2 + (index - (count - 1) / 2) * 64, y: 0 };
}

function resolveCollision(a, b) {
  if (a.out || b.out) return 0;
  const dx = b.x - a.x, dy = b.y - a.y;
  const distance = Math.hypot(dx, dy);
  if (distance >= TABLE.radius * 2) return 0;
  const nx = distance > 0.0001 ? dx / distance : 1;
  const ny = distance > 0.0001 ? dy / distance : 0;
  const overlap = (TABLE.radius * 2 - distance + 0.001) / 2;
  a.x -= nx * overlap; a.y -= ny * overlap;
  b.x += nx * overlap; b.y += ny * overlap;
  const closing = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
  if (closing <= 0) return 0;
  // Equal masses: apply equal and opposite impulses along the contact normal.
  const impulse = (1 + RESTITUTION) * closing / 2;
  a.vx -= impulse * nx; a.vy -= impulse * ny;
  b.vx += impulse * nx; b.vy += impulse * ny;
  return closing;
}

function simulateShot(players, shooterId, power, aim = 0) {
  power = Math.max(0.08, Math.min(1, Number(power) || 0));
  aim = Math.max(-0.85, Math.min(0.85, Number(aim) || 0));
  const bodies = players.filter(p => !p.out && (p.finished || p.id === shooterId)).map(p => ({
    id: p.id, x: p.position.x, y: p.position.y, vx: 0, vy: 0,
    out: false, outAt: null, angle: p.angle || 0
  }));
  const shooter = bodies.find(b => b.id === shooterId);
  if (!shooter) throw new Error('Shooter must be on the table');
  const speed = Math.sqrt(2 * FRICTION * TABLE.edge * 1.25 * power);
  shooter.vy = speed / Math.hypot(1, aim);
  shooter.vx = shooter.vy * aim;
  const frames = [], collisions = [];
  const capture = t => frames.push({ t: Math.round(t * 1000), bodies: bodies.map(b => ({
    id: b.id, x: b.x, y: b.y, angle: b.angle, out: b.out,
    fade: b.out ? Math.min(1, (t - b.outAt) / 0.4) : 0
  })) });
  capture(0);
  let time = 0;
  for (let step = 1; step <= 120 * 8; step++) {
    time = step * DT;
    for (const b of bodies) {
      const v = Math.hypot(b.vx, b.vy);
      if (v === 0) continue;
      const next = Math.max(0, v - FRICTION * DT);
      const travel = (v + next) / 2 * DT;
      b.x += b.vx / v * travel; b.y += b.vy / v * travel;
      b.angle += travel / TABLE.radius * 25;
      b.vx *= next / v; b.vy *= next / v;
    }
    for (let i = 0; i < bodies.length; i++) {
      for (let j = i + 1; j < bodies.length; j++) {
        const impact = resolveCollision(bodies[i], bodies[j]);
        if (impact > 1) collisions.push({ t: Math.round(time * 1000), a: bodies[i].id, b: bodies[j].id, speed: impact });
      }
    }
    for (const b of bodies) {
      if (!b.out && (b.x < 0 || b.x > TABLE.width || b.y > TABLE.edge || b.y < TABLE.back)) {
        b.out = true; b.outAt = time;
      }
      if (b.out && time - b.outAt >= 0.4) { b.vx = 0; b.vy = 0; }
    }
    const stopped = bodies.every(b => Math.hypot(b.vx, b.vy) < 0.01 && (!b.out || time - b.outAt >= 0.4));
    if (step % 4 === 0 || stopped) capture(time);
    if (stopped) break;
  }
  return {
    frames, collisions, duration: Math.round(time * 1000),
    results: bodies.map(b => ({ id: b.id, position: { x: b.x, y: b.y },
      distance: b.y / TABLE.edge * 100, out: b.out, angle: b.angle }))
  };
}

module.exports = { TABLE, startPosition, resolveCollision, simulateShot };
