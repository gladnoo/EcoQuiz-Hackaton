const $ = (id) => document.getElementById(id);
const statusEl = $('status');
const listEl = $('list');
const radius = $('radius');
const radiusVal = $('radiusVal');

let map, layer;
const DEFAULT = { lat: -23.5505, lon: -46.6333, zoom: 13 }; // SP como fallback
radius.addEventListener('input', ()=> radiusVal.textContent = radius.value);

function setupMap(lat, lon) {
  if (!map) {
    map = L.map('map').setView([lat, lon], DEFAULT.zoom);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap'
    }).addTo(map);
  } else {
    map.setView([lat, lon], map.getZoom());
  }
  if (layer) layer.remove();
  layer = L.layerGroup().addTo(map);
  L.marker([lat, lon]).addTo(layer).bindPopup('Você está aqui');
}

async function fetchOverpass(lat, lon, rad) {
  // reciclagem (amenity=recycling) e alguns materiais comuns
  const q = `
  [out:json][timeout:25];
  (
    node["amenity"="recycling"](around:${rad},${lat},${lon});
    way["amenity"="recycling"](around:${rad},${lat},${lon});
    relation["amenity"="recycling"](around:${rad},${lat},${lon});
    node["recycling:glass"="yes"](around:${rad},${lat},${lon});
    node["recycling:plastic"="yes"](around:${rad},${lat},${lon});
  );
  out center tags;`;
  const url = "https://overpass-api.de/api/interpreter?data=" + encodeURIComponent(q);
  const r = await fetch(url);
  if (!r.ok) throw new Error("Overpass falhou");
  return (await r.json()).elements || [];
}

function renderResults(items) {
  listEl.innerHTML = "";
  if (!items.length) {
    listEl.innerHTML = `<div class="text-slate-600">Nada encontrado nesse raio. Aumenta o alcance e tenta de novo.</div>`;
    return;
  }
  items.slice(0, 100).forEach((el, i) => {
    const lat = el.lat || el.center?.lat, lon = el.lon || el.center?.lon;
    const name = el.tags?.name || "Ponto de reciclagem";
    const mats = Object.keys(el.tags || {})
      .filter(k => k.startsWith("recycling:") && el.tags[k]==="yes")
      .map(k => k.replace("recycling:",""))
      .join(", ");
    const desc = mats ? `Materiais: ${mats}` : "Materiais não especificados";

    const m = L.marker([lat, lon]).addTo(layer).bindPopup(`<b>${name}</b><br>${desc}`);
    const a = document.createElement('a');
    a.className = "block border border-brand-100 rounded-lg p-2 hover:bg-brand-50";
    a.href = `https://www.openstreetmap.org/${el.type}/${el.id}`;
    a.target = "_blank"; a.rel = "noopener";
    a.innerHTML = `<div class="font-semibold">${name}</div><div class="text-slate-600">${desc}</div>`;
    a.onclick = () => { map.setView([lat, lon], 16); m.openPopup(); };
    listEl.appendChild(a);
  });
}

async function runSearch(lat, lon, rad) {
  statusEl.textContent = "Buscando pontos no mapa...";
  try {
    const data = await fetchOverpass(lat, lon, rad);
    statusEl.textContent = `Encontrados: ${data.length}`;
    renderResults(data);
  } catch(e) {
    statusEl.textContent = "Falha na busca (Overpass). Tenta mais tarde.";
  }
}

$('btnLocate').onclick = () => {
  statusEl.textContent = "Pegando sua localização…";
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const lat = pos.coords.latitude, lon = pos.coords.longitude;
      setupMap(lat, lon);
      runSearch(lat, lon, radius.value);
    },
    () => {
      statusEl.textContent = "Não consegui pegar localização. Usando SP.";
      setupMap(DEFAULT.lat, DEFAULT.lon);
      runSearch(DEFAULT.lat, DEFAULT.lon, radius.value);
    },
    { enableHighAccuracy: true, timeout: 8000 }
  );
};

$('btnBuscar').onclick = () => {
  const center = map ? map.getCenter() : L.latLng(DEFAULT.lat, DEFAULT.lon);
  runSearch(center.lat, center.lng, radius.value);
};

// init
radiusVal.textContent = radius.value;
setupMap(DEFAULT.lat, DEFAULT.lon);
runSearch(DEFAULT.lat, DEFAULT.lon, radius.value);
