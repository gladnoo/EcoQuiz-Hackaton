(()=>{
  // ===== Config =====
  const GRID_COLS = 4;          // 4x3 = 12 lotes
  const GRID_ROWS = 3;
  const PLOT_SIZE = 128;        // px (canvas real); CSS escala automaticamente

  // ===== Minigames / cooldowns =====
  const HOLD_MS = 2500;         // segurar 2.5s p/ ganhar 1 💧
  const CD_MS   = 5_000;       // 5s de cooldown por recurso

  // refs dos elementos novos (minigames)
  const earnWaterBtn = document.getElementById('earnWater');
  const holdBar      = document.getElementById('holdBar');
  const cdWater      = document.getElementById('cdWater');

  const sunTargetEl  = document.getElementById('sunTarget');
  const sunGame      = document.getElementById('sunGame');
  const sunCheck     = document.getElementById('sunCheck');
  const cdSun        = document.getElementById('cdSun');

  const careQ        = document.getElementById('careQuestion');
  const careTrue     = document.getElementById('careTrue');
  const careFalse    = document.getElementById('careFalse');
  const cdCare       = document.getElementById('cdCare');

  // perguntas rápidas (V/F) locais (sem API)
  const CARE_QS = [
    {q:"Separar lixo reciclável ajuda a reduzir a poluição em rios.", a:true},
    {q:"Vidro não é reciclável.", a:false},
    {q:"Economizar 1 min no banho economiza água.", a:true},
    {q:"Plantar árvores aumenta a emissão de CO₂.", a:false},
    {q:"Eletrônicos não devem ir no lixo comum.", a:true},
  ];

  const SPECIES = {
    ipe:       {name:"Ipê",        leaf:"#22c55e", trunk:"#7c4a2d", accent:"#16a34a"},
    araucaria: {name:"Araucária",  leaf:"#16a34a", trunk:"#5b3b23", accent:"#0e9f6e"},
    mangue:    {name:"Mangue",     leaf:"#059669", trunk:"#3f2d20", accent:"#10b981"},
    frutifera: {name:"Frutífera",  leaf:"#4ade80", trunk:"#6b4423", accent:"#f59e0b"}
  };

  // Requisitos por estágio (S0..S4) — S3→S4 mais exigente
  const REQ = (stage)=> stage < 3 ? {water:1, sun:1, care:1} : {water:2, sun:2, care:2};

  // ===== Estado =====
  let state = null;
  let selPlot = null;   // índice do plot selecionado (0..N-1)
  let selSeed = "ipe";  // espécie selecionada p/ plantar

  // ===== DOM =====
  const grid = document.getElementById('plotsGrid');
  const invWater = document.getElementById('invWater');
  const invSun   = document.getElementById('invSun');
  const invCare  = document.getElementById('invCare');
  const seedsList= document.getElementById('seedsList');
  const plotLabel= document.getElementById('plotLabel');
  const plotInfo = document.getElementById('plotInfo');
  const btnPlant = document.getElementById('btnPlant');
  const btnGrow  = document.getElementById('btnGrow');
  const btnClear = document.getElementById('btnClear');
  const btnUseWater = document.getElementById('btnUseWater');
  const btnUseSun   = document.getElementById('btnUseSun');
  const btnUseCare  = document.getElementById('btnUseCare');

  const btnSync  = document.getElementById('btnSync');
  const btnExport= document.getElementById('btnExport');
  const btnReset = document.getElementById('btnResetForest');

  const devWater = document.getElementById('devWater');
  const devSun   = document.getElementById('devSun');
  const devCare  = document.getElementById('devCare');

  // ===== Storage =====
  function loadForest(){
    try{
      const j = JSON.parse(localStorage.getItem("eco:forest")||"null");
      if (j) { j.cooldown = j.cooldown || {water:0, sun:0, care:0}; }
      if (j && Array.isArray(j.plots)) return j;
    }catch{}
    // inicial
    const plots = [];
    let id=0;
    for (let r=0;r<GRID_ROWS;r++){
      for (let c=0;c<GRID_COLS;c++){
        plots.push({ id:id++, species:null, stage:0, water:0, sun:0, care:0, seed:Math.floor(Math.random()*999999) });
      }
    }
    return {
      plots,
      inventory: {water:0, sun:0, care:0},
      cooldown: {water:0, sun:0, care:0},
      lastScoreAt: 0,
      lastNoiseAt: 0,
      lastCareAt:  0,
      stats: {planted:0, grown:0}
    };
  }
  function saveForest(){ localStorage.setItem("eco:forest", JSON.stringify(state)); }

  // ===== UI seeds =====
  function renderSeeds(){
    seedsList.innerHTML = "";
    Object.entries(SPECIES).forEach(([key, sp])=>{
      const b = document.createElement('button');
      b.className = "flex items-center gap-2 rounded-xl border px-3 py-2 hover:bg-brand-50 " + (selSeed===key?"ring-2 ring-brand-300":"");
      b.innerHTML = `<span class="inline-block h-3 w-3 rounded-full" style="background:${sp.leaf}"></span> ${sp.name}`;
      b.onclick = ()=>{ selSeed=key; renderSeeds(); updateSide(); };
      seedsList.appendChild(b);
    });
  }

  // ===== Canvas drawing =====
  function rnd(seed){ // LCG simples
    let s = seed || 1;
    return ()=> (s = (s*1664525 + 1013904223) % 4294967296) / 4294967296;
  }

  function drawPlot(ctx, plot){
    // fundo
    ctx.clearRect(0,0,PLOT_SIZE,PLOT_SIZE);
    // grama
    ctx.fillStyle = "#e7f8ec";
    ctx.fillRect(0, PLOT_SIZE-28, PLOT_SIZE, 28);
    // se vazio
    if (!plot.species){
      // estaca vazia + rótulo
      ctx.fillStyle = "#94a3b8";
      ctx.fillRect(PLOT_SIZE/2 - 2, PLOT_SIZE-40, 4, 12);
      ctx.beginPath(); ctx.arc(PLOT_SIZE/2, PLOT_SIZE-42, 4, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle="#64748b"; ctx.font="12px Inter"; ctx.textAlign="center";
      ctx.fillText("Vazio", PLOT_SIZE/2, PLOT_SIZE-10);
      return;
    }

    const sp = SPECIES[plot.species] || SPECIES.ipe;
    const random = rnd(plot.seed);

    // tronco
    const baseX = PLOT_SIZE/2;
    const baseY = PLOT_SIZE-28;
    const trunkH = 28 + plot.stage*12;
    const trunkW = 8 + plot.stage*1.5;
    ctx.fillStyle = sp.trunk;
    ctx.fillRect(baseX - trunkW/2, baseY - trunkH, trunkW, trunkH);

    // copa (círculos)
    const blobs = 6 + plot.stage*4;
    for (let i=0;i<blobs;i++){
      const r = 10 + plot.stage*3 + random()*6;
      const angle = random()*Math.PI*2;
      const dist = 8 + random()* (10 + plot.stage*3);
      const x = baseX + Math.cos(angle)*dist;
      const y = (baseY - trunkH + 6) + Math.sin(angle)*dist*0.6;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI*2);
      ctx.fillStyle = i%3===0 ? sp.accent : sp.leaf;
      ctx.globalAlpha = 0.88;
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // frutos/ flores (frutífera/adulta)
    if (plot.species==="frutifera" && plot.stage>=3){
      for (let i=0;i<6;i++){
        const x = baseX + (random()*40-20);
        const y = baseY - trunkH - 4 + random()*28;
        ctx.fillStyle = "#f59e0b";
        ctx.beginPath(); ctx.arc(x,y,3,0,Math.PI*2); ctx.fill();
      }
    }

    // semente/broto indicador
    if (plot.stage===0){
      ctx.fillStyle = "#8b5cf6";
      ctx.beginPath(); ctx.arc(baseX, baseY-8, 4, 0, Math.PI*2); ctx.fill();
    }

    // placa com nome curta
    ctx.fillStyle="#0f172a"; ctx.font="12px Inter"; ctx.textAlign="center";
    ctx.fillText(sp.name+" — S"+plot.stage, PLOT_SIZE/2, 16);
  }

  // ===== Grid =====
  const canvases = [];
  function buildGrid(){
    grid.innerHTML = "";
    const total = GRID_COLS*GRID_ROWS;
    for (let i=0;i<total;i++){
      const card = document.createElement('button');
      card.className = "relative rounded-2xl border hover:bg-brand-50/40 focus:outline-none focus:ring-2 focus:ring-brand-300";
      card.dataset.idx = i;

      const c = document.createElement('canvas');
      c.width=PLOT_SIZE; c.height=PLOT_SIZE;
      c.className="w-full h-auto block rounded-2xl";
      card.appendChild(c);

      const tag = document.createElement('div');
      tag.className = "absolute left-2 top-2 text-[11px] px-2 py-0.5 rounded-lg bg-white/90 text-slate-600";
      tag.textContent = `#${i+1}`;
      card.appendChild(tag);

      card.onclick = ()=>{ selPlot = i; updateSide(); highlight(); };
      grid.appendChild(card);
      canvases[i] = c;
    }
    highlight();
  }

  function highlight(){
    // marca seleção visual (borda mais forte)
    Array.from(grid.children).forEach((btn, i)=>{
      btn.classList.remove("ring-2","ring-brand-300","bg-brand-50/60");
      if (i===selPlot) btn.classList.add("ring-2","ring-brand-300","bg-brand-50/60");
    });
  }

  function renderAll(){
    state.plots.forEach((p,i)=>{
      const ctx = canvases[i].getContext('2d');
      drawPlot(ctx, p);
    });
    updateInvUI();
    updateSide();
  }

  // ===== Sidebar =====
  function updateInvUI(){
    invWater.textContent = state.inventory.water;
    invSun.textContent   = state.inventory.sun;
    invCare.textContent  = state.inventory.care;
  }

  function stageLabel(s){
    return ["Semente","Broto","Muda","Jovem","Adulta"][s] || ("S"+s);
  }

  function barsHTML(plot){
    const need = REQ(plot.stage);
    return `
      <div class="mt-2 space-y-2">
        <div>
          <div class="flex justify-between text-xs"><span>💧 Água</span><span>${plot.water}/${need.water}</span></div>
          <div class="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
            <div class="h-2 bg-emerald-400" style="width:${Math.min(100, plot.water/need.water*100)}%"></div>
          </div>
        </div>
        <div>
          <div class="flex justify-between text-xs"><span>☀️ Sol</span><span>${plot.sun}/${need.sun}</span></div>
          <div class="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
            <div class="h-2 bg-yellow-400" style="width:${Math.min(100, plot.sun/need.sun*100)}%"></div>
          </div>
        </div>
        <div>
          <div class="flex justify-between text-xs"><span>🧹 Cuidado</span><span>${plot.care}/${need.care}</span></div>
          <div class="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
            <div class="h-2 bg-slate-400" style="width:${Math.min(100, plot.care/need.care*100)}%"></div>
          </div>
        </div>
      </div>
    `;
  }

  function updateSide(){
    // seeds cards
    renderSeeds();

    // label lote
    if (selPlot==null){ plotLabel.textContent="Nenhum"; plotInfo.innerHTML="Selecione um lote do campo."; setButtonsDisabled(true); return; }
    const plot = state.plots[selPlot];
    plotLabel.textContent = `Lote #${selPlot+1}`;

    // botões padrão
    btnClear.disabled = !plot.species;

    if (!plot.species){
      plotInfo.innerHTML = `
        <div class="text-slate-600">Este lote está vazio.</div>
        <div class="mt-2 text-sm">Escolha uma <b>semente</b> e clique em <b>Plantar semente</b>.</div>
      `;
      btnPlant.classList.remove("hidden"); btnGrow.classList.add("hidden");
      setButtonsDisabled(true);
      return;
    }

    const sp = SPECIES[plot.species];
    plotInfo.innerHTML = `
      <div><b>Espécie:</b> ${sp.name}</div>
      <div><b>Estágio:</b> ${stageLabel(plot.stage)} (S${plot.stage})</div>
      ${plot.stage<4 ? barsHTML(plot) : `<div class="mt-2 text-emerald-700 text-sm font-semibold">🌳 Adulta — gerando borboletas! (+EcoPonto diário)</div>`}
    `;

    btnPlant.classList.add("hidden");
    btnGrow.classList.toggle("hidden", plot.stage>=4);

    // habilita usar recursos só se houver inventário
    setButtonsDisabled(false);
    btnUseWater.disabled = state.inventory.water<=0 || plot.stage>=4;
    btnUseSun.disabled   = state.inventory.sun<=0   || plot.stage>=4;
    btnUseCare.disabled  = state.inventory.care<=0  || plot.stage>=4;
  }

  function setButtonsDisabled(disabled){
    [btnUseWater,btnUseSun,btnUseCare,btnGrow,btnClear].forEach(b=>b.disabled = disabled);
  }

  // ===== Ações =====
  btnPlant.onclick = ()=>{
    if (selPlot==null) return;
    const plot = state.plots[selPlot];
    if (plot.species) return;
    plot.species = selSeed;
    plot.stage = 0; plot.water=0; plot.sun=0; plot.care=0;
    state.stats.planted++;
    saveForest(); renderAll();
    popLeaves();
  };

  btnGrow.onclick = ()=>{
    if (selPlot==null) return;
    const plot = state.plots[selPlot];
    if (!plot.species || plot.stage>=4) return;

    const need = REQ(plot.stage);
    if (plot.water>=need.water && plot.sun>=need.sun && plot.care>=need.care){
      plot.stage++;
      plot.water=0; plot.sun=0; plot.care=0;
      state.stats.grown++;
      saveForest(); renderAll();
      popLeaves();
    } else {
      flashMsg("Falta recurso pra evoluir. Usa 💧/☀️/🧹 antes.");
    }
  };

  btnClear.onclick = ()=>{
    if (selPlot==null) return;
    const plot = state.plots[selPlot];
    plot.species=null; plot.stage=0; plot.water=0; plot.sun=0; plot.care=0;
    saveForest(); renderAll();
  };

  btnUseWater.onclick = ()=>applyRes("water");
  btnUseSun.onclick   = ()=>applyRes("sun");
  btnUseCare.onclick  = ()=>applyRes("care");

  function applyRes(kind){
    if (selPlot==null) return;
    if (state.inventory[kind]<=0) return;
    const plot = state.plots[selPlot];
    if (!plot.species || plot.stage>=4) return;

    const need = REQ(plot.stage)[kind];
    plot[kind] = Math.min(need, plot[kind]+1);
    state.inventory[kind]--;
    saveForest(); renderAll();
  }

  // ===== Integração com app (sync recursos legado — opcional) =====
  // • eco:lastScore {pct, hits, total, at} → +1 ☀️ (1x por “at” novo)
  // • eco:lastNoise "avgDb" (string) → se ≤50 dB → +1 💧 (1x por minuto)
  // • eco:lastMapFav {"at":ts} → +1 🧹 (1x por “at” novo)
  btnSync.onclick = ()=>{
    let added = {water:0, sun:0, care:0};
    try{
      const last = JSON.parse(localStorage.getItem("eco:lastScore")||"null");
      if (last && last.at && last.at !== state.lastScoreAt){
        state.lastScoreAt = last.at;
        state.inventory.sun = Math.min(9, state.inventory.sun+1); added.sun++;
      }
    }catch{}
    const n = parseFloat(localStorage.getItem("eco:lastNoise")||"NaN");
    if (Number.isFinite(n) && n<=50){
      const key = "eco:lastNoise_at";
      const prev = parseInt(localStorage.getItem(key)||"0",10);
      const now = Date.now();
      if (now - prev > 60*1000){ // throttle 1 min
        state.inventory.water = Math.min(9, state.inventory.water+1); added.water++;
        localStorage.setItem(key, String(now));
      }
    }
    try{
      const fav = JSON.parse(localStorage.getItem("eco:lastMapFav")||"null");
      if (fav && fav.at && fav.at !== state.lastCareAt){
        state.lastCareAt = fav.at;
        state.inventory.care = Math.min(9, state.inventory.care+1); added.care++;
      }
    }catch{}

    saveForest(); renderAll();
    flashMsg(`Sync ✅`);
  };

  // ===== Export PNG =====
  btnExport.onclick = ()=>{
    // desenha um mosaico grandão da floresta
    const off = document.createElement('canvas');
    const W = GRID_COLS*PLOT_SIZE + (GRID_COLS+1)*16;
    const H = GRID_ROWS*PLOT_SIZE + (GRID_ROWS+1)*16 + 40;
    off.width=W; off.height=H;
    const ctx = off.getContext('2d');

    // fundo
    ctx.fillStyle = "#f0fdf4"; ctx.fillRect(0,0,W,H);
    // título
    ctx.fillStyle = "#065f46"; ctx.font="bold 20px Inter";
    ctx.fillText("EcoQuiz — Floresta Viva", 16, 28);

    // cada plot
    let k=0;
    for(let r=0;r<GRID_ROWS;r++){
      for(let c=0;c<GRID_COLS;c++){
        const x = 16 + c*(PLOT_SIZE+16);
        const y = 40 + 16 + r*(PLOT_SIZE+16);
        // moldura
        roundRect(ctx, x-4, y-4, PLOT_SIZE+8, PLOT_SIZE+8, 14, "#ffffff", "#bbf7d0");
        // conteúdo
        const tmp = document.createElement('canvas'); tmp.width=PLOT_SIZE; tmp.height=PLOT_SIZE;
        drawPlot(tmp.getContext('2d'), state.plots[k++]);
        ctx.drawImage(tmp, x, y);
      }
    }

    const a = document.createElement('a');
    a.href = off.toDataURL('image/png');
    a.download = `eco_floresta_${Date.now()}.png`;
    a.click();
  };

  function roundRect(ctx,x,y,w,h,r,fill,stroke){
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x+r,y);
    ctx.arcTo(x+w,y,x+w,y+h,r);
    ctx.arcTo(x+w,y+h,x,y+h,r);
    ctx.arcTo(x,y+h,x,y,r);
    ctx.arcTo(x,y,x+w,y,r);
    ctx.closePath();
    if (fill){ ctx.fillStyle=fill; ctx.fill(); }
    if (stroke){ ctx.strokeStyle=stroke; ctx.lineWidth=2; ctx.stroke(); }
    ctx.restore();
  }

  // ===== Reset =====
  btnReset.onclick = ()=>{
    if (!confirm("Zerar toda a floresta?")) return;
    localStorage.removeItem("eco:forest");
    state = loadForest();
    selPlot = null;
    buildGrid(); renderAll();
  };

  // ===== Dev helpers =====
  devWater.onclick = ()=>{ state.inventory.water=Math.min(9,state.inventory.water+1); saveForest(); updateInvUI(); };
  devSun.onclick   = ()=>{ state.inventory.sun=Math.min(9,state.inventory.sun+1); saveForest(); updateInvUI(); };
  devCare.onclick  = ()=>{ state.inventory.care=Math.min(9,state.inventory.care+1); saveForest(); updateInvUI(); };

  // ===== Cooldowns helpers =====
  function canEarn(kind){
    return (Date.now() - state.cooldown[kind]) >= CD_MS;
  }
  function setCooldown(kind){
    state.cooldown[kind] = Date.now();
    saveForest();
    updateCooldownLabels();
  }
  function updateCooldownLabels(){
    const fmt = (ms)=>{
      if (ms<=0) return "pronto";
      return Math.ceil(ms/1000)+"s";
    };
    const now = Date.now();
    cdWater.textContent = fmt(CD_MS - (now - state.cooldown.water));
    cdSun.textContent   = fmt(CD_MS - (now - state.cooldown.sun));
    cdCare.textContent  = fmt(CD_MS - (now - state.cooldown.care));
  }
  setInterval(updateCooldownLabels, 1000);

  // ===== Minigame 💧 (segurar) =====
  let holdTimer = null, holdStart = 0;
  function startHold(){
    if (!canEarn('water')) { flashMsg("Aguarda o cooldown da água."); return; }
    holdStart = Date.now();
    holdBar.style.width = "0%";
    holdTimer = requestAnimationFrame(tickHold);
  }
  function stopHold(success){
    if (holdTimer){ cancelAnimationFrame(holdTimer); holdTimer=null; }
    holdBar.style.width = success ? "100%" : "0%";
  }
  function tickHold(){
    const t = Date.now() - holdStart;
    const pct = Math.min(100, (t/HOLD_MS)*100);
    holdBar.style.width = pct + "%";
    if (t >= HOLD_MS){
      stopHold(true);
      state.inventory.water = Math.min(9, state.inventory.water + 1);
      setCooldown('water');
      saveForest(); updateInvUI();
      flashMsg("+1 💧 Água");
      return;
    }
    holdTimer = requestAnimationFrame(tickHold);
  }
  // mouse + touch
  if (earnWaterBtn){
    earnWaterBtn.addEventListener('mousedown', startHold);
    earnWaterBtn.addEventListener('mouseup',   ()=>stopHold(false));
    earnWaterBtn.addEventListener('mouseleave',()=>stopHold(false));
    earnWaterBtn.addEventListener('touchstart', (e)=>{ e.preventDefault(); startHold(); }, {passive:false});
    earnWaterBtn.addEventListener('touchend',   ()=>stopHold(false));
  }

  // ===== Minigame ☀️ (slider alvo) =====
  const SUN_TOL = 4; // tolerância
  function newSunTarget(){
    const t = 10 + Math.floor(Math.random()*81); // 10..91
    sunTargetEl.textContent = t;
    sunGame.value = 0;
  }
  if (sunCheck){
    sunCheck.onclick = ()=>{
      if (!canEarn('sun')) { flashMsg("Cooldown do ☀️ ainda rolando."); return; }
      const target = parseInt(sunTargetEl.textContent,10);
      const val = parseInt(sunGame.value,10);
      if (Math.abs(val - target) <= SUN_TOL){
        state.inventory.sun = Math.min(9, state.inventory.sun + 1);
        setCooldown('sun');
        saveForest(); updateInvUI();
        newSunTarget();
        flashMsg("+1 ☀️ Sol");
      } else {
        flashMsg("Quase! Ajusta mais perto do alvo.");
      }
    };
  }

  // ===== Minigame 🧹 (V/F relâmpago) =====
  let curCare = 0;
  function newCareQuestion(){
    curCare = Math.floor(Math.random()*CARE_QS.length);
    careQ.textContent = CARE_QS[curCare].q;
  }
  function answerCare(val){
    if (!canEarn('care')) { flashMsg("Cooldown do 🧹 ainda rolando."); return; }
    const ok = CARE_QS[curCare].a === val;
    if (ok){
      state.inventory.care = Math.min(9, state.inventory.care + 1);
      setCooldown('care');
      saveForest(); updateInvUI();
      flashMsg("+1 🧹 Cuidado");
      newCareQuestion();
    } else {
      flashMsg("Resposta errada — tenta outra!");
    }
  }
  if (careTrue)  careTrue.onclick  = ()=>answerCare(true);
  if (careFalse) careFalse.onclick = ()=>answerCare(false);

  // ===== Efeitos visuais =====
  function popLeaves(){
    // confete 🍃 leve
    const n = 18;
    for (let i=0;i<n;i++){
      const s = document.createElement('div');
      s.textContent = "🍃";
      s.style.position="fixed";
      s.style.left = (Math.random()*100)+"vw";
      s.style.top  = "-24px";
      s.style.fontSize = (14+Math.random()*12)+"px";
      s.style.transition = "transform 2s linear, opacity 2s linear";
      s.style.zIndex = 50;
      document.body.appendChild(s);
      requestAnimationFrame(()=>{
        s.style.transform = `translateY(${window.innerHeight+60}px) rotate(${Math.random()*360}deg)`;
        s.style.opacity = "0";
      });
      setTimeout(()=>s.remove(), 2200);
    }
  }

  function flashMsg(text){
    const div = document.createElement('div');
    div.className = "fixed left-1/2 -translate-x-1/2 top-4 z-50 bg-emerald-600 text-white px-4 py-2 rounded-xl shadow-soft";
    div.textContent = text;
    document.body.appendChild(div);
    setTimeout(()=>{ div.style.opacity="0"; div.style.transform="translate(-50%, -10px)"; }, 1200);
    setTimeout(()=>div.remove(), 1700);
  }

  // ===== Boot =====
  function boot(){
    state = loadForest();
    buildGrid();
    renderAll();
    // seleção inicial
    selPlot = 0; highlight(); updateSide();

    // inits minigames
    updateCooldownLabels();
    if (sunTargetEl && sunGame) newSunTarget();
    if (careQ) newCareQuestion();
  }

  boot();
})();
