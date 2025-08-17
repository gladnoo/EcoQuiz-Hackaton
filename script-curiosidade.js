// helpers
const $ = (id) => document.getElementById(id);
const factsGrid = $('factsGrid');
const emptyMsg  = $('emptyMsg');
const historyGrid = $('historyGrid');
const inpSearch = $('inpSearch');
const selCat    = $('selCat');
const btnSearch = $('btnSearch');
const btnRandom = $('btnRandom');
const btnSurprise = $('btnSurprise');
const btnClear  = $('btnClear');

const WIKI_CATEGORIES = [
  "Categoria:Meio ambiente",
  "Categoria:Mudanças climáticas",
  "Categoria:Energia renovável",
  "Categoria:Reciclagem",
  "Categoria:Poluição",
  "Categoria:Desmatamento",
  "Categoria:Aquecimento global",
];

function isBadSummary(s) {
  const txt = (s.description || "").toLowerCase();
  if (txt.includes("desambiguação")) return true;
  if (txt.includes("lista de") || txt.includes("lista")) return true;
  if ((s.extract || "").length < 60) return true;
  return false;
}

async function fetchCategoryMembers(cat, limit=100) {
  const url = `https://pt.wikipedia.org/w/api.php?origin=*&action=query&list=categorymembers&cmtitle=${encodeURIComponent(cat)}&cmlimit=${limit}&cmtype=page&format=json`;
  const r = await fetch(url);
  if (!r.ok) throw new Error("Wiki cat fail");
  const j = await r.json();
  return (j?.query?.categorymembers || []).map(m => m.title);
}

async function fetchSummary(title) {
  const url = `https://pt.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
  const r = await fetch(url, { headers: { 'Accept':'application/json' }});
  if (!r.ok) throw new Error("Wiki summary fail");
  const d = await r.json();
  return {
    title: d.title,
    extract: d.extract || "",
    description: d.description || "",
    url: d.content_urls?.desktop?.page || `https://pt.wikipedia.org/wiki/${encodeURIComponent(title.replaceAll(' ','_'))}`,
    thumb: d.thumbnail?.source || null
  };
}

function cardHTML(s) {
  const img = s.thumb ? `<img src="${s.thumb}" alt="" class="h-28 w-full object-cover rounded-xl mb-3">` : '';
  const extract = s.extract.length > 280 ? s.extract.slice(0,280)+"..." : s.extract;
  return `
    <article class="bg-white rounded-2xl p-4 border border-brand-100 shadow-soft flex flex-col">
      ${img}
      <h4 class="font-extrabold text-lg">${s.title}</h4>
      <p class="text-slate-700 mt-1 text-sm flex-1">${extract}</p>
      <div class="mt-3 flex gap-2">
        <a href="${s.url}" target="_blank" rel="noopener" class="px-3 py-2 rounded-lg bg-brand-500 text-white hover:bg-brand-600 text-sm">Ler na Wikipedia</a>
        <button class="px-3 py-2 rounded-lg bg-white border border-brand-200 hover:bg-brand-50 text-sm" data-copy="${s.url}">Copiar link</button>
      </div>
    </article>
  `;
}

function renderCards(list) {
  factsGrid.innerHTML = list.map(cardHTML).join('');
  emptyMsg.classList.toggle('hidden', list.length > 0);
  // bind copiar link
  factsGrid.querySelectorAll('button[data-copy]').forEach(btn=>{
    btn.onclick = async () => {
      try { await navigator.clipboard.writeText(btn.dataset.copy); btn.textContent = "Copiado!"; setTimeout(()=>btn.textContent="Copiar link", 1200); }
      catch { /* ignore */ }
    };
  });
}

function addHistory(s) {
  try {
    const hist = JSON.parse(localStorage.getItem('eco-facts-history') || "[]");
    const item = { title: s.title, url: s.url, thumb: s.thumb || null };
    // evitar duplicado pelo título
    const newHist = [item, ...hist.filter(x=>x.title!==item.title)].slice(0,12);
    localStorage.setItem('eco-facts-history', JSON.stringify(newHist));
  } catch {}
  renderHistory();
}

function renderHistory() {
  try {
    const hist = JSON.parse(localStorage.getItem('eco-facts-history') || "[]");
    historyGrid.innerHTML = hist.map(h => `
      <a class="group block bg-white rounded-xl border border-brand-100 p-3 hover:bg-brand-50 transition" href="${h.url}" target="_blank" rel="noopener">
        ${h.thumb ? `<img src="${h.thumb}" class="h-24 w-full object-cover rounded-lg mb-2">` : ``}
        <div class="font-semibold group-hover:underline">${h.title}</div>
      </a>
    `).join('');
  } catch { historyGrid.innerHTML = ""; }
}

async function randomFromCategory(cat) {
  const titles = await fetchCategoryMembers(cat, 100);
  if (!titles.length) throw new Error("categoria vazia");
  // tenta algumas vezes até achar um bom resumo
  for (let i=0; i<6; i++) {
    const t = titles[Math.floor(Math.random()*titles.length)];
    try {
      const s = await fetchSummary(t);
      if (!isBadSummary(s)) return s;
    } catch {}
  }
  // fallback qualquer
  return await fetchSummary(titles[0]);
}

async function randomFromAll() {
  const cats = [...WIKI_CATEGORIES];
  const cat = cats[Math.floor(Math.random()*cats.length)];
  return await randomFromCategory(cat);
}

// UI handlers
async function handleRandom() {
  factsGrid.innerHTML = `<div class="text-center text-slate-600">Buscando curiosidade...</div>`;
  try {
    const category = selCat?.value === "auto" ? null : selCat.value;
    const s = category ? await randomFromCategory(category) : await randomFromAll();
    renderCards([s]);
    addHistory(s);
  } catch {
    factsGrid.innerHTML = `<div class="text-center text-slate-600">Deu ruim na busca. Tenta novamente.</div>`;
  }
}

async function handleSearch() {
  const q = (inpSearch.value || "").trim();
  if (!q) { inpSearch.focus(); return; }
  factsGrid.innerHTML = `<div class="text-center text-slate-600">Buscando “${q}”...</div>`;
  try {
    const s = await fetchSummary(q);
    if (isBadSummary(s)) {
      factsGrid.innerHTML = `<div class="text-center text-slate-600">Resumo fraco/desambiguação. Tenta outro termo.</div>`;
      return;
    }
    renderCards([s]);
    addHistory(s);
  } catch {
    factsGrid.innerHTML = `<div class="text-center text-slate-600">Não achei. Tenta outra palavra.</div>`;
  }
}

async function handleSurprise() {
  factsGrid.innerHTML = `<div class="text-center text-slate-600">Gerando 3 curiosidades...</div>`;
  const bag = [];
  const seen = new Set();
  let guard = 0;
  while (bag.length < 3 && guard < 15) {
    guard++;
    try {
      const s = await randomFromAll();
      if (isBadSummary(s) || seen.has(s.title)) continue;
      bag.push(s); seen.add(s.title);
    } catch {}
  }
  renderCards(bag);
  bag.forEach(addHistory);
}

// binds
btnRandom.onclick = handleRandom;
btnSearch.onclick = handleSearch;
btnSurprise.onclick = handleSurprise;
btnClear.onclick = () => { factsGrid.innerHTML = ""; emptyMsg.classList.remove('hidden'); };

// enter pra buscar
inpSearch.addEventListener('keydown', (e)=>{ if (e.key === 'Enter') handleSearch(); });

// init
renderHistory();
emptyMsg.classList.remove('hidden');
