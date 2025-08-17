const $ = (id) => document.getElementById(id);

// UI
const btnStart = $('btnStart');
const btnStop  = $('btnStop');
const dbNowEl  = $('dbNow');
const envNowEl = $('envNow');
const dbPeakEl = $('dbPeak');
const dbAvgEl  = $('dbAvg');
const dbBar    = $('dbBar');
const chartEl  = $('chart');
const statusEl = $('status');
const smooth   = $('smooth');
const smoothVal= $('smoothVal');
const calib    = $('calib');
const calibVal = $('calibVal');
const btnCSV   = $('btnCSV');

// Audio stuff
let ctx, analyser, micSource, rafId = null, stream = null;
let timeData;
let startedAt = null;

// history for avg/peak/chart
const MAX_POINTS = 600; // ~60s se desenhar ~10fps
let series = []; // [{t, db}]

function setStatus(msg){ statusEl.textContent = msg; }

function envLabel(db){
  if (db < 40) return "📚 Biblioteca";
  if (db < 55) return "💬 Escritório";
  if (db < 70) return "🌆 Rua";
  if (db < 85) return "🚗 Trânsito";
  return "🎵 Show/Festa";
}

function drawChart(){
  const ctx2 = chartEl.getContext('2d');
  const W = chartEl.width = chartEl.clientWidth;
  const H = chartEl.height; // já definido no HTML
  ctx2.clearRect(0,0,W,H);

  // eixo base
  ctx2.strokeStyle = 'rgba(16,185,129,.35)';
  ctx2.beginPath();
  ctx2.moveTo(0, H-24);
  ctx2.lineTo(W, H-24);
  ctx2.stroke();

  if (series.length < 2) return;
  const minDb = 30, maxDb = 100; // escala vertical
  const n = series.length;
  const stepX = W / (n-1);

  ctx2.beginPath();
  for (let i=0;i<n;i++){
    const db = Math.max(minDb, Math.min(maxDb, series[i].db));
    const y = H - 24 - ((db - minDb) / (maxDb - minDb)) * (H - 40);
    const x = i * stepX;
    if (i===0) ctx2.moveTo(x,y); else ctx2.lineTo(x,y);
  }
  ctx2.strokeStyle = 'rgba(34,197,94,1)'; // emerald-500
  ctx2.lineWidth = 2;
  ctx2.stroke();
}

function updateBar(db){
  const pct = Math.max(0, Math.min(100, (db - 30) * (100 / 70))); // 30..100 dB -> 0..100%
  dbBar.style.width = `${pct}%`;
}

function avgDb(){
  if (!series.length) return NaN;
  const sum = series.reduce((a,x)=>a+x.db,0);
  return sum / series.length;
}

function peakDb(){
  if (!series.length) return NaN;
  const last30 = series.slice(-300); // ~30s
  return last30.reduce((m,x)=>Math.max(m,x.db), -Infinity);
}

function stop(){
  if (rafId) cancelAnimationFrame(rafId);
  rafId = null;
  if (ctx && ctx.state !== 'closed') ctx.suspend().catch(()=>{});
  if (stream){
    stream.getTracks().forEach(t=>t.stop());
    stream = null;
  }
  setStatus("Parado.");
}

async function start(){
  try{
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') await ctx.resume();

    stream = await navigator.mediaDevices.getUserMedia({ audio: { noiseSuppression:false, echoCancellation:false, autoGainControl:false }, video:false });

    analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = parseFloat(smooth.value || "0.5");
    timeData = new Float32Array(analyser.fftSize);

    micSource = ctx.createMediaStreamSource(stream);
    micSource.connect(analyser);

    series = [];
    startedAt = Date.now();
    loop();
    setStatus("Rodando. Fale/bata palmas pra ver o pico.");
  }catch(e){
    console.error(e);
    setStatus("Não consegui acessar o microfone. Permissão negada?");
  }
}

function loop(){
  analyser.getFloatTimeDomainData(timeData);
  // RMS
  let sum = 0;
  for (let i=0;i<timeData.length;i++){ const v=timeData[i]; sum += v*v; }
  const rms = Math.sqrt(sum / timeData.length) || 1e-12; // evita -Inf
  let dbfs = 20 * Math.log10(rms); // dB full-scale (negativo)
  if (!isFinite(dbfs)) dbfs = -100;

  // offset de calibração -> aproxima dB SPL
  const offset = parseInt(calib.value || "94", 10);
  const db = Math.max(0, Math.min(130, dbfs + offset)); // clamp

  // suavização manual (exponencial): combina valor atual e anterior
  const alpha = parseFloat(smooth.value || "0.5");
  const last = series.length ? series[series.length-1].db : db;
  const dbSmooth = last + (db - last) * (1 - alpha);

  // push histórico
  series.push({ t: Date.now() - startedAt, db: dbSmooth });
  if (series.length > MAX_POINTS) series.shift();

  // UI
  dbNowEl.textContent  = `${Math.round(dbSmooth)} dB`;
  envNowEl.textContent = envLabel(dbSmooth);
  dbPeakEl.textContent = isFinite(peakDb()) ? `${Math.round(peakDb())} dB` : "—";
  dbAvgEl.textContent  = isFinite(avgDb()) ? `${Math.round(avgDb())} dB` : "—";
  updateBar(dbSmooth);
  drawChart();

  rafId = requestAnimationFrame(loop);
}

// handlers
btnStart.onclick = start;
btnStop.onclick  = stop;

smooth.oninput = () => { analyser && (analyser.smoothingTimeConstant = parseFloat(smooth.value)); smoothVal.textContent = parseFloat(smooth.value).toFixed(2); };
calib.oninput  = () => { calibVal.textContent = calib.value; };

smooth.dispatchEvent(new Event('input'));
calib.dispatchEvent(new Event('input'));

// CSV
btnCSV.onclick = () => {
  if (!series.length) return;
  const rows = ["time_ms,db"];
  series.forEach(p => rows.push(`${p.t},${p.db.toFixed(2)}`));
  const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `ecoquiz-audio-${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}.csv`;
  a.click();
};

// qualidade de vida
window.addEventListener('visibilitychange', ()=>{
  if (document.hidden && ctx && ctx.state === 'running') { ctx.suspend(); setStatus("Pausado (aba em segundo plano)."); }
  else if (!document.hidden && ctx && ctx.state === 'suspended' && stream) { ctx.resume(); setStatus("Rodando."); }
});
