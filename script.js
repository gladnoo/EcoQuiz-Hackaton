// ====== CONFIG BACKEND ======
const API = "http://localhost:5173"; // ajuste se rodar em outra porta/host

// ====== REVEAL ======
const io = new IntersectionObserver((entries)=>entries.forEach(e=>{if(e.isIntersecting)e.target.classList.add('show')}),{threshold:.12});
document.querySelectorAll('.reveal').forEach(el=>io.observe(el));

// ====== WIKIPEDIA HELPERS ======
// categorias verdes na ptwiki (só páginas, nada de subcategoria/artigos de lista)
const WIKI_CATEGORIES = [
  "Categoria:Meio ambiente",
  "Categoria:Mudanças climáticas",
  "Categoria:Energia renovável",
  "Categoria:Reciclagem",
  "Categoria:Poluição",
  "Categoria:Desmatamento",
  "Categoria:Aquecimento global"
];

async function fetchCategoryMembers(cat, limit=50) {
  const url = `https://pt.wikipedia.org/w/api.php?origin=*&action=query&list=categorymembers&cmtitle=${encodeURIComponent(cat)}&cmlimit=${limit}&cmtype=page&format=json`;
  const r = await fetch(url);
  if (!r.ok) throw new Error("Wiki cat fail");
  const j = await r.json();
  return (j?.query?.categorymembers || []).map(m => m.title);
}

async function fetchWikiSummary(title) {
  const url = `https://pt.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
  const r = await fetch(url, { headers: { 'Accept':'application/json' }});
  if (!r.ok) throw new Error("Wiki summary fail");
  const data = await r.json();
  return {
    title: data.title,
    extract: data.extract || "",
    description: data.description || ""
  };
}

function isBadSummary(s) {
  // ignora desambiguação, lista, coisas muito curtas
  const txt = (s.description || "").toLowerCase();
  if (txt.includes("desambiguação")) return true;
  if (txt.includes("lista de") || txt.includes("lista")) return true;
  if ((s.extract || "").length < 80) return true;
  return false;
}

// monta um pool único de títulos
async function buildWikiPool() {
  const all = new Set();
  for (const cat of WIKI_CATEGORIES) {
    try {
      const titles = await fetchCategoryMembers(cat, 50);
      titles.forEach(t => all.add(t));
    } catch(e) { /* segue o baile */ }
  }
  // remove títulos muito genéricos se quiser, mas vamos confiar no filtro do summary
  return Array.from(all);
}

// ====== UTILS ======
const byId = id => document.getElementById(id);
function shuffle(arr) {
  const a = arr.slice();
  for (let i=a.length-1; i>0; i--) {
    const j = Math.floor(Math.random()*(i+1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function sanitizeName(s) {
  return s.replace(/\s+/g,' ').trim().slice(0,24);
}

// ====== STATE ======
const qIndex=byId('qIndex'), qTotal=byId('qTotal'), qText=byId('qText'), qOptions=byId('qOptions'), qFeedback=byId('qFeedback');
const btnPrev=byId('btnPrev'), btnNext=byId('btnNext'), btnStart=byId('btnStart'), playerNameEl=byId('playerName');
const qResult=byId('qResult'), scoreHits=byId('scoreHits'), scoreTotal=byId('scoreTotal'), scorePct=byId('scorePct'), playerOut=byId('playerOut'), saveStatus=byId('saveStatus');
const qCountSel=byId('qCount');
const timerBar=byId('timerBar'), timerLabel=byId('timerLabel');
const btn5050=byId('btn5050'), btnSkip=byId('btnSkip');

const TIMER_PER_Q = 20; // segundos
let timerId = null, timerStart = 0;

let POOL = [];           // títulos da wiki
let QUESTIONS = [];      // [{summary, correctTitle, options[]}]
let idx = 0;
let answers = [];        // índice marcado em options por pergunta
let hits = 0;
let allow5050 = true;
let allowSkip = true;

qTotal.textContent = "–";

// ====== RESET LIFELINES (UI) ======
function resetLifelinesUI() {
  allow5050 = true;
  allowSkip  = true;

  btn5050.disabled = false;
  btnSkip.disabled = false;

  btn5050.classList.remove("opacity-50", "cursor-not-allowed");
  btnSkip.classList.remove("opacity-50", "cursor-not-allowed");
}

// ====== QUIZ BUILDER (WIKI) ======
async function buildQuestions(n=5) {
  // garante pool (lazy load)
  if (POOL.length === 0) {
    POOL = await buildWikiPool();
  }
  // gera n perguntas
  const qs = [];
  const poolShuffled = shuffle(POOL);
  let cursor = 0;

  while (qs.length < n && cursor < poolShuffled.length - 4) {
    // pega 4 títulos
    const sample = poolShuffled.slice(cursor, cursor + 4);
    cursor += 4;

    try {
      // sorteia um como correto
      const correctTitle = sample[Math.floor(Math.random()*sample.length)];
      const s = await fetchWikiSummary(correctTitle);
      if (isBadSummary(s)) continue;

      // monta questão
      const options = shuffle(sample);
      const summaryText = s.extract.length > 420 ? s.extract.slice(0, 420) + "..." : s.extract;

      qs.push({
        summary: summaryText,
        correctTitle: s.title,
        options
      });
    } catch(e) {
      // ignora e segue
    }
  }
  if (qs.length < n) {
    // fallback: usa o que conseguiu
    // (em prática quase sempre fecha as n; categorias são grandes)
  }
  return qs;
}

// ====== TIMER ======
function startTimer() {
  stopTimer();
  timerStart = performance.now();
  const durMs = TIMER_PER_Q * 1000;
  timerLabel.textContent = TIMER_PER_Q + "s";
  timerBar.style.width = "0%";

  function tick(now) {
    const elapsed = now - timerStart;
    const pct = Math.min(100, (elapsed / durMs) * 100);
    timerBar.style.width = pct + "%";
    const left = Math.max(0, TIMER_PER_Q - Math.floor(elapsed/1000));
    timerLabel.textContent = left + "s";
    if (elapsed >= durMs) {
      // tempo acabou -> bloqueia seleção e avança
      lockQuestion();
      nextQuestion(true);
      return;
    }
    timerId = requestAnimationFrame(tick);
  }
  timerId = requestAnimationFrame(tick);
}
function stopTimer() {
  if (timerId) cancelAnimationFrame(timerId);
  timerId = null;
}

// ====== RENDER ======
function renderQuestion() {
  const cur = QUESTIONS[idx];
  qIndex.textContent = (idx+1);
  qTotal.textContent = QUESTIONS.length;
  qText.textContent = cur.summary;
  qFeedback.innerHTML = "";
  qOptions.innerHTML = "";

  cur.options.forEach((op, i) => {
    const isSel = answers[idx] === i;
    const b = document.createElement('button');
    b.className = "opt w-full text-left px-4 py-3 rounded-xl border transition " +
      (isSel ? "bg-brand-50 border-brand-300 text-slate-900" : "bg-white border-brand-100 hover:bg-brand-50");
    b.textContent = op;
    b.dataset.index = i;
    b.onclick = () => selectOption(i);
    qOptions.appendChild(b);
  });

  btnPrev.disabled = idx===0;
  btnNext.textContent = idx===QUESTIONS.length-1 ? "Finalizar" : "Próxima";
  btnNext.disabled = false;

  // reset lifeline disabled styles por questão (não reativa usos já gastos)
  document.querySelectorAll('.opt').forEach(el => el.disabled = false);

  // start timer pra nova questão
  startTimer();
}

function lockQuestion() {
  // desabilita botões de opção
  document.querySelectorAll('.opt').forEach(el => el.disabled = true);
}

function selectOption(i) {
  answers[idx] = i;
  const cur = QUESTIONS[idx];
  const picked = cur.options[i];
  const isHit = picked === cur.correctTitle;

  // atualiza hits: recalcula só no final pra ficar correto mesmo se trocar
  qFeedback.innerHTML = isHit
    ? `<span class="text-brand-600 font-semibold">✔ Resposta certa!</span>`
    : `<span class="text-red-600 font-semibold">✖ Resposta errada.</span> <span class="text-slate-600">Resposta: <em>${cur.correctTitle}</em></span>`;

  // marca visual
  document.querySelectorAll('.opt').forEach((btn, idxBtn) => {
    btn.classList.remove("bg-brand-50","border-brand-300");
    btn.classList.add("bg-white","border-brand-100");
    if (idxBtn === i) {
      btn.classList.add("ring-2", isHit ? "ring-emerald-300" : "ring-red-300");
    }
  });

  // travar ao selecionar (evita ficar clicando sem parar)
  lockQuestion();
  stopTimer();
}

function nextQuestion(autoFromTimer=false) {
  // se ainda não respondeu e foi clique manual, dá aviso
  if (!autoFromTimer && answers[idx] == null) {
    qFeedback.innerHTML = `<span class="text-slate-600">Escolha uma alternativa pra continuar.</span>`;
    return;
  }
  // avança
  if (idx < QUESTIONS.length - 1) {
    idx++; renderQuestion();
  } else {
    // fim
    hits = answers.reduce((acc, ans, i) => {
      if (ans == null) return acc;
      const cur = QUESTIONS[i];
      return acc + (cur.options[ans] === cur.correctTitle ? 1 : 0);
    }, 0);

    const total = QUESTIONS.length;
    const pct = Math.round(hits*100/total);

    byId('playerOut').textContent = sanitizeName(playerNameEl.value || "");
    scoreHits.textContent = hits;
    scoreTotal.textContent = total;
    scorePct.textContent  = pct + "%";
    qResult.classList.remove('hidden');

    // trava lifelines após terminar
    [btn5050, btnSkip].forEach(b => {
      b.disabled = true;
      b.classList.add("opacity-50", "cursor-not-allowed");
    });

    // salva no backend e atualiza ranking
    submitScore(byId('playerOut').textContent, hits, total).then(()=>loadRanking());
    stopTimer();
  }
}

// ====== FLOW ======
btnStart.onclick = async () => {
  const name = sanitizeName(playerNameEl.value || "");
  if (!name) {
    playerNameEl.focus();
    playerNameEl.classList.add("ring-2","ring-red-300");
    setTimeout(()=>playerNameEl.classList.remove("ring-2","ring-red-300"), 800);
    return;
  }
  const n = parseInt(qCountSel.value || "5", 10);
  qResult.classList.add('hidden');
  byId('saveStatus').textContent = "";

  // reseta estado
  allow5050 = true;
  allowSkip  = true;
  hits = 0; idx = 0; answers = [];

  // reabilita visual das lifelines
  resetLifelinesUI();

  qText.textContent = "Gerando perguntas aleatórias da Wikipedia…";
  btnNext.disabled = true;

  try {
    QUESTIONS = await buildQuestions(n);
    if (QUESTIONS.length === 0) {
      qText.textContent = "Não consegui montar perguntas agora. Tenta novamente.";
      return;
    }
    renderQuestion();
  } catch(e) {
    qText.textContent = "Falha ao carregar perguntas. Tenta novamente.";
  }
};

btnPrev.onclick = () => { if (idx>0){ idx--; renderQuestion(); } };
btnNext.onclick = () => nextQuestion(false);

byId('btnRestart').onclick = () => {
  idx=0; answers=[]; hits=0; stopTimer();
  qResult.classList.add('hidden');
  btnNext.disabled = true;
  qIndex.textContent = "–";
  qText.textContent = "Informe seu nome e clique em “Começar quiz”.";
  qOptions.innerHTML = ""; qFeedback.innerHTML = "";
  timerBar.style.width = "0%"; timerLabel.textContent = "20s";

  // reabilita visual das lifelines ao reiniciar
  resetLifelinesUI();
};

// ====== Lifelines ======
btn5050.onclick = () => {
  if (!allow5050) return;
  const cur = QUESTIONS[idx];
  const correctIdx = cur.options.findIndex(t => t === cur.correctTitle);
  // remove 2 erradas aleatórias
  const wrongIdxs = cur.options.map((_,i)=>i).filter(i=>i!==correctIdx);
  const toRemove = shuffle(wrongIdxs).slice(0,2);
  document.querySelectorAll('.opt').forEach((btn,i)=>{
    if (toRemove.includes(i)) {
      btn.disabled = true;
      btn.classList.add("opacity-40");
    }
  });
  allow5050 = false;
  btn5050.classList.add("opacity-50","cursor-not-allowed");
};

btnSkip.onclick = () => {
  if (!allowSkip) return;
  allowSkip = false;
  btnSkip.classList.add("opacity-50","cursor-not-allowed");
  // marca como não respondida e avança
  answers[idx] = answers[idx] ?? null;
  stopTimer();
  nextQuestion(true);
};

// ====== BACKEND (ranking) ======
async function submitScore(name, hits, total) {
  byId('saveStatus').textContent = "Salvando resultado...";
  try {
    const r = await fetch(`${API}/api/score`, {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ name, hits, total })
    });
    if (!r.ok) throw new Error("Falha ao salvar");
    byId('saveStatus').textContent = "Resultado salvo! ✅";
  } catch(e) {
    byId('saveStatus').textContent = "Não consegui salvar no ranking (API offline?).";
  }
}

async function loadRanking() {
  const tbody = byId('rankBody');
  const empty = byId('rankEmpty');
  tbody.innerHTML = "";
  empty.classList.add('hidden');
  try {
    const r = await fetch(`${API}/api/ranking?limit=10`);
    if (!r.ok) throw new Error();
    const data = await r.json(); // [{name,hits,total,percent,created_at}]
    if (!data.length) { empty.classList.remove('hidden'); return; }
    data.forEach((row, i) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="py-2 text-slate-500">${i+1}</td>
        <td class="py-2 font-semibold">${row.name}</td>
        <td class="py-2">${row.hits}/${row.total}</td>
        <td class="py-2">${row.percent}%</td>
        <td class="py-2 text-slate-500 text-sm">${new Date(row.created_at).toLocaleString()}</td>
      `;
      tbody.appendChild(tr);
    });
  } catch {
    empty.classList.remove('hidden');
    empty.textContent = "Não consegui carregar o ranking (API offline?).";
  }
}

byId('btnRefreshRank').onclick = loadRanking;
loadRanking();

// ====== Wikipedia REST API (curiosidade) ======
const topics = ["Mudança climática","Aquecimento global","Gases de efeito estufa",
  "Energia renovável","Reciclagem","Pegada ecológica","Desmatamento","Poluição do ar"];
const btnFact = byId('btnFact'), factBox = byId('factBox');
btnFact.onclick = async () => {
  factBox.textContent = "Buscando curiosidade...";
  const topic = topics[Math.floor(Math.random()*topics.length)];
  try {
    const data = await fetch(`https://pt.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(topic)}`, { headers: { 'Accept':'application/json' }})
      .then(r => r.json());
    const title = data.title || topic;
    const extract = data.extract || "Sem resumo disponível.";
    factBox.innerHTML = `<strong>${title}</strong>: ${extract}`;
  } catch (e) {
    factBox.textContent = "Deu ruim na API da Wikipedia. Tenta de novo.";
  }
};


