const socket = io();
const caps = [
  { id:'pepsi', name:'펩시', short:'PEPSI', color:'#1457a6' },
  { id:'cider', name:'칠성사이다', short:'칠성', color:'#15955b' },
  { id:'samdasoo', name:'삼다수', short:'제주', color:'#28a9df' },
  { id:'coke', name:'코카콜라', short:'COKE', color:'#d51e2b' },
  { id:'evian', name:'에비앙', short:'evian', color:'#ef7894' }
];
const $ = s => document.querySelector(s);
let mode = 'create', selectedCap = caps[0].id, state = null, dragging = false, dragStart = 0, power = 0;

function capInfo(id){ return caps.find(c => c.id === id) || caps[0]; }
function capHtml(id, cls='mini-cap'){ const c=capInfo(id); return `<div class="${cls}" style="background:${c.color}">${c.short}</div>`; }
$('#capPicker').innerHTML = caps.map((c,i)=>`<button class="cap-option ${i?'':'active'}" data-cap="${c.id}">${capHtml(c.id)}${c.name}</button>`).join('');
$('#capPicker').onclick = e => { const b=e.target.closest('.cap-option'); if(!b)return; selectedCap=b.dataset.cap; document.querySelectorAll('.cap-option').forEach(x=>x.classList.toggle('active',x===b)); };
document.querySelectorAll('.tab').forEach(tab=>tab.onclick=()=>{ mode=tab.dataset.tab; document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('active',x===tab)); $('#pinField').classList.toggle('hidden',mode==='create'); $('#enterButton').innerHTML=mode==='create'?'새 게임 만들기 <span>→</span>':'게임 입장하기 <span>→</span>'; });
$('#pinInput').oninput=e=>e.target.value=e.target.value.replace(/\D/g,'').slice(0,4);
$('#enterButton').onclick=()=>{ const name=$('#nameInput').value.trim(); $('#errorText').textContent=''; if(mode==='create') socket.emit('room:create',{name,cap:selectedCap}); else socket.emit('room:join',{code:$('#pinInput').value,name,cap:selectedCap}); };
socket.on('game:error',msg=>{ $('#errorText').textContent=msg; if(state) alert(msg); });
socket.on('room:update',room=>{ const first=!state; state=room; if(first){$('#home').classList.add('hidden');$('#game').classList.remove('hidden');$('#roomBadge').classList.remove('hidden');} render(); });
socket.on('game:flicked',({playerId,distance})=>{ const el=document.querySelector(`[data-player="${playerId}"]`); if(el) el.style.bottom=`${8 + distance*.82}%`; });
socket.on('game:ended',()=>{ alert('방장이 게임을 종료했습니다.'); location.reload(); });

function render(){
  const me=state.players.find(p=>p.id===socket.id), isHost=state.hostId===socket.id, current=state.players[state.turnIndex];
  $('#roomCode').textContent=$('#roomCodeTop').textContent=state.code; $('#roundNumber').textContent=state.round; $('#roundBadge').textContent=`ROUND ${state.round}`; $('#playerCount').textContent=state.players.length;
  $('#startButton').classList.toggle('hidden',!isHost); $('#lobbyActions').classList.toggle('hidden',state.status!=='lobby');
  $('#statusTitle').textContent=state.status==='lobby'?'선수 대기실':state.status==='playing'?(current?.id===socket.id?'내 차례입니다!':`${current?.name}의 차례`):'경기 종료';
  const ranked=[...state.players].sort((a,b)=>(b.distance??-1)-(a.distance??-1));
  $('#rankingList').innerHTML=ranked.map((p,i)=>`<div class="rank-row ${current?.id===p.id&&state.status==='playing'?'turn':''}"><span class="rank">${p.finished?i+1:'·'}</span>${capHtml(p.cap)}<div><strong>${p.name}${p.id===state.hostId?' 👑':''}</strong><small>${p.id===socket.id?'나 · ':''}${p.finished?'도전 완료':current?.id===p.id?'지금 도전 중':'차례 대기'}</small></div><span class="score">${p.distance!=null?`${p.distance.toFixed(1)}%`:'—'}</span></div>`).join('');
  $('#capsLayer').innerHTML=state.players.map((p,i)=>{const c=capInfo(p.cap), x=(i-(state.players.length-1)/2)*64; return `<div class="cap ${p.id===socket.id?'mine':''} ${current?.id===p.id&&state.status==='playing'?'current':''}" data-player="${p.id}" style="background:${c.color};transform:translateX(${x}px);bottom:${p.distance!=null?8+p.distance*.82:8}%">${c.short}</div>`}).join('');
  const myTurn=state.status==='playing'&&current?.id===socket.id&&!me?.finished;
  $('#powerWrap').classList.toggle('hidden',!myTurn); $('#aimGuide').classList.toggle('hidden',!myTurn);
  $('#turnGuide').textContent=state.status==='lobby'?(isHost?'모두 준비되면 게임을 시작하세요.':'방장이 게임을 시작할 때까지 기다려 주세요.'):myTurn?'내 병뚜껑을 아래로 당겼다가 놓으세요!':state.status==='playing'?`${current?.name} 선수의 도전을 지켜보세요.`:'결과를 확인하세요!';
  if(myTurn) bindDrag();
  if(state.status==='finished'){ const winner=ranked[0]; $('#winnerName').textContent=winner.name; $('#winnerCap').innerHTML=capHtml(winner.cap,'cap'); $('#winnerScore').textContent=`테이블 끝까지 ${winner.distance.toFixed(1)}% 도달`; $('#hostResultActions').classList.toggle('hidden',!isHost); $('#guestWait').classList.toggle('hidden',isHost); $('#resultModal').classList.remove('hidden'); } else $('#resultModal').classList.add('hidden');
}

function bindDrag(){ const el=document.querySelector(`[data-player="${socket.id}"]`); if(!el)return; const start=e=>{dragging=true;dragStart=e.clientY??e.touches?.[0].clientY;power=0;el.classList.add('dragging');e.preventDefault()}; const move=e=>{if(!dragging)return;const y=e.clientY??e.touches?.[0].clientY;power=Math.max(0,Math.min(1,(y-dragStart)/180));el.style.transform=`translateY(${power*85}px)`;$('#powerFill').style.width=`${power*100}%`;$('#powerValue').textContent=`${Math.round(power*100)}%`}; const end=()=>{if(!dragging)return;dragging=false;el.classList.remove('dragging');if(power>.06)socket.emit('game:flick',{power});else{el.style.transform='';$('#powerFill').style.width='0';}};el.onpointerdown=start;window.onpointermove=move;window.onpointerup=end; }
$('#startButton').onclick=()=>socket.emit('game:start'); $('#restartButton').onclick=()=>socket.emit('game:restart'); $('#endButton').onclick=()=>socket.emit('game:end'); $('#copyPin').onclick=async()=>{await navigator.clipboard.writeText(state.code);$('#copyPin').textContent='완료';setTimeout(()=>$('#copyPin').textContent='복사',1200)};
