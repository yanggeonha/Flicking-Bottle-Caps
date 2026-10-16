const test = require('node:test');
const assert = require('node:assert/strict');
const { TABLE, resolveCollision, simulateShot } = require('../physics');

function player(id, x, y, finished = false) {
  return { id, position: { x, y }, finished, out: false, angle: 0 };
}

test('contact transfers momentum to both caps and scales with incoming speed', () => {
  function hit(speed) {
    const a = { x: 0, y: 0, vx: 0, vy: speed }, b = { x: 20, y: 50, vx: 0, vy: 0 };
    resolveCollision(a, b);
    assert.ok(a.vx < 0 && b.vx > 0, 'glancing impact deflects both caps');
    assert.ok(Math.abs(a.vy + b.vy - speed) < 1e-8, 'momentum is conserved');
    assert.ok(a.vx*a.vx+a.vy*a.vy+b.vx*b.vx+b.vy*b.vy <= speed*speed+1e-8);
    return { a, b };
  }
  const low = hit(200), high = hit(600);
  assert.ok(Math.abs(high.b.vy / low.b.vy - 3) < 1e-8);
});

test('fast moving cap hits a resting opponent without tunneling through it', () => {
  const result = simulateShot([player('shot', 330, 0), player('target', 330, 400, true)], 'shot', .7);
  assert.ok(result.collisions.length > 0);
  const target = result.results.find(p => p.id === 'target');
  const shot = result.results.find(p => p.id === 'shot');
  assert.ok(target.position.y > 400);
  assert.ok(shot.position.y < target.position.y);
  assert.ok(result.frames.length > 10);
  assert.equal(result.frames.at(-1).t, result.duration);
});

test('an aimed shot can hit an opponent in the adjacent starting lane', () => {
  const result = simulateShot([player('shot', 362, 0), player('target', 298, 400, true)], 'shot', .6, -.16);
  assert.ok(result.collisions.length > 0);
  assert.ok(result.results.find(p => p.id === 'target').position.y > 400);
});

test('an opponent can be knocked out past the top edge', () => {
  const result = simulateShot([player('shot', 330, 0), player('target', 330, TABLE.edge - 40, true)], 'shot', 1);
  assert.ok(result.collisions.length > 0);
  assert.equal(result.results.find(p => p.id === 'target').out, true);
});

test('chain collisions move multiple opponents and leave no overlapping settled caps', () => {
  const result = simulateShot([player('shot', 330, 0), player('a', 330, 300, true), player('b', 330, 365, true)], 'shot', .8);
  assert.ok(result.results.find(p => p.id === 'a').position.y > 300);
  assert.ok(result.results.find(p => p.id === 'b').position.y > 365);
  const alive = result.results.filter(p => !p.out);
  for(let i=0;i<alive.length;i++) for(let j=i+1;j<alive.length;j++) {
    assert.ok(Math.hypot(alive[i].position.x-alive[j].position.x,alive[i].position.y-alive[j].position.y) >= TABLE.radius*2-.02);
  }
});

test('waiting and eliminated caps do not participate in a shot', () => {
  const gone = { ...player('gone', 330, 200, true), out: true };
  const result = simulateShot([player('shot', 330, 0), player('waiting', 330, 200), gone], 'shot', .5);
  assert.deepEqual(result.results.map(p => p.id), ['shot']);
  assert.ok(Math.abs(result.results[0].distance - 62.5) < .01);
});

test('power stays proportional without a collision, strong and sideways shots can fall', () => {
  const low = simulateShot([player('shot', 330, 0)], 'shot', .2);
  const high = simulateShot([player('shot', 330, 0)], 'shot', .6);
  assert.ok(Math.abs(high.results[0].distance / low.results[0].distance - 3) < .001);
  assert.equal(simulateShot([player('shot', 330, 0)], 'shot', 1).results[0].out, true);
  assert.equal(simulateShot([player('shot', 330, 0)], 'shot', 1, .85).results[0].out, true);
});
