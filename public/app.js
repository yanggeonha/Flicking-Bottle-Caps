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

function capInfo(id){ return caps.find(c => c.id === id) || caps[0]; }
function capHtml(id, cls='mini-cap'){ const c=capInfo(id); return `<div class="${cls}" style="background:${c.color}">${c.short}</div>`; }
$('#capPicker').innerHTML = caps.map((c,i)=>`<button class="cap-option ${i?'':'active'}" data-cap="${c.id}">${capHtml(c.id)}${c.name}</button>`).join('');
$('#capPicker').onclick = e => { const b=e.target.closest('.cap-option'); if(!b)return; selectedCap=b.dataset.cap; document.querySelectorAll('.cap-option').forEach(x=>x.classList.toggle('active',x===b)); };
document.querySelectorAll('.tab').forEach(tab=>tab.onclick=()=>{ mode=tab.dataset.tab; document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('active',x===tab)); $('#pinField').classList.toggle('hidden',mode==='create'); $('#enterButton').innerHTML=mode==='create'?'새 게임 만들기 <span>→</span>':'게임 입장하기 <span>→</span>'; });
$('#pinInput').oninput=e=>e.target.value=e.target.value.replace(/\D/g,'').slice(0,4);
$('#enterButton').onclick=()=>{ const name=$('#nameInput').value.trim(); $('#errorText').textContent=''; if(mode==='create') socket.emit('room:create',{name,cap:selectedCap}); else socket.emit('room:join',{code:$('#pinInput').value,name,cap:selectedCap}); };
socket.on('game:error',msg=>{ pendingShot=false; if(activeDrag) activeDrag.cancel(); $('#errorText').textContent=msg; if(state) { render(); alert(msg); } });
socket.on('room:update',room=>{ const first=!state; state=room; if(first){$('#home').classList.add('hidden');$('#game').classList.remove('hidden');$('#roomBadge').classList.remove('hidden');} render(); });
socket.on('game:flicked', ({playerId, distance, duration}) => {
  const el = document.querySelector(`[data-player="${playerId}"]`);
  if (!el) return;
  flying = true;
  pendingShot = false;
  const from = el.getBoundingClientRect();
  el.classList.remove('dragging', 'current');
  el.style.transform = '';
  el.style.bottom = capBottom(distance);
  const to = el.getBoundingClientRect();
  const x = parseFloat(el.style.getPropertyValue('--cap-x')) || 0;
  const overshot = distance > 100;
  // Only transform is animated; bottom is laid out once before flight.
  const flight = el.animate([
    { transform: `translate(${x + from.left - to.left}px, ${from.top - to.top}px) rotate(0deg)`, opacity: 1, offset: 0 },
    { transform: `translate(${x}px, 0px) rotate(720deg) scale(${overshot ? .6 : 1})`, opacity: overshot ? 0 : 1, offset: 1 }
  ], { duration, easing: 'cubic-bezier(.16,.72,.22,1)', fill: 'forwards' });
  $('#turnGuide').textContent = overshot ? '너무 강해요! 테이블 밖으로 날아갑니다.' : '병뚜껑이 미끄러지고 있어요…';
  flight.finished.then(() => {
    flying = false;
    if (overshot) el.classList.add('out');
    if (state.status !== 'playing' || state.players[state.turnIndex]?.id !== playerId) render();
  }).catch(() => { flying = false; });
});
socket.on('game:ended',()=>{ alert('방장이 게임을 종료했습니다.'); location.reload(); });

function capBottom(distance) {
  const table = $('#table');
  const start = parseFloat(getComputedStyle(table).getPropertyValue('--launch-bottom'));
  const size = window.innerWidth <= 520 ? 50 : 58;
  const edge = table.clientHeight * .95 - size / 2;
  return `${start + (edge - start) * (distance ?? 0) / 100}px`;
}
function rankScore(player) { return player.distance == null ? -1 : player.distance > 100 ? -2 : player.distance; }
function render(){
  const me=state.players.find(p=>p.id===socket.id), isHost=state.hostId===socket.id, current=state.players[state.turnIndex];
  $('#roomCode').textContent=$('#roomCodeTop').textContent=state.code; $('#roundNumber').textContent=state.round; $('#roundBadge').textContent=`ROUND ${state.round}`; $('#playerCount').textContent=state.players.length;
  $('#startButton').classList.toggle('hidden',!isHost); $('#lobbyActions').classList.toggle('hidden',state.status!=='lobby');
  $('#statusTitle').textContent=state.status==='lobby'?'선수 대기실':state.status==='playing'?(current?.id===socket.id?'내 차례입니다!':`${current?.name}의 차례`):'경기 종료';
  const ranked=[...state.players].sort((a,b)=>rankScore(b)-rankScore(a));
  $('#rankingList').innerHTML=ranked.map((p,i)=>`<div class="rank-row ${current?.id===p.id&&state.status==='playing'?'turn':''}"><span class="rank">${p.distance>100?'×':p.finished?i+1:'·'}</span>${capHtml(p.cap)}<div><strong>${p.name}${p.id===state.hostId?' 👑':''}</strong><small>${p.id===socket.id?'나 · ':''}${p.distance>100?'테이블 밖 · 탈락':p.finished?'도전 완료':current?.id===p.id?'지금 도전 중':'차례 대기'}</small></div><span class="score">${p.distance>100?'OUT':p.distance!=null?`${p.distance.toFixed(1)}%`:'—'}</span></div>`).join('');
  const preserveCaps = flying || pendingShot || (dragging && state.status==='playing' && current?.id===socket.id);
  if (!preserveCaps) {
    if (activeDrag) activeDrag.cancel();
    const spacing = Math.min(64, ($('#table').clientWidth - 74) / Math.max(1, state.players.length - 1));
    $('#capsLayer').innerHTML=state.players.map((p,i)=>{const c=capInfo(p.cap), x=(i-(state.players.length-1)/2)*spacing; return `<div class="cap ${p.distance>100?'out':''} ${p.id===socket.id?'mine':''} ${current?.id===p.id&&state.status==='playing'?'current':''}" data-player="${p.id}" style="background:${c.color};--cap-x:${x}px;bottom:${capBottom(p.distance)}">${c.short}</div>`}).join('');
  }
  const myTurn=state.status==='playing'&&current?.id===socket.id&&!me?.finished;
  $('#powerWrap').classList.toggle('hidden',!myTurn); $('#aimGuide').classList.toggle('hidden',!myTurn);
  $('#turnGuide').textContent=state.status==='lobby'?(isHost?'모두 준비되면 게임을 시작하세요.':'방장이 게임을 시작할 때까지 기다려 주세요.'):myTurn?'내 병뚜껑을 아래로 당겼다가 놓으세요!':state.status==='playing'?`${current?.name} 선수의 도전을 지켜보세요.`:'결과를 확인하세요!';
  if(myTurn && !preserveCaps) bindDrag();
  if(state.status==='finished'){
    const winner=ranked.find(p=>p.distance!=null && p.distance<=100);
    $('#resultModal h2').textContent=winner?`1등 ${winner.name}님, 축하합니다!`:'모두 테이블 밖으로!';
    $('#winnerCap').innerHTML=winner?capHtml(winner.cap,'cap'):'';
    $('#winnerScore').textContent=winner?`테이블 끝까지 ${winner.distance.toFixed(1)}% 도달`:'이번 경기는 우승자가 없어요. 다시 도전해 보세요!';
    $('#hostResultActions').classList.toggle('hidden',!isHost); $('#guestWait').classList.toggle('hidden',isHost); $('#resultModal').classList.remove('hidden');
  } else $('#resultModal').classList.add('hidden');
}

function bindDrag() {
  const el = document.querySelector(`[data-player="${socket.id}"]`);
  if (!el) return;
  let pointer = null, startX = 0, startY = 0;
  const resetGauge = () => { power=0; $('#powerFill').style.width='0%'; $('#powerValue').textContent='0%'; };
  const cancel = () => {
    const id = pointer;
    pointer = null; dragging = false; activeDrag = null;
    el.classList.remove('dragging'); el.style.transform=''; resetGauge();
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
    if (shotPower > .06) { pendingShot=true; socket.emit('game:flick',{power:shotPower}); }
    else { el.style.transform=''; resetGauge(); }
  };
  el.onpointercancel = cancel;
  el.onlostpointercapture = () => { if(pointer!=null) cancel(); };
}
$('#startButton').onclick=()=>socket.emit('game:start'); $('#restartButton').onclick=()=>socket.emit('game:restart'); $('#endButton').onclick=()=>socket.emit('game:end'); $('#copyPin').onclick=async()=>{await navigator.clipboard.writeText(state.code);$('#copyPin').textContent='완료';setTimeout(()=>$('#copyPin').textContent='복사',1200)};
