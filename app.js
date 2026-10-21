/* Draw Battle Arena - lógica do jogo e Supabase Realtime */
(() => {
'use strict';
const SUPABASE_URL='https://alfcxgmrztuioegejodm.supabase.co';
const SUPABASE_KEY='sb_publishable_QgKVX1O7yu_f9GlumEPM7Q_hDR7wQxj';
const sb=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
const $=id=>document.getElementById(id);
const THEMES=['Animais','Personagens','Comida','Veículos','Monstros','Esportes','Espaço','Objetos do dia a dia','Criaturas fantásticas','Natureza','Robôs','Profissões'];
const PALETTE=['#17172a','#f43f5e','#fb923c','#facc15','#4ade80','#22d3ee','#3b82f6','#a78bfa','#f472b6','#ffffff','#92400e','#000000'];
let channel=null,room='',player='',isHost=false,players={},timer=null,seconds=60,strokeColor=PALETTE[0],eraser=false,painting=false,activeStroke=null,undoStack=[],submitted=false,roundToken=0;
let game={phase:'lobby',round:1,theme:'',drawings:{},votes:{},scores:{}};
const canvas=$('canvas'),ctx=canvas.getContext('2d');
ctx.lineCap='round';ctx.lineJoin='round';ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
const escapeHtml=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function say(message){$('status').textContent=message}
function code(){return Math.random().toString(36).slice(2,8).toUpperCase()}
function myName(){return players[player]?.name||'Jogador'}
function send(event,payload){if(channel)channel.send({type:'broadcast',event,payload})}
function syncState(){if(isHost)send('state',{game,players})}
function renderPlayers(){$('players').innerHTML=Object.values(players).map(p=>'<span class="pill">'+escapeHtml(p.name)+(p.id===player?' (você)':'')+'</span>').join('')||'<span class="muted">Esperando jogadores entrarem...</span>'}
function render(){
 $('setup').classList.add('hidden');$('arena').classList.remove('hidden');
 $('codeLabel').textContent=room;$('theme').textContent=game.theme||'Aguardando anfitrião...';
 $('roundInfo').textContent=game.phase==='lobby'?'3 rodadas · 60 segundos por desenho':'Rodada '+game.round+' de 3';
 $('start').classList.toggle('hidden',!isHost||game.phase!=='lobby');
 $('phaseText').textContent=({lobby:'Compartilhe o código e comece quando todos estiverem prontos.',draw:'Desenhem! Os traços aparecem ao vivo para a sala.',vote:'Escolha o desenho favorito da rodada.',results:'Batalha encerrada. Confira o placar.'})[game.phase]||'';
 $('drawing').classList.toggle('hidden',game.phase!=='draw'||submitted);
 $('liveGallery').classList.toggle('hidden',game.phase!=='draw');
 $('voting').classList.toggle('hidden',game.phase!=='vote');
 $('results').classList.toggle('hidden',game.phase!=='results');
 renderPlayers();
 if(game.phase==='draw')renderLiveDrawings();
 if(game.phase==='vote')renderVotes();
 if(game.phase==='results')renderScores();
}
function startConnect(roomCode,name,host){
 room=roomCode;player=crypto.randomUUID();isHost=host;
 players={[player]:{id:player,name:name||'Jogador'}};
 game={phase:'lobby',round:1,theme:'',drawings:{},votes:{},scores:{[player]:0}};
 channel=sb.channel('draw-battle-'+room,{config:{presence:{key:player},broadcast:{self:false}}});
 channel.on('presence',{event:'sync'},()=>{const fresh={};Object.values(channel.presenceState()).flat().forEach(p=>{if(p?.id)fresh[p.id]=p});if(Object.keys(fresh).length){players=fresh;if(isHost)syncState();renderPlayers()}});
 channel.on('broadcast',{event:'state'},({payload})=>{if(isHost||!payload)return;game=payload.game;players=payload.players||players;render()});
 channel.on('broadcast',{event:'stroke-start'},({payload})=>{if(payload?.id!==player)drawStrokeStart(payload)});
 channel.on('broadcast',{event:'stroke-move'},({payload})=>{if(payload?.id!==player)drawStrokeMove(payload)});
 channel.on('broadcast',{event:'stroke-end'},({payload})=>{if(payload?.id!==player)drawStrokeEnd(payload)});
 channel.on('broadcast',{event:'clear-canvas'},({payload})=>{if(payload?.id!==player){clearCanvas(false);$('liveDrawings').querySelector('[data-live="'+payload.id+'"]')?.getContext('2d')?.clearRect(0,0,800,600)}});
 channel.on('broadcast',{event:'draw-submit'},({payload})=>{if(payload?.id===player)return;game.drawings[payload.id]=payload;renderLiveDrawings();if(game.phase==='vote')renderVotes();if(isHost&&Object.keys(game.drawings).length>=Object.keys(players).length)beginVote()});
 channel.on('broadcast',{event:'vote'},({payload})=>{if(!isHost||!payload||payload.voter===payload.target||game.votes[payload.voter])return;game.votes[payload.voter]=payload.target;game.scores[payload.target]=(game.scores[payload.target]||0)+1;syncState();if(Object.keys(game.votes).length>=Object.keys(players).length)finishRound()});
 channel.subscribe(async status=>{if(status==='SUBSCRIBED'){await channel.track({id:player,name:players[player].name});render();say('Conectado. Compartilhe o código '+room+' com seus amigos.');if(isHost)syncState()}else if(status==='CHANNEL_ERROR'||status==='TIMED_OUT')say('Não foi possível conectar ao Realtime. Verifique as configurações do Supabase.')});
}
$('create').onclick=()=>{const name=$('hostName').value.trim();if(!name)return say('Digite seu nome para criar uma sala.');startConnect(code(),name,true)};
$('join').onclick=()=>{const name=$('joinName').value.trim(),roomCode=$('roomCode').value.trim().toUpperCase();if(!name||roomCode.length!==6)return say('Digite seu nome e o código de seis caracteres.');startConnect(roomCode,name,false)};
$('roomCode').addEventListener('input',e=>e.target.value=e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,6));
$('copy').onclick=async()=>{try{await navigator.clipboard.writeText(room);say('Código copiado!')}catch{say('Código da sala: '+room)}};
$('leave').onclick=async()=>{if(timer)clearInterval(timer);if(channel)await sb.removeChannel(channel);channel=null;room='';players={};game={phase:'lobby',round:1,theme:'',drawings:{},votes:{},scores:{}};$('arena').classList.add('hidden');$('setup').classList.remove('hidden');say('Você saiu da arena.')};
$('start').onclick=()=>{if(!isHost)return;game={phase:'draw',round:1,theme:THEMES[Math.floor(Math.random()*THEMES.length)],drawings:{},votes:{},scores:Object.fromEntries(Object.keys(players).map(id=>[id,0]))};submitted=false;resetDrawing();syncState();render();startTimer(60)};
function startTimer(value){if(timer)clearInterval(timer);seconds=value;$('countdown').textContent=seconds+'s';const token=++roundToken;timer=setInterval(()=>{if(token!==roundToken)return;seconds--;$('countdown').textContent=seconds+'s';if(seconds<=0){clearInterval(timer);if(!submitted)submitDrawing();if(isHost)beginVote()}},1000)}
function beginVote(){if(!isHost||game.phase!=='draw')return;game.phase='vote';if(timer)clearInterval(timer);syncState();render();say('Tempo encerrado! Hora de votar.')}
function startNextRound(){if(!isHost)return;if(game.round>=3){game.phase='results';syncState();render();return}game.round++;game.phase='draw';game.theme=THEMES[Math.floor(Math.random()*THEMES.length)];game.drawings={};game.votes={};submitted=false;resetDrawing();syncState();render();startTimer(60)}
$('nextRound').onclick=startNextRound;
$('playAgain').onclick=()=>{if(!isHost)return say('Só o anfitrião pode reiniciar a partida.');game={phase:'lobby',round:1,theme:'',drawings:{},votes:{},scores:Object.fromEntries(Object.keys(players).map(id=>[id,0]))};submitted=false;syncState();render()};
function getPos(e){const r=canvas.getBoundingClientRect();return{x:(e.clientX-r.left)*canvas.width/r.width,y:(e.clientY-r.top)*canvas.height/r.height}}
function drawSegment(target,p,prev){if(!target||!p)return;const c=target.getContext('2d');c.lineCap='round';c.lineJoin='round';c.strokeStyle=p.color;c.lineWidth=p.width;c.beginPath();c.moveTo(prev?prev.x:p.x,prev?prev.y:p.y);c.lineTo(p.x,p.y);c.stroke()}
function drawStrokeStart(p){if(!p)return;const g=$('liveDrawings').querySelector('[data-live="'+p.id+'"]');if(g)drawSegment(g,p.point,null)}
function drawStrokeMove(p){if(!p)return;const g=$('liveDrawings').querySelector('[data-live="'+p.id+'"]');if(g)drawSegment(g,p.point,p.prev)}
function drawStrokeEnd(){}
canvas.addEventListener('pointerdown',e=>{if(game.phase!=='draw'||submitted)return;painting=true;canvas.setPointerCapture(e.pointerId);const p=getPos(e);activeStroke={color:eraser?'#ffffff':strokeColor,width:eraser?30:5,points:[p]};undoStack.push(activeStroke);drawSegment(canvas,{...p,color:activeStroke.color,width:activeStroke.width},null);send('stroke-start',{id:player,point:{...p,color:activeStroke.color,width:activeStroke.width}})});
canvas.addEventListener('pointermove',e=>{if(!painting||!activeStroke)return;const p=getPos(e),prev=activeStroke.points[activeStroke.points.length-1];activeStroke.points.push(p);drawSegment(canvas,{...p,color:activeStroke.color,width:activeStroke.width},prev);send('stroke-move',{id:player,prev,point:{...p,color:activeStroke.color,width:activeStroke.width}})});
function endStroke(){if(!painting)return;painting=false;activeStroke=null;send('stroke-end',{id:player})}
canvas.addEventListener('pointerup',endStroke);canvas.addEventListener('pointercancel',endStroke);
function clearCanvas(announce=true){ctx.fillStyle='#fff';ctx.fillRect(0,0,800,600);undoStack=[];if(announce)send('clear-canvas',{id:player})}
function replayLocal(){ctx.fillStyle='#fff';ctx.fillRect(0,0,800,600);undoStack.forEach(st=>{st.points.forEach((p,i)=>drawSegment(canvas,{...p,color:st.color,width:st.width},i?st.points[i-1]:null))})}
function resetDrawing(){clearCanvas(false);submitted=false;$('countdown').textContent='60s';$('liveDrawings').innerHTML='';renderLiveDrawings()}
$('eraser').onclick=()=>{eraser=!eraser;$('eraser').textContent=eraser?'Borracha ativa':'Borracha'};
$('undo').onclick=()=>{undoStack.pop();replayLocal();clearRemoteLive();replayLocal()};
$('clear').onclick=()=>{clearCanvas();clearRemoteLive()};
function clearRemoteLive(){const c=$('liveDrawings');c.querySelectorAll('canvas').forEach(el=>{const x=el.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,el.width,el.height)})}
$('colors').innerHTML=PALETTE.map((c,i)=>'<button class="swatch '+(!i?'active':'')+'" data-color="'+c+'" style="background:'+c+'" aria-label="Selecionar cor"></button>').join('');
$('colors').addEventListener('click',e=>{const b=e.target.closest('[data-color]');if(!b)return;strokeColor=b.dataset.color;eraser=false;$('eraser').textContent='Borracha';document.querySelectorAll('.swatch').forEach(el=>el.classList.toggle('active',el===b))});
function renderLiveDrawings(){const host=$('liveDrawings');const ids=Object.keys(players);const old={};host.querySelectorAll('canvas').forEach(c=>old[c.dataset.live]=c);host.innerHTML='';ids.forEach(id=>{const wrap=document.createElement('div');wrap.className='drawing-card';const name=document.createElement('div');name.className='drawing-name';name.textContent=(players[id]?.name||'Jogador')+(id===player?' (você)':'');const c=document.createElement('canvas');c.width=800;c.height=600;c.dataset.live=id;c.className='art-canvas';c.style.background='#fff';if(old[id])c.getContext('2d').drawImage(old[id],0,0);else{c.getContext('2d').fillStyle='#fff';c.getContext('2d').fillRect(0,0,800,600)}wrap.append(name,c);host.append(wrap)})}
function submitDrawing(){if(submitted||game.phase!=='draw')return;submitted=true;const payload={id:player,name:myName(),image:canvas.toDataURL('image/jpeg',.65)};game.drawings[player]=payload;send('draw-submit',payload);if(isHost&&Object.keys(game.drawings).length>=Object.keys(players).length)beginVote();$('drawing').classList.add('hidden');say('Desenho enviado. Aguarde a votação.');if(isHost)syncState()}
$('submit').onclick=submitDrawing;
function renderVotes(){const list=Object.values(game.drawings||{});$('submissions').innerHTML=list.map(d=>'<div class="drawing-card"><div class="drawing-name">'+escapeHtml(d.name)+'</div><img src="'+d.image+'" alt="Desenho de '+escapeHtml(d.name)+'"><button data-vote="'+d.id+'" '+(d.id===player||game.votes[player]?'disabled':'')+'>'+(d.id===player?'Seu desenho':game.votes[player]?'Voto registrado':'Votar nesta obra')+'</button></div>').join('')||'<p class="muted">Aguardando os desenhos enviados...</p>';$('submissions').querySelectorAll('[data-vote]').forEach(b=>b.onclick=()=>{const target=b.dataset.vote;if(target===player||game.votes[player])return;game.votes[player]=target;send('vote',{voter:player,target});if(isHost){game.scores[target]=(game.scores[target]||0)+1;syncState();if(Object.keys(game.votes).length>=Object.keys(players).length)finishRound()}renderVotes();say('Voto registrado!')});$('nextRound').classList.toggle('hidden',!isHost)}
function finishRound(){if(!isHost)return;if(game.round>=3){game.phase='results';syncState();render()}else{$('nextRound').classList.remove('hidden');say('Votação concluída. O anfitrião pode iniciar a próxima rodada.')}}
function renderScores(){const arr=Object.entries(game.scores||{}).sort((a,b)=>b[1]-a[1]);$('scores').innerHTML=arr.map(([id,score],i)=>'<div class="score-row">#'+(i+1)+' · '+escapeHtml(players[id]?.name||'Jogador')+' — <strong>'+score+' ponto(s)</strong></div>').join('')||'<p class="muted">Sem pontuação ainda.</p>'}
})();