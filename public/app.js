const socket = io();
const caps = [
  { id:'pepsi', name:'펩시', short:'PEPSI', color:'#1457a6' },
  { id:'cider', name:'칠성사이다', short:'칠성', color:'#15955b' },
  { id:'samdasoo', name:'삼다수', short:'제주', color:'#28a9df' },
  { id:'coke', name:'코카콜라', short:'COKE', color:'#d51e2b' },
  { id:'evian', name:'에비앙', short:'evian', color:'#ef7894' }
];
const $ = s => document.querySelector(s);
let mode = 'create', selectedCap = caps[0].id, state = null, dragging = false, power = 0;
let activeDrag = null, flying = false, pendingShot = false;
let playback = null, geometry = null;

function capInfo(id){ return caps.find(c => c.id === id) || caps[0]; }
function capHtml(id, cls='mini-cap'){ const c=capInfo(id); return `<div class="${cls}" style="background:${c.color}">${c.short}</div>`; }
$('#capPicker').innerHTML = caps.map((c,i)=>`<button class="cap-option ${i?'':'active'}" data-cap="${c.id}">${capHtml(c.id)}${c.name}</button>`).join('');
$('#capPicker').onclick = e => { const b=e.target.closest('.cap-option'); if(!b)return; selectedCap=b.dataset.cap; document.querySelectorAll('.cap-option').forEach(x=>x.classList.toggle('active',x===b)); };
document.querySelectorAll('.tab').forEach(tab=>tab.onclick=()=>{ mode=tab.dataset.tab; document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('active',x===tab)); $('#pinField').classList.toggle('hidden',mode==='create'); $('#enterButton').innerHTML=mode==='create'?'새 게임 만들기 <span>→</span>':'게임 입장하기 <span>→</span>'; });
$('#pinInput').oninput=e=>e.target.value=e.target.value.replace(/\D/g,'').slice(0,4);
$('#enterButton').onclick=()=>{ const name=$('#nameInput').value.trim(); $('#errorText').textContent=''; if(mode==='create') socket.emit('room:create',{name,cap:selectedCap}); else socket.emit('room:join',{code:$('#pinInput').value,name,cap:selectedCap}); };
socket.on('game:error',msg=>{ pendingShot=false; if(activeDrag) activeDrag.cancel(); $('#errorText').textContent=msg; if(state) { render(); alert(msg); } });
socket.on('room:update',room=>{ const first=!state; state=room; if(first){$('#home').classList.add('hidden');$('#game').classList.remove('hidden');$('#roomBadge').classList.remove('hidden');} render(); });
socket.on('game:simulation', ({playerId, round, frames, collisions, duration, launchDuration}) => {
  if (!state || state.round !== round || !frames.length) return;
  if (playback) cancelAnimationFrame(playback.raf);
  flying = true;
  pendingShot = false;
  state.status = 'flying';
  state.players.find(p=>p.id===playerId).finished = true;
  geometry = measureTable();
  const elements = new Map([...document.querySelectorAll('#capsLayer .cap')].map(el=>[el.dataset.player,el]));
  const shooter = elements.get(playerId);
  const fromTransform = shooter ? new DOMMatrix(getComputedStyle(shooter).transform) : new DOMMatrix();
  shooter?.classList.remove('dragging','current');
  $('#powerWrap').classList.add('hidden'); $('#aimGuide').classList.add('hidden');
  $('#statusTitle').textContent = '병뚜껑 대결 중!';
  $('#turnGuide').textContent = '충돌하면 서로 튕겨요! 멈출 때까지 지켜보세요.';
  const run = { raf: 0 }; playback = run;
  const started = performance.now();
  let frameIndex = 0, collisionIndex = 0, lastRanking = -Infinity;
  const glowUntil = new Map();
  function tick(now) {
    if (playback !== run) return;
    const elapsed = now - started;
    if (elapsed < launchDuration) {
      const first = frames[0].bodies.find(b=>b.id===playerId);
      const progress = (elapsed / launchDuration) ** 2;
      if (shooter && first) {
        const x=(first.x-state.table.width/2)*geometry.sx;
        const y=-first.y*geometry.sy;
        shooter.style.transform=`translate(${fromTransform.e+(x-fromTransform.e)*progress}px, ${fromTransform.f+(y-fromTransform.f)*progress}px)`;
      }
    } else {
      const t=Math.min(duration,elapsed-launchDuration);
      while(frameIndex<frames.length-2 && frames[frameIndex+1].t<=t) frameIndex++;
      const a=frames[frameIndex], b=frames[Math.min(frameIndex+1,frames.length-1)];
      const mix=Math.max(0,Math.min(1,(t-a.t)/Math.max(1,b.t-a.t)));
      while(collisionIndex<collisions.length && collisions[collisionIndex].t<=t) {
        const hit=collisions[collisionIndex++];
        glowUntil.set(hit.a,now+140); glowUntil.set(hit.b,now+140);
        $('#turnGuide').textContent='딱! 부딪힌 병뚜껑의 위치에 따라 순위가 바뀝니다.';
      }
      for(let i=0;i<a.bodies.length;i++) {
        const before=a.bodies[i], after=b.bodies[i];
        const pose={id:before.id,x:before.x+(after.x-before.x)*mix,y:before.y+(after.y-before.y)*mix,
          angle:before.angle+(after.angle-before.angle)*mix,out:before.out || (mix===1 && after.out),
          fade:before.fade+(after.fade-before.fade)*mix};
        const el=elements.get(pose.id);
        if(el) { paintCap(el,pose); el.classList.toggle('impact',(glowUntil.get(pose.id)||0)>now); }
        const player=state.players.find(p=>p.id===pose.id);
        if(player) { player.position={x:pose.x,y:pose.y}; player.distance=pose.y/state.table.edge*100; player.out=pose.out; player.angle=pose.angle; }
      }
      if(now-lastRanking>100) {renderRankings();lastRanking=now;}
    }
    if(elapsed<launchDuration+duration) run.raf=requestAnimationFrame(tick);
    else { flying=false; playback=null; renderRankings(); if(state.status!=='flying') render(); }
  }
  run.raf=requestAnimationFrame(tick);
});
socket.on('game:ended',()=>{ alert('방장이 게임을 종료했습니다.'); location.reload(); });

function measureTable() {
  const table = $('#table');
  const start = parseFloat(getComputedStyle(table).getPropertyValue('--launch-bottom'));
  const sx=table.clientWidth/state.table.width;
  const sy=(table.clientHeight*.95-start)/(state.table.edge+state.table.radius);
  // Scale the physical footprint with the table, so contacts match on every screen.
  table.style.setProperty('--cap-width',`${state.table.radius*2*sx}px`);
  table.style.setProperty('--cap-height',`${state.table.radius*2*sy}px`);
  return {sx,sy,start};
}
function paintCap(el, pose) {
  el.style.transform=`translate(${(pose.x-state.table.width/2)*geometry.sx}px, ${-pose.y*geometry.sy}px)`;
  el.style.opacity=String(1-(pose.fade||0));
  if(el.firstElementChild) el.firstElementChild.style.transform=`rotate(${pose.angle||0}deg)`;
}
function rankScore(player) { return player.out ? -Infinity : player.distance == null ? -Infinity : player.distance; }
function renderRankings() {
  const current=state.players[state.turnIndex];
  const ranked=[...state.players].sort((a,b)=>rankScore(b)-rankScore(a));
  let place=0;
  $('#rankingList').innerHTML=ranked.map(p=>`<div class="rank-row ${current?.id===p.id&&state.status==='playing'?'turn':''}"><span class="rank">${p.out?'×':p.distance!=null?++place:'·'}</span>${capHtml(p.cap)}<div><strong>${p.name}${p.id===state.hostId?' 👑':''}</strong><small>${p.id===socket.id?'나 · ':''}${p.out?'테이블 밖 · 탈락':p.finished?'도전 완료':current?.id===p.id?'지금 도전 중':'차례 대기'}</small></div><span class="score">${p.out?'OUT':p.distance!=null?`${p.distance.toFixed(1)}%`:'—'}</span></div>`).join('');
  return ranked;
}
function render(){
  const me=state.players.find(p=>p.id===socket.id), isHost=state.hostId===socket.id, current=state.players[state.turnIndex];
  $('#roomCode').textContent=$('#roomCodeTop').textContent=state.code; $('#roundNumber').textContent=state.round; $('#roundBadge').textContent=`ROUND ${state.round}`; $('#playerCount').textContent=state.players.length;
  $('#startButton').classList.toggle('hidden',!isHost); $('#lobbyActions').classList.toggle('hidden',state.status!=='lobby');
  $('#statusTitle').textContent=state.status==='lobby'?'선수 대기실':state.status==='flying'?'병뚜껑 대결 중!':state.status==='playing'?(current?.id===socket.id?'내 차례입니다!':`${current?.name}의 차례`):'경기 종료';
  const ranked=renderRankings();
  const preserveCaps = flying || pendingShot || (dragging && state.status==='playing' && current?.id===socket.id);
  if (!preserveCaps) {
    if (activeDrag) activeDrag.cancel();
    geometry=measureTable();
    $('#capsLayer').innerHTML=state.players.map((p,i)=>{
      const c=capInfo(p.cap), pos=p.position||{x:state.table.width/2+(i-(state.players.length-1)/2)*64,y:0};
      const waiting=!p.finished && current?.id!==p.id;
      const x=(pos.x-state.table.width/2)*geometry.sx;
      return `<div class="cap ${p.out?'out':''} ${waiting?'waiting':''} ${p.id===socket.id?'mine':''} ${current?.id===p.id&&state.status==='playing'?'current':''}" data-player="${p.id}" style="background:${c.color};--cap-x:${x}px;bottom:${geometry.start}px;transform:translate(${x}px,${waiting?90:-pos.y*geometry.sy}px)"><span class="cap-face" style="transform:rotate(${p.angle||0}deg)">${c.short}</span></div>`;
    }).join('');
  }
  const myTurn=state.status==='playing'&&current?.id===socket.id&&!me?.finished;
  $('#powerWrap').classList.toggle('hidden',!myTurn); $('#aimGuide').classList.toggle('hidden',!myTurn);
  $('#turnGuide').textContent=state.status==='lobby'?(isHost?'모두 준비되면 게임을 시작하세요.':'방장이 게임을 시작할 때까지 기다려 주세요.'):myTurn?'아래로 당겨 힘 조절 · 좌우로 비껴 당겨 상대를 겨냥하세요!':state.status==='flying'?'병뚜껑이 모두 멈출 때까지 기다려 주세요.':state.status==='playing'?`${current?.name} 선수의 도전을 지켜보세요.`:'결과를 확인하세요!';
  if(myTurn && !preserveCaps) bindDrag();
  if(state.status==='finished'){
    const winner=ranked.find(p=>p.distance!=null && !p.out);
    $('#resultModal h2').textContent=winner?`1등 ${winner.name}님, 축하합니다!`:'모두 테이블 밖으로!';
    $('#winnerCap').innerHTML=winner?capHtml(winner.cap,'cap'):'';
    $('#winnerScore').textContent=winner?`테이블 끝까지 ${winner.distance.toFixed(1)}% 도달`:'이번 경기는 우승자가 없어요. 다시 도전해 보세요!';
    $('#hostResultActions').classList.toggle('hidden',!isHost); $('#guestWait').classList.toggle('hidden',isHost); $('#resultModal').classList.remove('hidden');
  } else $('#resultModal').classList.add('hidden');
}

function bindDrag() {
  const el = document.querySelector(`[data-player="${socket.id}"]`);
  if (!el) return;
  let pointer = null, startX = 0, startY = 0, aim = 0;
  const resetGauge = () => { power=0; $('#powerFill').style.width='0%'; $('#powerValue').textContent='0%'; };
  const cancel = () => {
    const id = pointer;
    pointer = null; dragging = false; activeDrag = null;
    el.classList.remove('dragging'); el.style.transform=''; $('#aimGuide').style.transform=''; resetGauge();
    if (id != null && el.hasPointerCapture(id)) el.releasePointerCapture(id);
  };
  el.onpointerdown = e => {
    if (e.button !== 0 || !e.isPrimary || pointer != null || pendingShot || flying) return;
    pointer=e.pointerId; startX=e.pageX; startY=e.pageY;
    dragging=true; activeDrag={cancel}; resetGauge();
    el.classList.add('dragging'); el.setPointerCapture(pointer); e.preventDefault();
  };
  el.onpointermove = e => {
    if (pointer !== e.pointerId) return;
    const dx=e.pageX-startX, dy=e.pageY-startY;
    power=Math.max(0,Math.min(1,dy/300));
    aim=Math.max(-.85,Math.min(.85,-dx/Math.max(1,dy)*geometry.sy/geometry.sx));
    $('#aimGuide').style.left=`calc(50% + ${el.style.getPropertyValue('--cap-x')})`;
    $('#aimGuide').style.transform=`rotate(${Math.atan(aim*geometry.sx/geometry.sy)*180/Math.PI}deg)`;
    // Follow the grabbed point 1:1, even after the power gauge is full.
    el.style.transform=`translate(calc(var(--cap-x, 0px) + ${dx}px), ${dy}px)`;
    $('#powerFill').style.width=`${power*100}%`; $('#powerValue').textContent=`${Math.round(power*100)}%`;
  };
  el.onpointerup = e => {
    if (pointer !== e.pointerId) return;
    el.onpointermove(e);
    const shotPower=power;
    pointer=null; dragging=false; activeDrag=null;
    el.classList.remove('dragging');
    el.releasePointerCapture(e.pointerId);
    if (shotPower > .06) { pendingShot=true; socket.emit('game:flick',{power:shotPower,aim}); }
    else { el.style.transform=''; resetGauge(); }
  };
  el.onpointercancel = cancel;
  el.onlostpointercapture = () => { if(pointer!=null) cancel(); };
}
window.addEventListener('resize',()=>{if(state){geometry=measureTable();if(!dragging&&!flying)render();}});
$('#startButton').onclick=()=>socket.emit('game:start'); $('#restartButton').onclick=()=>socket.emit('game:restart'); $('#endButton').onclick=()=>socket.emit('game:end'); $('#copyPin').onclick=async()=>{await navigator.clipboard.writeText(state.code);$('#copyPin').textContent='완료';setTimeout(()=>$('#copyPin').textContent='복사',1200)};
