/* Draw Battle Arena - lógica do jogo e Supabase Realtime */
(() => {
'use strict';
const SUPABASE_URL='https://alfcxgmrztuioegejodm.supabase.co';
const SUPABASE_KEY='sb_publishable_QgKVX1O7yu_f9GlumEPM7Q_hDR7wQxj';
const sb=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
const $=id=>document.getElementById(id);
const THEMES=['Animais','Personagens','Comida','Veículos','Monstros','Esportes','Espaço','Objetos do dia a dia','Criaturas fantásticas','Natureza','Robôs','Profissões'];
const PALETTE=['#000000','#ffffff','#7f7f7f','#c3c3c3','#880015','#ed1c24','#ff7f27','#fff200','#22b14c','#00a2e8','#3f48cc','#a349a4','#b97a57','#ffaec9','#ffc90e','#efe4b0','#b5e61d','#99d9ea','#7092be','#c8bfe7','#ff6b6b','#ff9f43','#feca57','#1dd1a1','#54a0ff','#5f27cd','#f368e0','#576574','#10ac84','#222f3e'];
let channel=null,room='',player='',isHost=false,players={},timer=null,seconds=120,strokeColor='#000000',eraser=false,painting=false,activeStroke=null,undoStack=[],submitted=false,roundToken=0,tool='brush',brushSize=8,shapePreview=null;
let game={phase:'lobby',round:1,theme:'',usedThemes:[],drawings:{},votes:{},scores:{}};
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
 $('setup').classList.add('hidden');$('arena').classList.remove('hidden');$('durationSetting').classList.toggle('hidden',!isHost||game.phase!=='lobby');$('durationSetting').classList.toggle('hidden',!isHost||game.phase!=='lobby');
 $('codeLabel').textContent=room;$('theme').textContent=game.theme||'Aguardando anfitrião...';
 $('roundInfo').textContent=game.phase==='lobby'?'3 rodadas · '+(game.duration||120)+' segundos por desenho':'Rodada '+game.round+' de 3';
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
 game={phase:'lobby',round:1,theme:'',duration:120,drawings:{},votes:{},scores:{[player]:0}};
 channel=sb.channel('draw-battle-'+room,{config:{presence:{key:player},broadcast:{self:false}}});
 channel.on('presence',{event:'sync'},()=>{const fresh={};Object.values(channel.presenceState()).flat().forEach(p=>{if(p?.id)fresh[p.id]=p});if(Object.keys(fresh).length){players=fresh;if(isHost)syncState();renderPlayers()}});
 channel.on('broadcast',{event:'state'},({payload})=>{if(isHost||!payload)return;const oldPhase=game.phase,oldRound=game.round;game=payload.game;players=payload.players||players;render();if(game.phase==='draw'&&(oldPhase!=='draw'||oldRound!==game.round))startTimer(game.duration||120);else if(game.phase!=='draw'&&timer){clearInterval(timer);timer=null}});
 channel.on('broadcast',{event:'stroke-start'},({payload})=>{if(payload?.id!==player)drawStrokeStart(payload)});
 channel.on('broadcast',{event:'stroke-move'},({payload})=>{if(payload?.id!==player)drawStrokeMove(payload)});
 channel.on('broadcast',{event:'stroke-end'},({payload})=>{if(payload?.id!==player)drawStrokeEnd(payload)});
 channel.on('broadcast',{event:'shape-draw'},({payload})=>{if(payload?.id!==player&&payload?.shape)drawShape($('liveDrawings').querySelector('[data-live="'+payload.id+'"]'),payload.shape)});
 channel.on('broadcast',{event:'canvas-snapshot'},({payload})=>{if(payload?.id!==player&&payload?.image)paintSnapshot($('liveDrawings').querySelector('[data-live="'+payload.id+'"]'),payload.image)});
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
$('start').onclick=()=>{if(!isHost)return;const firstTheme=THEMES[Math.floor(Math.random()*THEMES.length)];game={phase:'draw',round:1,theme:firstTheme,duration:Number($('roundDuration').value)||120,usedThemes:[firstTheme],drawings:{},votes:{},scores:Object.fromEntries(Object.keys(players).map(id=>[id,0]))};submitted=false;resetDrawing();syncState();render();startTimer(game.duration)};
function startTimer(value){if(timer)clearInterval(timer);seconds=value;$('countdown').textContent=seconds+'s';const token=++roundToken;timer=setInterval(()=>{if(token!==roundToken)return;seconds--;$('countdown').textContent=seconds+'s';if(seconds<=0){clearInterval(timer);if(!submitted)submitDrawing();if(isHost)beginVote()}},1000)}
function beginVote(){if(!isHost||game.phase!=='draw')return;game.phase='vote';if(timer)clearInterval(timer);syncState();render();say('Tempo encerrado! Hora de votar.')}
function startNextRound(){if(!isHost)return;if(game.round>=3){game.phase='results';syncState();render();return}game.round++;game.phase='draw';const availableThemes=THEMES.filter(t=>!(game.usedThemes||[]).includes(t));game.theme=availableThemes[Math.floor(Math.random()*availableThemes.length)]||THEMES[(game.round-1)%THEMES.length];game.usedThemes=[...(game.usedThemes||[]),game.theme];game.drawings={};game.votes={};submitted=false;resetDrawing();syncState();render();startTimer(game.duration||120)}
$('nextRound').onclick=startNextRound;
$('playAgain').onclick=()=>{if(!isHost)return say('Só o anfitrião pode reiniciar a partida.');game={phase:'lobby',round:1,theme:'',drawings:{},votes:{},scores:Object.fromEntries(Object.keys(players).map(id=>[id,0]))};submitted=false;syncState();render()};
function getPos(e){const r=canvas.getBoundingClientRect();return{x:(e.clientX-r.left)*canvas.width/r.width,y:(e.clientY-r.top)*canvas.height/r.height}}
function drawSegment(target,p,prev){if(!target||!p)return;const c=target.getContext('2d');c.lineCap='round';c.lineJoin='round';c.strokeStyle=p.color;c.lineWidth=p.width;c.beginPath();c.moveTo(prev?prev.x:p.x,prev?prev.y:p.y);c.lineTo(p.x,p.y);c.stroke()}
function drawStrokeStart(p){if(!p)return;const g=$('liveDrawings').querySelector('[data-live="'+p.id+'"]');if(g)drawSegment(g,p.point,null)}
function drawStrokeMove(p){if(!p)return;const g=$('liveDrawings').querySelector('[data-live="'+p.id+'"]');if(g)drawSegment(g,p.point,p.prev)}
function drawStrokeEnd(){}
function drawShape(target,shape){if(!target||!shape)return;const c=target.getContext('2d'),{x1,y1,x2,y2,color,width,kind}=shape;c.strokeStyle=color;c.lineWidth=width;c.lineCap='round';c.lineJoin='round';c.beginPath();if(kind==='line'){c.moveTo(x1,y1);c.lineTo(x2,y2)}else if(kind==='rect'){c.rect(x1,y1,x2-x1,y2-y1)}else if(kind==='ellipse'){c.ellipse((x1+x2)/2,(y1+y2)/2,Math.abs(x2-x1)/2,Math.abs(y2-y1)/2,0,0,Math.PI*2)}c.stroke()}
function paintSnapshot(target,data){if(!target)return;const im=new Image();im.onload=()=>{const c=target.getContext('2d');c.clearRect(0,0,target.width,target.height);c.drawImage(im,0,0,target.width,target.height)};im.src=data}
function broadcastSnapshot(){send('canvas-snapshot',{id:player,image:canvas.toDataURL('image/jpeg',.75)})}
function fillBucket(x,y,color){const image=ctx.getImageData(0,0,canvas.width,canvas.height),data=image.data,w=canvas.width,h=canvas.height,px0=Math.floor(x),py0=Math.floor(y),idx=(py0*w+px0)*4,target=[data[idx],data[idx+1],data[idx+2]],hex=color.slice(1),fill=[parseInt(hex.slice(0,2),16),parseInt(hex.slice(2,4),16),parseInt(hex.slice(4,6),16)];if(target.every((v,i)=>v===fill[i]))return;const stack=[[px0,py0]],seen=new Uint8Array(w*h);let count=0;while(stack.length&&count<450000){const [px,py]=stack.pop();if(px<0||py<0||px>=w||py>=h)continue;const n=py*w+px;if(seen[n])continue;seen[n]=1;const k=n*4;if(Math.abs(data[k]-target[0])>24||Math.abs(data[k+1]-target[1])>24||Math.abs(data[k+2]-target[2])>24)continue;data[k]=fill[0];data[k+1]=fill[1];data[k+2]=fill[2];data[k+3]=255;count++;stack.push([px+1,py],[px-1,py],[px,py+1],[px,py-1])}ctx.putImageData(image,0,0)}
function saveBeforeAction(){undoStack.push(canvas.toDataURL('image/png'));if(undoStack.length>40)undoStack.shift()}
canvas.addEventListener('pointerdown',e=>{if(game.phase!=='draw'||submitted)return;const p=getPos(e);if(tool==='bucket'){saveBeforeAction();fillBucket(p.x,p.y,strokeColor);broadcastSnapshot();paintSnapshot($('liveDrawings').querySelector('[data-live="'+player+'"]'),canvas.toDataURL('image/jpeg',.75));return}painting=true;canvas.setPointerCapture(e.pointerId);saveBeforeAction();shapePreview=ctx.getImageData(0,0,canvas.width,canvas.height);if(['line','rect','ellipse'].includes(tool)){activeStroke={kind:tool,x1:p.x,y1:p.y,x2:p.x,y2:p.y,color:strokeColor,width:brushSize};return}const color=tool==='eraser'?'#ffffff':strokeColor;activeStroke={kind:'stroke',color,width:tool==='pencil'?Math.max(1,brushSize/3):brushSize,points:[p]};drawSegment(canvas,{...p,color:activeStroke.color,width:activeStroke.width},null);send('stroke-start',{id:player,point:{...p,color:activeStroke.color,width:activeStroke.width}})});
canvas.addEventListener('pointermove',e=>{if(!painting||!activeStroke)return;const p=getPos(e);if(['line','rect','ellipse'].includes(activeStroke.kind)){ctx.putImageData(shapePreview,0,0);activeStroke.x2=p.x;activeStroke.y2=p.y;drawShape(canvas,activeStroke);return}const prev=activeStroke.points[activeStroke.points.length-1];activeStroke.points.push(p);drawSegment(canvas,{...p,color:activeStroke.color,width:activeStroke.width},prev);send('stroke-move',{id:player,prev,point:{...p,color:activeStroke.color,width:activeStroke.width}})});
function endStroke(){if(!painting)return;painting=false;if(activeStroke&&['line','rect','ellipse'].includes(activeStroke.kind)){ctx.putImageData(shapePreview,0,0);drawShape(canvas,activeStroke);send('shape-draw',{id:player,shape:activeStroke})}activeStroke=null;shapePreview=null;send('stroke-end',{id:player})}
canvas.addEventListener('pointerup',endStroke);canvas.addEventListener('pointercancel',endStroke);
function clearCanvas(announce=true){ctx.fillStyle='#fff';ctx.fillRect(0,0,800,600);if(announce){send('clear-canvas',{id:player});broadcastSnapshot()}}
function replayLocal(){const data=undoStack.pop();if(!data)return;const im=new Image();im.onload=()=>{ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(im,0,0,canvas.width,canvas.height);broadcastSnapshot()};im.src=data}
function resetDrawing(){clearCanvas(false);undoStack=[];submitted=false;$('countdown').textContent=(game.duration||120)+'s';$('liveDrawings').innerHTML='';renderLiveDrawings()}
$('eraser').onclick=()=>{setActiveTool('eraser')};
$('undo').onclick=()=>{replayLocal()};
$('clear').onclick=()=>{saveBeforeAction();clearCanvas();clearRemoteLive()};
function setActiveTool(next){tool=next;document.querySelectorAll('[data-tool]').forEach(b=>b.classList.toggle('active-tool',b.dataset.tool===next));say('Ferramenta selecionada: '+({brush:'Pincel',pencil:'Lápis',eraser:'Borracha',bucket:'Balde de tinta',line:'Linha',rect:'Retângulo',ellipse:'Elipse'}[next]||next))}
document.querySelectorAll('[data-tool]').forEach(b=>b.addEventListener('click',()=>setActiveTool(b.dataset.tool)));
$('brushSize').addEventListener('input',e=>{brushSize=Number(e.target.value);$('brushSizeLabel').textContent=brushSize+' px'});
$('customColor').addEventListener('input',e=>{strokeColor=e.target.value;document.querySelectorAll('.swatch').forEach(el=>el.classList.toggle('active',el.dataset.color===strokeColor));if(tool==='eraser')setActiveTool('brush')});
function clearRemoteLive(){const c=$('liveDrawings');c.querySelectorAll('canvas').forEach(el=>{const x=el.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,el.width,el.height)})}
$('colors').innerHTML=PALETTE.map(c=>'<button class="swatch '+(c===strokeColor?'active':'')+'" data-color="'+c+'" style="background:'+c+'" aria-label="Cor '+c+'" title="'+c+'"></button>').join('');
$('colors').addEventListener('click',e=>{const b=e.target.closest('[data-color]');if(!b)return;strokeColor=b.dataset.color;$('customColor').value=strokeColor;if(tool==='eraser')setActiveTool('brush');document.querySelectorAll('.swatch').forEach(el=>el.classList.toggle('active',el===b))});
function renderLiveDrawings(){const host=$('liveDrawings');const ids=Object.keys(players);const old={};host.querySelectorAll('canvas').forEach(c=>old[c.dataset.live]=c);host.innerHTML='';ids.forEach(id=>{const wrap=document.createElement('div');wrap.className='drawing-card';const name=document.createElement('div');name.className='drawing-name';name.textContent=(players[id]?.name||'Jogador')+(id===player?' (você)':'');const c=document.createElement('canvas');c.width=800;c.height=600;c.dataset.live=id;c.className='art-canvas';c.style.background='#fff';if(old[id])c.getContext('2d').drawImage(old[id],0,0);else{c.getContext('2d').fillStyle='#fff';c.getContext('2d').fillRect(0,0,800,600)}wrap.append(name,c);host.append(wrap)})}
function submitDrawing(){if(submitted||game.phase!=='draw')return;submitted=true;const payload={id:player,name:myName(),image:canvas.toDataURL('image/jpeg',.65)};game.drawings[player]=payload;send('draw-submit',payload);if(isHost&&Object.keys(game.drawings).length>=Object.keys(players).length)beginVote();$('drawing').classList.add('hidden');say('Desenho enviado. Aguarde a votação.');if(isHost)syncState()}
$('submit').onclick=submitDrawing;
function renderVotes(){const list=Object.values(game.drawings||{});$('submissions').innerHTML=list.map(d=>'<div class="drawing-card"><div class="drawing-name">'+escapeHtml(d.name)+'</div><img src="'+d.image+'" alt="Desenho de '+escapeHtml(d.name)+'"><button data-vote="'+d.id+'" '+(d.id===player||game.votes[player]?'disabled':'')+'>'+(d.id===player?'Seu desenho':game.votes[player]?'Voto registrado':'Votar nesta obra')+'</button></div>').join('')||'<p class="muted">Aguardando os desenhos enviados...</p>';$('submissions').querySelectorAll('[data-vote]').forEach(b=>b.onclick=()=>{const target=b.dataset.vote;if(target===player||game.votes[player])return;game.votes[player]=target;send('vote',{voter:player,target});if(isHost){game.scores[target]=(game.scores[target]||0)+1;syncState();if(Object.keys(game.votes).length>=Object.keys(players).length)finishRound()}renderVotes();say('Voto registrado!')});$('nextRound').classList.toggle('hidden',!isHost)}
function finishRound(){if(!isHost)return;if(game.round>=3){game.phase='results';syncState();render()}else{$('nextRound').classList.remove('hidden');say('Votação concluída. O anfitrião pode iniciar a próxima rodada.')}}
function renderScores(){const arr=Object.entries(game.scores||{}).sort((a,b)=>b[1]-a[1]);$('scores').innerHTML=arr.map(([id,score],i)=>'<div class="score-row">#'+(i+1)+' · '+escapeHtml(players[id]?.name||'Jogador')+' — <strong>'+score+' ponto(s)</strong></div>').join('')||'<p class="muted">Sem pontuação ainda.</p>'}
})();