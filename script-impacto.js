// Impacto (EcoPontos)
const byId = id => document.getElementById(id);

const slBath    = byId('slBath');
const slMeat    = byId('slMeat');
const slPlastic = byId('slPlastic');
const valBath   = byId('valBath');
const valMeat   = byId('valMeat');
const valPlastic= byId('valPlastic');
const ecoPts    = byId('ecoPts');
const ecoBreak  = byId('ecoBreak');
const btnShareImpact = byId('btnShareImpact');

function updateImpact() {
  const b = parseInt(slBath.value || "0", 10);     // min/dia
  const m = parseInt(slMeat.value || "0", 10);     // ref/sem
  const p = parseInt(slPlastic.value || "0", 10);  // garrafas/sem

  // Regras simples (motivacionais):
  const ptsBath = b * 2 * 7;  // 2 pts por min/dia * 7
  const ptsMeat = m * 5;      // 5 pts por refeição sem carne
  const ptsPlas = p * 1;      // 1 pt por garrafa

  const total = ptsBath + ptsMeat + ptsPlas;

  valBath.textContent = b;
  valMeat.textContent = m;
  valPlastic.textContent = p;
  ecoPts.textContent = total;

  ecoBreak.innerHTML = `
    <li>Banho: <strong>${ptsBath}</strong> pts (−${b} min/dia)</li>
    <li>Sem carne: <strong>${ptsMeat}</strong> pts (${m}/sem)</li>
    <li>Plástico: <strong>${ptsPlas}</strong> pts (${p} garrafas/sem)</li>
  `;

  // guarda no navegador
  localStorage.setItem('eco-impact', JSON.stringify({ b, m, p, total }));
}

[slBath, slMeat, slPlastic].forEach(el => el.addEventListener('input', updateImpact));

// carrega valores salvos
(function init() {
  try {
    const saved = JSON.parse(localStorage.getItem('eco-impact') || "{}");
    if (typeof saved.b === "number") slBath.value = saved.b;
    if (typeof saved.m === "number") slMeat.value = saved.m;
    if (typeof saved.p === "number") slPlastic.value = saved.p;
  } catch {}
  updateImpact();
})();

// compartilhar
if (btnShareImpact) {
  btnShareImpact.onclick = () => {
    const total = ecoPts.textContent;
    const text = `Meus EcoPontos da semana no EcoQuiz 🌱: ${total} pts!`;
    const url  = location.origin + location.pathname.replace('impacto.html','index.html');
    if (navigator.share) {
      navigator.share({ title: "EcoQuiz — Seu Impacto", text, url }).catch(()=>{});
    } else {
      const tw = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
      window.open(tw, "_blank");
    }
  };
}
