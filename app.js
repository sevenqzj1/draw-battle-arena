/* Draw Battle Arena — multiplayer, desenho e votação */
(() => {
'use strict';
const SUPABASE_URL='https://alfcxgmrztuioegejodm.supabase.co';
const SUPABASE_KEY='sb_publishable_QgKVX1O7yu_f9GlumEPM7Q_hDR7wQxj';
const sb=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
const $=id=>document.getElementById(id);
const MAX_PLAYERS=15, TOTAL_ROUNDS=3;
const THEMES=[
 {name:'Raposa',emoji:'🦊',category:'Animais'},{name:'Gato',emoji:'🐈',category:'Animais'},
 {name:'Foguete',emoji:'🚀',category:'Espaço'},{name:'Robô',emoji:'🤖',category:'Robôs'},
 {name:'Castelo',emoji:'🏰',category:'Fantasia'},{name:'Hambúrguer',emoji:'🍔',category:'Comida'},
 {name:'Bicicleta',emoji:'🚲',category:'Veículos'},{name:'Polvo',emoji:'🐙',category:'Animais'},
 {name:'Dragão',emoji:'🐉',category:'Fantasia'},{name:'Abacaxi',emoji:'🍍',category:'Natureza'},
 {name:'Astronauta',emoji:'🧑‍🚀',category:'Espaço'},{name:'Pinguim',emoji:'🐧',category:'Animais'}
];
const PALETTE=['#000000','#ffffff','#7f7f7f','#c3c3c3','#880015','#ed1c24','#ff7f27','#fff200','#22b14c','#00a2e8','#3f48cc','#a349a4','#b97a57','#ffaec9','#ffc90e','#efe4b0','#b5e61d','#99d9ea','#7092be','#c8bfe7','#ff6b6b','#ff9f43','#feca57','#1dd1a1','#54a0ff','#5f27cd','#f368e0','#576574','#10ac84','#222f3e'];
let channel=null,room='',player='',isHost=false,players={},timer=null,seconds=120,strokeColor='#000000',painting=false,activeStroke=null,undoStack=[],redoStack=[],submitted=false,roundToken=0,tool='brush',brushSize=8,shapePreview=null,strokeCounter=0,seenStrokes=new Set(),lastStateAt=0;
let game={phase:'lobby',round:1,theme:'',reference:'',duration:120,usedThemes:[],drawings:{},votes:{},scores:{},voteDeadline:0};
const canvas=$('canvas'),ctx=canvas.getContext('2d',{willReadFrequently:true});
ctx.lineCap='round';ctx.lineJoin='round';ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
const escapeHtml=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function say(message){$('status').textContent=message;$('status').classList.remove('hidden')}
function code(){return Math.random().toString(36).slice(2,8).toUpperCase()}
function myName(){return players[player]?.name||'Jogador'}
function send(event,payload){if(channel)channel.send({type:'broadcast',event,payload})}
function syncState(){if(isHost)send('state',{game,players})}
function refImage(themeObj){const emoji=themeObj?.emoji||'🎨',name=themeObj?.name||'Referência';const svg='<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600"><rect width="800" height="600" rx="28" fill="#f8fafc"/><path d="M0 440 Q190 390 400 445 T800 430 V600 H0Z" fill="#dbeafe"/><circle cx="650" cy="110" r="46" fill="#fde68a"/><g font-family="Arial,sans-serif" text-anchor="middle"><text x="400" y="115" font-size="24" fill="#475569">IMAGEM DE REFERÊNCIA</text><text x="400" y="355" font-size="220">'+emoji+'</text><text x="400" y="515" font-size="44" font-weight="700" fill="#0f172a">'+escapeHtml(name)+'</text></g></svg>';return 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg)}
function renderPlayers(){const count=Object.keys(players).length;$('playerCount').textContent=count+'/'+MAX_PLAYERS;$('players').innerHTML=Object.values(players).map(p=>'<span class="pill">'+escapeHtml(p.name)+(p.id===player?' (você)':'')+'</span>').join('')||'<span class="muted">Esperando jogadores entrarem...</span>'}
function stageLabel(){return ({lobby:'SALA',ready:'PREPARAÇÃO',draw:'DESENHO',vote:'VOTAÇÃO',results:'RESULTADOS'})[game.phase]||'SALA'}
function renderReference(){const img=$('referenceImage');if(game.reference){img.src=game.reference;img.alt='Imagem de referência: '+game.theme;$('voteReferenceImage').src=game.reference;$('voteReferenceImage').alt='Referência para comparar os desenhos';$('referencePanel').classList.remove('hidden')}else $('referencePanel').classList.add('hidden')}
function render(){
 $('setup').classList.add('hidden');$('loginGate').classList.add('hidden');$('arena').classList.remove('hidden');
 $('durationSetting').classList.toggle('hidden',!isHost||game.phase!=='lobby');
 $('codeLabel').textContent=room;$('theme').textContent=game.theme||'Aguardando anfitrião...';
 $('roundInfo').textContent=game.phase==='lobby'?TOTAL_ROUNDS+' rodadas · '+(game.duration||120)+' segundos por desenho':'Rodada '+game.round+' de '+TOTAL_ROUNDS;
 $('start').classList.toggle('hidden',!isHost||game.phase!=='lobby');
 $('stageBadge').textContent=stageLabel();
 $('phaseText').textContent=({lobby:'Compartilhe o código e comece quando todos estiverem prontos.',ready:'Prepare-se para reproduzir a imagem de referência.',draw:'Reproduza a referência. Os traços são sincronizados ao vivo.',vote:'Compare os desenhos com a referência e escolha apenas um.',results:'Rodada concluída. Confira votos e pódio.'})[game.phase]||'';
 $('drawing').classList.toggle('hidden',game.phase!=='draw'||submitted);
 $('liveGallery').classList.toggle('hidden',game.phase!=='draw');
 $('voting').classList.toggle('hidden',game.phase!=='vote');
 $('results').classList.toggle('hidden',game.phase!=='results');
 $('nextRound').classList.toggle('hidden',!isHost||game.phase!=='results'||game.round>=TOTAL_ROUNDS);
 renderPlayers();renderReference();
 if(game.phase==='draw')renderLiveDrawings();
 if(game.phase==='vote')renderVotes();
 if(game.phase==='results')renderScores();
}
function startConnect(roomCode,name,host){
 room=roomCode;player=crypto.randomUUID();isHost=host;
 players={[player]:{id:player,name:name||'Jogador'}};
 game={phase:'lobby',round:1,theme:'',reference:'',duration:120,usedThemes:[],drawings:{},votes:{},scores:{[player]:0},voteDeadline:0};
 channel=sb.channel('draw-battle-'+room,{config:{presence:{key:player},broadcast:{self:false}}});
 channel.on('presence',{event:'sync'},()=>{
  const fresh={};Object.values(channel.presenceState()).flat().forEach(p=>{if(p?.id)fresh[p.id]=p});
  if(!fresh[player])return;
  if(Object.keys(fresh).length>MAX_PLAYERS){
   if(fresh[player]&&!isHost){say('A sala está cheia (15/15). Você não entrou na partida.');sb.removeChannel(channel);channel=null;room='';$('arena').classList.add('hidden');$('setup').classList.remove('hidden');return}
   const ordered=Object.values(fresh).sort((a,b)=>(a.joinedAt||0)-(b.joinedAt||0));const excess=ordered.slice(MAX_PLAYERS).map(p=>p.id);if(isHost&&excess.length){send('room-full',{ids:excess});excess.forEach(id=>delete fresh[id])}
  }
  players=fresh;if(isHost)syncState();renderPlayers();
 });
 channel.on('broadcast',{event:'room-full'},({payload})=>{if(payload?.ids?.includes(player)){say('A sala está cheia (15/15). Entre em outra sala.');sb.removeChannel(channel);channel=null;room='';$('arena').classList.add('hidden');$('setup').classList.remove('hidden')}});
 channel.on('broadcast',{event:'state'},({payload})=>{
  if(isHost||!payload)return;const oldPhase=game.phase,oldRound=game.round;game=payload.game;players=payload.players||players;
  if(Object.keys(players).length>MAX_PLAYERS){say('A sala atingiu o limite de 15 jogadores.');return}
  if(game.phase!=='draw')submitted=false;
  render();
  if(game.phase==='draw'&&(oldPhase!=='draw'||oldRound!==game.round))startTimer(game.duration||120);
  else if(game.phase==='vote'&&(oldPhase!=='vote'||oldRound!==game.round))startVoteTimer();
  else if(game.phase!=='draw'&&game.phase!=='vote'&&timer){clearInterval(timer);timer=null}
 });
 channel.on('broadcast',{event:'stroke-start'},({payload})=>{if(payload?.id!==player)drawStrokeStart(payload)});
 channel.on('broadcast',{event:'stroke-move'},({payload})=>{if(payload?.id!==player)drawStrokeMove(payload)});
 channel.on('broadcast',{event:'stroke-end'},({payload})=>{if(payload?.id!==player)drawStrokeEnd(payload)});
 channel.on('broadcast',{event:'canvas-snapshot'},({payload})=>{if(payload?.id!==player&&payload?.image){const target=getLiveCanvas(payload.id);paintSnapshot(target,payload.image)}});
 channel.on('broadcast',{event:'clear-canvas'},({payload})=>{if(payload?.id!==player){const target=getLiveCanvas(payload.id);if(target){const c=target.getContext('2d');c.fillStyle='#fff';c.fillRect(0,0,target.width,target.height)}}});
 channel.on('broadcast',{event:'draw-submit'},({payload})=>{
  if(!payload?.id||!payload.image)return;
  game.drawings=game.drawings||{};game.drawings[payload.id]=payload;renderLiveDrawings();if(game.phase==='vote')renderVotes();
  if(isHost&&Object.keys(game.drawings).length>=Object.keys(players).length)beginVote();
 });
 channel.on('broadcast',{event:'vote'},({payload})=>{
  if(!isHost||!payload||payload.voter===payload.target||game.votes[payload.voter])return;
  if(!game.drawings[payload.target]||!players[payload.voter]||game.phase!=='vote')return;
  game.votes[payload.voter]={target:payload.target};syncState();
  if(validVoterCount()&&Object.keys(game.votes).length>=validVoterCount())finishRound();
 });
 channel.subscribe(async status=>{
  if(status==='SUBSCRIBED'){
   await channel.track({id:player,name:players[player].name,joinedAt:Date.now()});
   render();say('Conectado à sala '+room+'.');
   if(isHost)syncState();
  }else if(status==='CHANNEL_ERROR'||status==='TIMED_OUT'){
   say('Conexão interrompida. Tentando reconectar…');setTimeout(()=>{if(channel)channel.subscribe()},1800)
  }else if(status==='CLOSED')say('Conexão encerrada.');
 });
}
$('loginEnter').onclick=()=>{const name=$('loginName').value.trim();if(!name)return say('Digite seu nome para continuar.');$('hostName').value=name;$('joinName').value=name;$('loginGate').classList.add('hidden');$('setup').classList.remove('hidden');say('Bem-vindo, '+name+'! Crie uma sala ou entre com o código de um amigo.')};
$('loginName').addEventListener('keydown',e=>{if(e.key==='Enter')$('loginEnter').click()});
$('create').onclick=()=>{const name=$('hostName').value.trim();if(!name)return say('Digite seu nome para criar uma sala.');startConnect(code(),name,true)};
$('join').onclick=()=>{const name=$('joinName').value.trim(),roomCode=$('roomCode').value.trim().toUpperCase();if(!name||roomCode.length!==6)return say('Digite seu nome e o código de seis caracteres.');startConnect(roomCode,name,false)};
$('roomCode').addEventListener('input',e=>e.target.value=e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,6));
$('copy').onclick=async()=>{try{await navigator.clipboard.writeText(room);say('Código copiado!')}catch{say('Código da sala: '+room)}};
$('leave').onclick=async()=>{if(timer)clearInterval(timer);if(channel)await sb.removeChannel(channel);channel=null;room='';players={};game={phase:'lobby',round:1,theme:'',drawings:{},votes:{},scores:{}};$('arena').classList.add('hidden');$('setup').classList.remove('hidden');say('Você saiu da arena.')};
function pickTheme(){const options=THEMES.filter(t=>!(game.usedThemes||[]).includes(t.name));return options[Math.floor(Math.random()*options.length)]||THEMES[Math.floor(Math.random()*THEMES.length)]}
$('start').onclick=()=>{if(!isHost)return;const chosen=pickTheme();game={phase:'draw',round:1,theme:chosen.name,reference:refImage(chosen),duration:Number($('roundDuration').value)||120,usedThemes:[chosen.name],drawings:{},votes:{},scores:Object.fromEntries(Object.keys(players).map(id=>[id,0])),voteDeadline:0};submitted=false;resetDrawing();syncState();render();startTimer(game.duration)};
function startTimer(value){if(timer)clearInterval(timer);seconds=value;$('countdown').textContent=seconds+'s';const token=++roundToken;timer=setInterval(()=>{if(token!==roundToken)return;seconds--;$('countdown').textContent=seconds+'s';if(seconds<=0){clearInterval(timer);timer=null;if(isHost){if(game.phase==='draw'){if(!submitted)submitDrawing();beginVote()}else if(game.phase==='vote')finishRound()}}},1000)}
function beginVote(){if(!isHost||game.phase!=='draw')return;if(timer){clearInterval(timer);timer=null}game.phase='vote';game.voteDeadline=Date.now()+45000;syncState();render();startVoteTimer();say('Desenho encerrado. Votação aberta por 45 segundos.') }
function startVoteTimer(){if(timer)clearInterval(timer);seconds=45;$('countdown').textContent='45s';const token=++roundToken;timer=setInterval(()=>{if(token!==roundToken)return;seconds--;$('countdown').textContent=seconds+'s';if(seconds<=0){clearInterval(timer);timer=null;if(isHost)finishRound()}},1000)}
function startNextRound(){if(!isHost)return;if(game.round>=TOTAL_ROUNDS){game.phase='results';syncState();render();return}game.round++;const chosen=pickTheme();game.phase='draw';game.theme=chosen.name;game.reference=refImage(chosen);game.usedThemes=[...(game.usedThemes||[]),chosen.name];game.drawings={};game.votes={};game.voteDeadline=0;submitted=false;resetDrawing();syncState();render();startTimer(game.duration||120)}
$('nextRound').onclick=startNextRound;
$('playAgain').onclick=()=>{if(!isHost)return say('Só o anfitrião pode reiniciar a partida.');game={phase:'lobby',round:1,theme:'',reference:'',duration:120,usedThemes:[],drawings:{},votes:{},scores:Object.fromEntries(Object.keys(players).map(id=>[id,0])),voteDeadline:0};submitted=false;resetDrawing();syncState();render()};
function getPos(e){const r=canvas.getBoundingClientRect();return{x:Math.max(0,Math.min(canvas.width,(e.clientX-r.left)*canvas.width/r.width)),y:Math.max(0,Math.min(canvas.height,(e.clientY-r.top)*canvas.height/r.height))}}
function drawSegment(target,p,prev){if(!target||!p)return;const c=target.getContext('2d');c.lineCap='round';c.lineJoin='round';c.strokeStyle=p.color||'#000';c.lineWidth=p.width||4;c.beginPath();c.moveTo(prev?prev.x:p.x,prev?prev.y:p.y);c.lineTo(p.x,p.y);c.stroke()}
function getLiveCanvas(id){return $('liveDrawings').querySelector('canvas[data-live="'+CSS.escape(id)+'"]')}
function drawStrokeStart(p){if(!p)return;const g=getLiveCanvas(p.id);if(g){drawSegment(g,p.point,null);seenStrokes.add(p.strokeId)}}
function drawStrokeMove(p){if(!p||!p.strokeId)return;const key=p.strokeId+':'+p.index;if(seenStrokes.has(key))return;const g=getLiveCanvas(p.id);if(g){drawSegment(g,p.point,p.prev);seenStrokes.add(key)}}
function drawStrokeEnd(p){if(p?.id){const target=getLiveCanvas(p.id);if(target)paintSnapshot(target,p.image||'')}}
function drawShape(target,shape){if(!target||!shape)return;const c=target.getContext('2d'),{x1,y1,x2,y2,color,width,kind}=shape;c.strokeStyle=color;c.lineWidth=width;c.lineCap='round';c.lineJoin='round';c.beginPath();if(kind==='line'){c.moveTo(x1,y1);c.lineTo(x2,y2)}else if(kind==='rect'){c.rect(x1,y1,x2-x1,y2-y1)}else if(kind==='ellipse'){c.ellipse((x1+x2)/2,(y1+y2)/2,Math.abs(x2-x1)/2,Math.abs(y2-y1)/2,0,0,Math.PI*2)}c.stroke()}
function paintSnapshot(target,data){if(!target||!data)return;const im=new Image();im.onload=()=>{const c=target.getContext('2d');c.clearRect(0,0,target.width,target.height);c.drawImage(im,0,0,target.width,target.height)};im.src=data}
function broadcastSnapshot(){if(channel)send('canvas-snapshot',{id:player,image:canvas.toDataURL('image/jpeg',.7)})}
function fillBucket(x,y,color){const image=ctx.getImageData(0,0,canvas.width,canvas.height),data=image.data,w=canvas.width,h=canvas.height,px0=Math.max(0,Math.min(w-1,Math.floor(x))),py0=Math.max(0,Math.min(h-1,Math.floor(y))),idx=(py0*w+px0)*4,target=[data[idx],data[idx+1],data[idx+2]],hex=color.slice(1),fill=[parseInt(hex.slice(0,2),16),parseInt(hex.slice(2,4),16),parseInt(hex.slice(4,6),16)];if(target.every((v,i)=>v===fill[i]))return;const seen=new Uint8Array(w*h),stack=new Int32Array(w*h);let top=0,count=0;stack[top++]=py0*w+px0;seen[py0*w+px0]=1;while(top&&count<w*h){const n=stack[--top],k=n*4;if(Math.abs(data[k]-target[0])>24||Math.abs(data[k+1]-target[1])>24||Math.abs(data[k+2]-target[2])>24)continue;data[k]=fill[0];data[k+1]=fill[1];data[k+2]=fill[2];data[k+3]=255;count++;const px=n%w,py=Math.floor(n/w);if(px+1<w&&!seen[n+1]){seen[n+1]=1;stack[top++]=n+1}if(px>0&&!seen[n-1]){seen[n-1]=1;stack[top++]=n-1}if(py+1<h&&!seen[n+w]){seen[n+w]=1;stack[top++]=n+w}if(py>0&&!seen[n-w]){seen[n-w]=1;stack[top++]=n-w}}ctx.putImageData(image,0,0)}
function saveBeforeAction(){undoStack.push(canvas.toDataURL('image/png'));if(undoStack.length>40)undoStack.shift();redoStack=[]}
function restoreImage(data,otherStack){if(!data)return;otherStack.push(canvas.toDataURL('image/png'));const im=new Image();im.onload=()=>{ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(im,0,0,canvas.width,canvas.height);broadcastSnapshot()};im.src=data}
function resetDrawing(){ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);undoStack=[];redoStack=[];submitted=false;seenStrokes.clear();$('countdown').textContent=(game.duration||120)+'s';$('liveDrawings').innerHTML='';renderLiveDrawings()}
canvas.addEventListener('contextmenu',e=>e.preventDefault());
canvas.addEventListener('pointerdown',e=>{if(game.phase!=='draw'||submitted)return;e.preventDefault();const p=getPos(e);try{canvas.setPointerCapture(e.pointerId)}catch{}if(tool==='bucket'){saveBeforeAction();fillBucket(p.x,p.y,strokeColor);broadcastSnapshot();return}painting=true;saveBeforeAction();shapePreview=ctx.getImageData(0,0,canvas.width,canvas.height);if(['line','rect','ellipse'].includes(tool)){activeStroke={kind:tool,x1:p.x,y1:p.y,x2:p.x,y2:p.y,color:strokeColor,width:brushSize};return}const color=tool==='eraser'?'#ffffff':strokeColor;activeStroke={kind:'stroke',color,width:tool==='pencil'?Math.max(1,brushSize/3):brushSize,points:[p],id:++strokeCounter};const point={...p,color:activeStroke.color,width:activeStroke.width};drawSegment(canvas,point,null);send('stroke-start',{id:player,strokeId:player+':'+activeStroke.id,point});});
canvas.addEventListener('pointermove',e=>{if(!painting||!activeStroke)return;e.preventDefault();const p=getPos(e);if(['line','rect','ellipse'].includes(activeStroke.kind)){ctx.putImageData(shapePreview,0,0);activeStroke.x2=p.x;activeStroke.y2=p.y;drawShape(canvas,activeStroke);return}const prev=activeStroke.points[activeStroke.points.length-1];activeStroke.points.push(p);const point={...p,color:activeStroke.color,width:activeStroke.width};drawSegment(canvas,point,prev);send('stroke-move',{id:player,strokeId:player+':'+activeStroke.id,index:activeStroke.points.length,prev,point});});
function endStroke(){if(!painting)return;painting=false;if(activeStroke&&['line','rect','ellipse'].includes(activeStroke.kind)){ctx.putImageData(shapePreview,0,0);drawShape(canvas,activeStroke);send('canvas-snapshot',{id:player,image:canvas.toDataURL('image/jpeg',.7)})}else if(activeStroke){send('stroke-end',{id:player,strokeId:player+':'+activeStroke.id,image:canvas.toDataURL('image/jpeg',.7)})}activeStroke=null;shapePreview=null}
canvas.addEventListener('pointerup',endStroke);canvas.addEventListener('pointercancel',endStroke);canvas.addEventListener('lostpointercapture',endStroke);
function clearCanvas(announce=true){ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);if(announce){send('clear-canvas',{id:player});broadcastSnapshot()}}
$('eraser').onclick=()=>setActiveTool('eraser');
$('undo').onclick=()=>{const data=undoStack.pop();if(data)restoreImage(data,redoStack)};
$('redo').onclick=()=>{const data=redoStack.pop();if(data)restoreImage(data,undoStack)};
$('clear').onclick=()=>{if(!confirm('Tem certeza de que deseja limpar todo o desenho?'))return;saveBeforeAction();clearCanvas();say('Tela limpa.')};
function setActiveTool(next){tool=next;document.querySelectorAll('[data-tool]').forEach(b=>b.classList.toggle('active-tool',b.dataset.tool===next));say('Ferramenta selecionada: '+({brush:'Pincel',pencil:'Lápis',eraser:'Borracha',bucket:'Balde de tinta',line:'Linha',rect:'Retângulo',ellipse:'Elipse'}[next]||next))}
document.querySelectorAll('[data-tool]').forEach(b=>b.addEventListener('click',()=>setActiveTool(b.dataset.tool)));
$('brushSize').addEventListener('input',e=>{brushSize=Number(e.target.value);$('brushSizeLabel').textContent=brushSize+' px'});
$('customColor').addEventListener('input',e=>{strokeColor=e.target.value;document.querySelectorAll('.swatch').forEach(el=>el.classList.toggle('active',el.dataset.color===strokeColor));if(tool==='eraser')setActiveTool('brush')});
$('colors').innerHTML=PALETTE.map(c=>'<button class="swatch '+(c===strokeColor?'active':'')+'" data-color="'+c+'" style="background:'+c+'" aria-label="Cor '+c+'" title="'+c+'"></button>').join('');
$('colors').addEventListener('click',e=>{const b=e.target.closest('[data-color]');if(!b)return;strokeColor=b.dataset.color;$('customColor').value=strokeColor;if(tool==='eraser')setActiveTool('brush');document.querySelectorAll('.swatch').forEach(el=>el.classList.toggle('active',el===b))});
function renderLiveDrawings(){const host=$('liveDrawings');const ids=Object.keys(players);const old={};host.querySelectorAll('canvas').forEach(c=>old[c.dataset.live]=c);host.innerHTML='';ids.forEach(id=>{const wrap=document.createElement('div');wrap.className='drawing-card';const name=document.createElement('div');name.className='drawing-name';name.textContent=(players[id]?.name||'Jogador')+(id===player?' (você)':'');const c=document.createElement('canvas');c.width=800;c.height=600;c.dataset.live=id;c.className='art-canvas';c.style.background='#fff';const cc=c.getContext('2d');cc.fillStyle='#fff';cc.fillRect(0,0,800,600);if(game.drawings?.[id]?.image)paintSnapshot(c,game.drawings[id].image);else if(old[id])cc.drawImage(old[id],0,0,800,600);wrap.append(name,c);host.append(wrap)})}
function submitDrawing(){if(submitted||game.phase!=='draw')return;submitted=true;const payload={id:player,name:myName(),image:canvas.toDataURL('image/jpeg',.72),round:game.round,submittedAt:Date.now()};game.drawings=game.drawings||{};game.drawings[player]=payload;send('draw-submit',payload);if(isHost){syncState();if(Object.keys(game.drawings).length>=validVoterCount())beginVote()}$('drawing').classList.add('hidden');say('Desenho enviado com sucesso. Aguarde a votação.');renderLiveDrawings()}
$('submit').onclick=submitDrawing;
function validVoterCount(){return Object.keys(players).length}
function renderVotes(){const entries=Object.values(game.drawings||{}).filter(d=>d?.image);const myVote=game.votes?.[player];const shuffled=[...entries].sort((a,b)=>hash(a.id+game.round)-hash(b.id+game.round));$('submissions').innerHTML=shuffled.map((d,i)=>{const disabled=d.id===player||!!myVote;const chosen=myVote?.target===d.id;return '<div class="drawing-card"><div class="drawing-name">Desenho '+String.fromCharCode(65+i)+'</div><img src="'+d.image+'" alt="Desenho para votação"><button data-vote="'+escapeHtml(d.id)+'" '+(disabled?'disabled':'')+'>'+(d.id===player?'Seu desenho':chosen?'Voto enviado':myVote?'Voto já registrado':'Votar neste desenho')+'</button></div>'}).join('')||'<p class="muted">Ainda não há desenhos enviados. A votação será encerrada sem travar a partida.</p>';if(!entries.length&&isHost)finishRound()}
function hash(s){let h=0;for(let i=0;i<s.length;i++)h=(h*31+s.charCodeAt(i))|0;return Math.abs(h)}
$('submissions').addEventListener('click',e=>{const b=e.target.closest('[data-vote]');if(!b||game.phase!=='vote')return;const target=b.dataset.vote;if(target===player||game.votes?.[player]||!game.drawings?.[target])return;game.votes=game.votes||{};game.votes[player]={target};send('vote',{voter:player,target,round:game.round});renderVotes();say('Voto registrado. A contagem fica oculta até o encerramento.');if(isHost){syncState();if(Object.keys(game.votes).length>=validVoterCount())finishRound()}});
function finishRound(){if(!isHost||game.phase!=='vote')return;if(timer){clearInterval(timer);timer=null}const tally={};Object.values(game.votes||{}).forEach(v=>{if(v?.target)tally[v.target]=(tally[v.target]||0)+1});game.lastTally=tally;game.phase='results';const max=Math.max(0,...Object.values(tally));game.winners=Object.keys(tally).filter(id=>tally[id]===max&&max>0);for(const [id,n] of Object.entries(tally))game.scores[id]=(game.scores[id]||0)+n;syncState();render();say(max?'Votação encerrada. Confira o resultado e o pódio.':'Votação encerrada sem votos válidos.');}
function renderScores(){const tally=game.lastTally||{};const rows=Object.entries(tally).sort((a,b)=>b[1]-a[1]);const max=rows.length?rows[0][1]:0;const valid=rows.filter(([,n])=>n>0);$('scores').innerHTML=valid.length?valid.map(([id,n])=>'<div class="score-row '+(n===max?'winner-row':'')+'">'+(n===max?'🏆 ':'')+escapeHtml(players[id]?.name||game.drawings?.[id]?.name||'Jogador')+' — <strong>'+n+' voto(s)</strong></div>').join(''):'<p class="muted">Não houve votos válidos nesta rodada. A partida pode continuar normalmente.</p>';
 const podium=$('podium');const ordered=valid;const positions=[];let lastVotes=null,rank=0;ordered.forEach(([id,v],i)=>{if(v!==lastVotes)rank=i+1;lastVotes=v;if(rank<=3)positions.push({id,v,rank})});podium.innerHTML=positions.length?positions.map(p=>'<div class="podium-card '+(p.rank===1?'podium-first':'')+'"><div class="podium-rank">'+p.rank+'º lugar'+(positions.filter(x=>x.rank===p.rank).length>1?' · empate':'')+'</div><img src="'+(game.drawings?.[p.id]?.image||'')+'" alt="Desenho de '+escapeHtml(players[p.id]?.name||'Jogador')+'"><strong>'+escapeHtml(players[p.id]?.name||game.drawings?.[p.id]?.name||'Jogador')+'</strong><span>'+p.v+' voto(s)</span></div>').join(''):'<p class="muted">O pódio será exibido quando houver votos válidos.</p>';
 $('resultsTitle').textContent=game.round>=TOTAL_ROUNDS?'Resultados da partida':'Resultado da rodada '+game.round;
 $('nextRound').classList.toggle('hidden',!isHost||game.round>=TOTAL_ROUNDS);
}
})();
