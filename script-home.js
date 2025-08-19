// revelação suave
const io = new IntersectionObserver((entries)=>{
  entries.forEach(e=>{
    if (e.isIntersecting){ e.target.classList.add('show'); }
  });
},{threshold:.12});
document.querySelectorAll('.reveal').forEach(el=>{
  el.style.opacity=0; el.style.transform='translateY(12px)';
  el.style.transition='opacity .5s ease, transform .5s ease';
  io.observe(el);
});
document.querySelectorAll('.reveal.show')?.forEach(el=>{
  el.style.opacity=1; el.style.transform='none';
});

// counters fake (ou puxa da API se quiser)
function countUp(el, target, dur=900){
  const start = performance.now();
  function tick(t){
    const p = Math.min(1, (t-start)/dur);
    el.textContent = Math.floor(target*p).toLocaleString('pt-BR');
    if (p<1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}
window.addEventListener('load', ()=>{
  // se quiser, troca por valores reais da API:
  // fetch('http://localhost:5173/api/ranking').then(r=>r.json()).then(d=>{ ... })
  countUp(document.getElementById('count-plays'),  143);
  countUp(document.getElementById('count-scores'), 30);
  countUp(document.getElementById('count-trees'),  24);
});

// reforço de estilos quando reveal ativa
const css = document.createElement('style');
css.textContent = `.reveal.show{opacity:1!important; transform:none!important}`;
document.head.appendChild(css);
