
/* main.js — Clean final with progress/tension fixes + vibration
   - Progress & tension UI show only while isFishing === true
   - UI hidden/reset after fishing finishes
   - Vibration when tension >= 80%
   - Fallback graphics if images missing
*/

/* ===== CONFIG ===== */
const MAP_W = 2000, MAP_H = 1600;
const LAKE = { x: MAP_W/2 - 400, y: MAP_H/2 - 300, w: 800, h: 600 };
const SHOP_BOARD = { x: LAKE.x + LAKE.w + 120, y: LAKE.y + 40, w: 84, h: 84 };
const SAVE_KEY = 'kancing_clean_save_v2';

const PATHS = {
  backgrounds: { day: 'images/backgrounds/sky_day.png', eve: 'images/backgrounds/sky_evening.png' },
  chars: ['images/characters/char1.png','images/characters/char2.png','images/characters/char3.png','images/characters/char4.png'],
  heads: ['images/heads/head1.png','images/heads/head2.png','images/heads/head3.png','images/heads/head4.png'],
  rods: ['images/rods/rod0.png','images/rods/rod1.png','images/rods/rod2.png','images/rods/rod3.png','images/rods/rod4.png'],
  fish: [
    'images/fish/fish0.png','images/fish/fish1.png','images/fish/fish2.png','images/fish/fish3.png',
    'images/fish/fish4.png','images/fish/fish5.png','images/fish/fish6.png','images/fish/fish7.png'
  ],
  title: 'images/titles/sesepuh.png'
};

const REAL_SECONDS_PER_INGAME_DAY = 5 * 60;
const TIME_SCALE = 1 / REAL_SECONDS_PER_INGAME_DAY;

/* ===== GAME DATA ===== */
const FISH_TYPES = [
  { key:'mujair', name:'Mujair', basePrice:50, weight:30 },
  { key:'parai', name:'Parai', basePrice:70, weight:25 },
  { key:'betok', name:'Betok', basePrice:40, weight:28 },
  { key:'tawes', name:'Tawes', basePrice:60, weight:22 },
  { key:'red_devil', name:'Red Devil', basePrice:75, weight:15 },
  { key:'baby_toman', name:'Baby Toman', basePrice:150, weight:6 },
  { key:'monster_toman', name:'Monster Toman', basePrice:500, weight:2 },
  { key:'gar', name:'Alligator Gar', basePrice:1500, weight:1 }
];
const MAX_ROD_LEVEL = 4;

/* ===== STATE ===== */
let player = { x: MAP_W/2, y: LAKE.y + LAKE.h + 140, size:64, speed:2.8, charIndex:0 };
let state = {
  money: 500,
  bait_worm: 0,
  bait_minnow: 0,
  bait_shrimp: 0,
  rodLevel: 1,
  fishInv: {},
  trophy: 0,
  x: player.x, y: player.y
};

/* fishing control flag */
let isFishing = false;

/* ===== DOM & CANVAS ===== */
const canvas = document.getElementById('worldCanvas');
const ctx = canvas.getContext('2d');
canvas.width = MAP_W; canvas.height = MAP_H;

const leftUI = {
  money: document.getElementById('money'),
  bait_worm: document.getElementById('bait_worm'),
  bait_minnow: document.getElementById('bait_minnow'),
  bait_shrimp: document.getElementById('bait_shrimp'),
  rodLevel: document.getElementById('rodLevel'),
  rodCost: document.getElementById('rodCost')
};
const centerUI = {
  fishingUI: document.getElementById('fishingUI'),
  cursor: document.getElementById('cursor'),
  progressFill: document.getElementById('progressFill'),
  tensionFill: document.getElementById('tensionFill'),
  fText: document.getElementById('fText')
};
const fishPopup = document.getElementById('fishPopup');
const fishPopupImg = document.getElementById('fishPopupImg');
const fishPopupName = document.getElementById('fishPopupName');
const shopModal = document.getElementById('shopModal');
const shopMoney = document.getElementById('shopMoney');
const fishCountEl = document.getElementById('fishCount');
const trophyEl = document.getElementById('trophy');
const topMsg = document.getElementById('topMsg');
const timeDisplay = document.getElementById('timeDisplay');
const titleBox = document.getElementById('titleBox');
const titleImg = document.getElementById('titleImg');

const btnUp = document.getElementById('btnUp');
const btnDown = document.getElementById('btnDown');
const btnLeft = document.getElementById('btnLeft');
const btnRight = document.getElementById('btnRight');
const actionBtn = document.getElementById('actionBtn');
const shopBtn = document.getElementById('shopBtn');
const charSel = document.getElementById('charSel');

/* ===== IMAGE LOADER ===== */
const IMG = { backgrounds: { day:null, eve:null }, chars:[], heads:[], rods:[], fish:[], title:null };
function loadImage(src){ return new Promise(res=>{ const i=new Image(); i.onload = ()=>res(i); i.onerror = ()=>res(null); i.src = src; }); }
async function loadAssets(){
  IMG.backgrounds.day = await loadImage(PATHS.backgrounds.day);
  IMG.backgrounds.eve = await loadImage(PATHS.backgrounds.eve);
  for(let i=0;i<PATHS.chars.length;i++) IMG.chars[i] = await loadImage(PATHS.chars[i]);
  for(let i=0;i<PATHS.heads.length;i++) IMG.heads[i] = await loadImage(PATHS.heads[i]);
  for(let i=0;i<PATHS.rods.length;i++) IMG.rods[i] = await loadImage(PATHS.rods[i]);
  for(let i=0;i<PATHS.fish.length;i++) IMG.fish[i] = await loadImage(PATHS.fish[i]);
  IMG.title = await loadImage(PATHS.title);
}

/* ===== UTIL ===== */
function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }
function rodUpgradeCost(lv){ return 200 * (2 ** (lv - 1)); }
function totalFishCount(){ let t=0; for(const f of FISH_TYPES) t += state.fishInv[f.key]||0; return t; }

/* ===== SAVE/LOAD ===== */
function loadSave(){ const s = localStorage.getItem(SAVE_KEY); if(s){ try{ const j = JSON.parse(s); Object.assign(state,j); if(j.x) player.x=j.x; if(j.y) player.y=j.y; }catch(e){} } }
function saveNow(){ state.x = player.x; state.y = player.y; localStorage.setItem(SAVE_KEY, JSON.stringify(state)); }

/* ===== WORLD ===== */
let trees = [], worldFish = [];
function spawnTrees(){ trees=[]; for(let i=0;i<120;i++){ let tx,ty; do{ tx=Math.random()*MAP_W; ty=Math.random()*MAP_H; } while(tx>LAKE.x-80 && tx<LAKE.x+LAKE.w+80 && ty>LAKE.y-80 && ty<LAKE.y+LAKE.h+80); const size=20+Math.random()*48; trees.push({x:tx,y:ty,size}); } }
function spawnWorldFish(){ worldFish=[]; for(let i=0;i<40;i++){ worldFish.push({ x:LAKE.x + Math.random()*LAKE.w, y:LAKE.y + Math.random()*LAKE.h, type:Math.floor(Math.random()*FISH_TYPES.length), dir: Math.random()<0.5?-1:1, spd:0.08+Math.random()*0.5 }); } }

/* ===== INPUT ===== */
const keys = {};
window.addEventListener('keydown', e=>{ keys[e.key.toLowerCase()] = true; if(e.key === ' ') onAction(); if(e.key.toLowerCase()==='e' && checkShopProximity()) openShop(); });
window.addEventListener('keyup', e=>{ keys[e.key.toLowerCase()] = false; });

const touch = { up:false,down:false,left:false,right:false,action:false };
function bindTouchBtn(el, prop){
  if(!el) return;
  el.addEventListener('touchstart', ev=>{ ev.preventDefault(); touch[prop]=true; }, {passive:false});
  el.addEventListener('touchend', ev=>{ ev.preventDefault(); touch[prop]=false; }, {passive:false});
  el.addEventListener('mousedown', ev=>{ ev.preventDefault(); touch[prop]=true; });
  el.addEventListener('mouseup', ev=>{ ev.preventDefault(); touch[prop]=false; });
}
bindTouchBtn(btnUp,'up'); bindTouchBtn(btnDown,'down'); bindTouchBtn(btnLeft,'left'); bindTouchBtn(btnRight,'right');
bindTouchBtn(actionBtn,'action');
actionBtn.addEventListener('touchstart', ev=>{ ev.preventDefault(); onAction(); }, {passive:false});
actionBtn.addEventListener('mousedown', ev=>{ ev.preventDefault(); onAction(); });

shopBtn.addEventListener('click', ()=>{ if(checkShopProximity()) openShop(); else setTopMsg('Dekati papan toko untuk membuka',2000); });
charSel.addEventListener('change', ()=> player.charIndex = parseInt(charSel.value));

/* ===== MOVEMENT & COLLISION ===== */
function willCollideWithLake(nx,ny){
  const r = player.size * 0.38;
  if(nx > LAKE.x + r && nx < LAKE.x + LAKE.w - r && ny > LAKE.y + r && ny < LAKE.y + LAKE.h - r) return true;
  return false;
}
function handleMovement(dt){
  if(isFishing) return; // lock movement while fishing
  let dx=0,dy=0;
  if(keys['arrowup']||keys['w']||touch.up) dy -= player.speed;
  if(keys['arrowdown']||keys['s']||touch.down) dy += player.speed;
  if(keys['arrowleft']||keys['a']||touch.left) dx -= player.speed;
  if(keys['arrowright']||keys['d']||touch.right) dx += player.speed;
  if(dx && dy){ dx *= 0.7071; dy *= 0.7071; }
  const nx = clamp(player.x + dx * (dt/16), 0, MAP_W);
  const ny = clamp(player.y + dy * (dt/16), 0, MAP_H);
  if(!willCollideWithLake(nx,ny)){ player.x = nx; player.y = ny; } else {
    const nxOnly = clamp(player.x + dx * (dt/16), 0, MAP_W);
    const nyOnly = clamp(player.y + dy * (dt/16), 0, MAP_H);
    if(!willCollideWithLake(nxOnly, player.y)) player.x = nxOnly;
    else if(!willCollideWithLake(player.x, nyOnly)) player.y = nyOnly;
  }
}

/* ===== FISHING ===== */
let fishingState = null;
function startFishing(){
  if(isFishing) return;
  if(!isNearLake(player.x, player.y)){ setTopMsg('Terlalu jauh dari waduk!'); return; }
  if(state.bait_worm<=0 && state.bait_shrimp<=0 && state.bait_minnow<=0){ setTopMsg('Umpan habis! Beli di toko.'); return; }
  let baitType = null;
  if(state.bait_worm>0) baitType='worm';
  else if(state.bait_shrimp>0) baitType='shrimp';
  else baitType='minnow';
  const baseRequired = 1400;
  const required = baseRequired / (1 + 0.12*(state.rodLevel-1));
  fishingState = { cursor:50, acc:0, holding:false, required, baitType, tension:0 };
  isFishing = true;
  showFishingUI(true);
  setTopMsg('Memancing... tahan tombol aksi untuk stabilkan', 2200);
}
function updateFishing(dt){
  if(!isFishing || !fishingState) return;
  const hold = touch.action || keys[' '];
  fishingState.holding = hold;
  const rv = state.rodLevel;
  const jitterBase = 2.2;
  const move = (Math.random()-0.5) * jitterBase * (hold ? (0.35/rv) : 1.0);
  fishingState.cursor = clamp(fishingState.cursor + move, 0, 100);
  const inZone = fishingState.cursor > 42 && fishingState.cursor < 58;
  if(inZone) fishingState.acc += dt;
  else fishingState.acc = Math.max(0, fishingState.acc - dt * (hold ? 0.5 : 1.2));
  if(!inZone){
    fishingState.tension += dt * (hold ? 0.06 * rv : 0.12 * (1/rv + 0.5));
  } else {
    fishingState.tension = Math.max(0, fishingState.tension - dt * 0.25);
  }
  fishingState.tension = clamp(fishingState.tension, 0, 100);
  // update UI visuals
  const barW = 200, leftX = 30;
  centerUI.cursor.style.left = (leftX + (fishingState.cursor/100)*barW) + 'px';
  centerUI.progressFill.style.width = Math.min(100, (fishingState.acc / fishingState.required) * 100) + '%';
  centerUI.tensionFill.style.width = fishingState.tension + '%';
  // vibration when tension high
  if(fishingState.tension >= 80){
    try{ if(navigator.vibrate) navigator.vibrate([60,30,40]); }catch(e){}
  }
  // fail or success
  if(fishingState.tension >= 100){
    finishFishing(false, true); return;
  }
  if(fishingState.acc >= fishingState.required){
    finishFishing(true, false); return;
  }
}
function finishFishing(success, broken){
  if(!fishingState) return;
  const bait = fishingState.baitType;
  if(success){
    const baseWeights = FISH_TYPES.map(f=>f.weight);
    const adjusted = baseWeights.map(w=>{
      if(w<=6) return w*(1 + 0.14*(state.rodLevel-1));
      if(w<=15) return w*(1 + 0.06*(state.rodLevel-1));
      return w;
    });
    const total = adjusted.reduce((a,b)=>a+b,0);
    let r = Math.random()*total;
    let idx = adjusted.length-1;
    for(let i=0;i<adjusted.length;i++){ r -= adjusted[i]; if(r<=0){ idx=i; break; } }
    const f = FISH_TYPES[idx];
    state.fishInv[f.key] = (state.fishInv[f.key]||0) + 1;
    state.money += Math.floor(f.basePrice * (1 + Math.random()*0.28));
    showFishPopup(f);
    setTopMsg(`Berhasil! Dapat ${f.name}`, 3000);
    if(bait==='worm') state.bait_worm = Math.max(0, state.bait_worm-1);
    if(bait==='shrimp') state.bait_shrimp = Math.max(0, state.bait_shrimp-1);
  } else {
    if(broken && bait==='minnow') state.bait_minnow = Math.max(0, state.bait_minnow-1);
    setTopMsg(broken ? 'Senar putus! Ikan kabur.' : 'Ikan lepas...', 1800);
  }
  // hide and reset bars after small delay for UX
  setTimeout(()=>{
    resetFishingUI();
    saveNow();
  }, 300);
}

/* ===== UI helpers for fishing visibility & reset ===== */
function showFishingUI(show){
  if(show){
    centerUI.fishingUI.classList.remove('hidden');
    centerUI.fishingUI.style.opacity = '1';
  } else {
    centerUI.fishingUI.style.opacity = '0';
    setTimeout(()=> centerUI.fishingUI.classList.add('hidden'), 240);
  }
}
function resetFishingUI(){
  // clear state and hide UI
  fishingState = null;
  isFishing = false;
  // reset DOM bars
  centerUI.progressFill.style.width = '0%';
  centerUI.tensionFill.style.width = '0%';
  centerUI.cursor.style.left = '0px';
  showFishingUI(false);
}

/* ===== FISH POPUP ===== */
let popTimer = null;
function showFishPopup(fish){
  fishPopupName.innerText = fish.name;
  const idx = FISH_TYPES.findIndex(x=>x.key===fish.key);
  if(IMG.fish[idx]){ fishPopupImg.src = IMG.fish[idx].src; fishPopupImg.style.display = 'block'; }
  else { fishPopupImg.src = ''; fishPopupImg.style.display = 'none'; }
  fishPopup.classList.remove('hidden');
  fishPopup.style.opacity = '1';
  if(popTimer) clearTimeout(popTimer);
  popTimer = setTimeout(()=> {
    fishPopup.style.opacity = '0';
    setTimeout(()=> fishPopup.classList.add('hidden'), 240);
  }, 3000);
}

/* ===== SHOP ===== */
document.getElementById('buy_worm_pack').addEventListener('click', ()=> buyItem('worm',50,10));
document.getElementById('buy_minnow').addEventListener('click', ()=> buyItem('minnow',150,1));
document.getElementById('buy_shrimp').addEventListener('click', ()=> buyItem('shrimp',75,5));
document.getElementById('upgradeRod').addEventListener('click', ()=> {
  if(state.rodLevel >= MAX_ROD_LEVEL){ setTopMsg('Joran sudah maksimal'); return; }
  const cost = rodUpgradeCost(state.rodLevel);
  if(state.money < cost){ setTopMsg('Uang tidak cukup'); return; }
  state.money -= cost;
  state.rodLevel += 1;
  setTopMsg(`Joran naik ke Lv ${state.rodLevel}`,2000);
  updateUI(); saveNow();
});
document.getElementById('buy_trophy').addEventListener('click', ()=> buyItem('trophy',500,1));
document.getElementById('sellFish').addEventListener('click', sellAllFish);
document.getElementById('closeShop').addEventListener('click', ()=> shopModal.classList.add('hidden'));

function buyItem(type, price, qty){
  if(state.money < price){ setTopMsg('Uang tidak cukup'); return; }
  state.money -= price;
  if(type==='worm') state.bait_worm += qty;
  if(type==='minnow') state.bait_minnow += qty;
  if(type==='shrimp') state.bait_shrimp += qty;
  if(type==='trophy') state.trophy += qty;
  updateUI(); saveNow(); shopModal.classList.add('hidden');
}
function sellAllFish(){
  let total = 0;
  for(const f of FISH_TYPES){ const c = state.fishInv[f.key]||0; total += c * f.basePrice; state.fishInv[f.key]=0; }
  state.money += total;
  setTopMsg(`Menjual semua ikan. Dapat $${total}`,3000);
  updateUI(); saveNow();
}
function openShop(){ shopMoney.innerText = state.money; shopModal.classList.remove('hidden'); }

/* ===== PROXIMITY ===== */
function isNearLake(x,y){ return (x > LAKE.x - 100 && x < LAKE.x + LAKE.w + 100 && y > LAKE.y - 100 && y < LAKE.y + LAKE.h + 100); }
function checkShopProximity(){ const dx = Math.abs(player.x - (SHOP_BOARD.x + SHOP_BOARD.w/2)); const dy = Math.abs(player.y - (SHOP_BOARD.y + SHOP_BOARD.h/2)); return dx < 120 && dy < 120; }

/* ===== DRAW ===== */
function drawBackground(timeFraction){
  if(IMG.backgrounds.day && IMG.backgrounds.eve){
    ctx.globalAlpha = 1.0;
    ctx.drawImage(IMG.backgrounds.day, 0, 0, MAP_W, MAP_H);
    const eveAlpha = (timeFraction >= 0.6) ? Math.min(1, (timeFraction - 0.6)/0.35) : 0;
    if(eveAlpha > 0){
      ctx.globalAlpha = eveAlpha;
      ctx.drawImage(IMG.backgrounds.eve, 0, 0, MAP_W, MAP_H);
    }
    ctx.globalAlpha = 1.0;
  } else {
    const g = ctx.createLinearGradient(0,0,0,MAP_H);
    if(timeFraction < 0.6){
      g.addColorStop(0,'#87ceeb'); g.addColorStop(1,'#cdeff9');
    } else {
      g.addColorStop(0,'#ffb37a'); g.addColorStop(1,'#8f4b2a');
    }
    ctx.fillStyle = g; ctx.fillRect(0,0,MAP_W,MAP_H);
  }
}
function drawBackgroundDecor(){
  for(let gy=0; gy<MAP_H; gy+=32){
    for(let gx=0; gx<MAP_W; gx+=32){
      ctx.fillStyle = ((Math.floor(gx/32)+Math.floor(gy/32))%2===0) ? '#16421d' : '#123a18';
      ctx.fillRect(gx,gy,32,32);
    }
  }
  ctx.fillStyle = '#7a5a2f'; ctx.fillRect(MAP_W/2 - 200, MAP_H/2 + 320, 400, 28);
}
function drawTrees(){
  for(const t of trees){
    ctx.fillStyle = '#5b3a1a'; ctx.fillRect(t.x-4,t.y,8,t.size*0.5);
    ctx.fillStyle = '#1f7a2d'; ctx.beginPath(); ctx.ellipse(t.x, t.y - t.size*0.3, t.size*0.6, t.size*0.6, 0, 0, Math.PI*2); ctx.fill();
  }
}
function drawLake(){
  ctx.fillStyle = '#1f66d8'; ctx.fillRect(LAKE.x, LAKE.y, LAKE.w, LAKE.h);
  ctx.strokeStyle = '#0e3b5e'; ctx.lineWidth = 8; ctx.strokeRect(LAKE.x, LAKE.y, LAKE.w, LAKE.h);
}
function drawShopBoard(){ ctx.fillStyle = '#6f3b1a'; ctx.fillRect(SHOP_BOARD.x, SHOP_BOARD.y, SHOP_BOARD.w, SHOP_BOARD.h); ctx.fillStyle='#fff'; ctx.font='18px sans-serif'; ctx.fillText('TOKO', SHOP_BOARD.x+10, SHOP_BOARD.y+48); }
function drawWorldFish(){ for(const f of worldFish){ const pal = ['#ff6b6b','#c94e1b','#f2c66b','#b7d884','#f2a1a1','#cda37a','#c4c4c4','#ffddaa']; ctx.fillStyle = pal[f.type]; ctx.beginPath(); ctx.ellipse(f.x, f.y, 10, 6, 0, 0, Math.PI*2); ctx.fill(); } }
function drawPlayer(){
  const px = player.x, py = player.y;
  ctx.fillStyle='rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(px,py+28,28,12,0,0,Math.PI*2); ctx.fill();
  const charImg = IMG.chars[player.charIndex];
  if(charImg){
    ctx.drawImage(charImg, px - player.size/2, py - player.size/2 - 8, player.size, player.size);
  } else {
    ctx.fillStyle='#ffdd57'; ctx.fillRect(px-12, py-40, 24, 36);
    ctx.strokeStyle='#2b2b2b'; ctx.lineWidth=8; ctx.lineCap='round';
    ctx.beginPath(); ctx.moveTo(px-12,py-12); ctx.lineTo(px-36,py+8); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(px+12,py-12); ctx.lineTo(px+36,py+8); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(px-6,py); ctx.lineTo(px-8,py+36); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(px+6,py); ctx.lineTo(px+12,py+36); ctx.stroke();
  }
  const headImg = IMG.heads[player.charIndex];
  if(headImg){ ctx.drawImage(headImg, px - 24, py - player.size + 6, 48, 48); }
  const rodImg = IMG.rods[Math.min(state.rodLevel, IMG.rods.length-1)];
  if(rodImg){ ctx.drawImage(rodImg, px + 14, py - 8, 56, 56); }
  else { ctx.strokeStyle = '#8b5a2b'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(px+12, py-4); ctx.lineTo(px+48, py-28); ctx.stroke(); }
}

/* ===== CAMERA & MAIN LOOP ===== */
let cam = { x:0, y:0, w:960, h:540 };
function updateCamera(){
  cam.w = canvas.width>960?960:canvas.width; cam.h = canvas.height>540?540:canvas.height;
  cam.x = clamp(player.x - cam.w/2, 0, MAP_W - cam.w);
  cam.y = clamp(player.y - cam.h/2, 0, MAP_H - cam.h);
}

/* time */
let timeElapsed = 0;
function timeFractionFromElapsed(elapsedSeconds){
  const daySeconds = REAL_SECONDS_PER_INGAME_DAY;
  return (elapsedSeconds % daySeconds) / daySeconds;
}
function isEvening(fraction){ return fraction >= 0.6 && fraction < 0.95; }
function updateTime(dt){
  timeElapsed += dt/1000;
  const frac = timeFractionFromElapsed(timeElapsed);
  timeDisplay.innerText = isEvening(frac) ? 'Senja' : 'Siang';
  return frac;
}

let last = performance.now();
function mainLoop(now){
  const dt = now - last; last = now;
  handleMovement(dt);
  updateFishing(dt);
  for(const f of worldFish){ f.x += f.dir * f.spd * dt * 0.03; if(f.x < LAKE.x) f.dir = 1; if(f.x > LAKE.x + LAKE.w) f.dir = -1; }
  updateCamera();
  const frac = updateTime(dt);
  ctx.save(); ctx.clearRect(0,0,canvas.width,canvas.height);
  drawBackground(frac);
  drawBackgroundDecor();
  drawTrees();
  drawLake();
  drawShopBoard();
  drawWorldFish();
  drawPlayer();
  ctx.restore();
  updateUI();
  requestAnimationFrame(mainLoop);
}

/* ===== UI ===== */
function updateUI(){
  leftUI.money.innerText = state.money;
  leftUI.bait_worm.innerText = state.bait_worm;
  leftUI.bait_minnow.innerText = state.bait_minnow;
  leftUI.bait_shrimp.innerText = state.bait_shrimp;
  leftUI.rodLevel.innerText = state.rodLevel;
  leftUI.rodCost.innerText = rodUpgradeCost(state.rodLevel);
  fishCountEl.innerText = totalFishCount();
  trophyEl.innerText = state.trophy;
  shopMoney.innerText = state.money;
  const caughtAll = FISH_TYPES.every(f => (state.fishInv[f.key]||0) > 0);
  if(caughtAll || state.rodLevel >= MAX_ROD_LEVEL){
    titleBox.classList.remove('hidden');
    if(IMG.title) titleImg.src = IMG.title.src;
  } else titleBox.classList.add('hidden');
}
let msgTimer = null;
function setTopMsg(t, timeout=3000){ topMsg.innerText = t; if(msgTimer) clearTimeout(msgTimer); if(timeout) msgTimer = setTimeout(()=> topMsg.innerText = 'KANCING — Kacipet Mancing', timeout); }

/* ===== ACTIONS ===== */
function onAction(){ if(checkShopProximity()){ openShop(); return; } if(!isFishing) startFishing(); else { /* do nothing while fishing, action is hold */ } }

/* ===== INIT ===== */
async function init(){
  loadSave();
  await loadAssets();
  spawnTrees(); spawnWorldFish();
  last = performance.now();
  requestAnimationFrame(mainLoop);
  setInterval(saveNow, 1500);
  // bind shop buttons
  document.getElementById('buy_worm_pack').onclick = ()=> buyItem('worm',50,10);
  document.getElementById('buy_minnow').onclick = ()=> buyItem('minnow',150,1);
  document.getElementById('buy_shrimp').onclick = ()=> buyItem('shrimp',75,5);
  document.getElementById('buy_trophy').onclick = ()=> buyItem('trophy',500,1);
  document.getElementById('sellFish').onclick = ()=> sellAllFish();
  document.getElementById('closeShop').onclick = ()=> shopModal.classList.add('hidden');
  window.addEventListener('keydown', e=>{
    if(e.key === ' ') onAction();
    if(e.key.toLowerCase() === 'e' && checkShopProximity()) openShop();
  });
  setTopMsg('Selamat datang — KANCING (Fixed)', 2500);
  updateUI();
}
init();

/* ===== DEBUG ===== */
window._kancing = { state, player, saveNow, spawnTrees, spawnWorldFish, IMG };