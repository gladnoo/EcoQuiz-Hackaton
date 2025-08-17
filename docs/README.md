<h1><b>🌱 EcoQuiz — Hackathon 2025</b></h1>

Plataforma web gamificada de educação ambiental: quiz com ranking, curiosidades (Wikipedia), mapa de reciclagem (OSM) e aba interativa de decibéis.

<h2>📌 Visão geral</h2>

O EcoQuiz transforma educação ambiental em jogo:

Quiz com perguntas aleatórias da Wikipedia (conteúdo vivo).

Ranking persistente em SQLite (nome, acertos, %, data).

Curiosidades com resumo da Wikipedia.

Mapa de pontos de reciclagem via Overpass/OSM.

Aba Interativo com medidor de decibéis via microfone (WebAudio) e export CSV.

Card de resultado (PNG) e envio por e‑mail (SMTP opcional).

✅ Requisitos atendidos

API externa real: Wikipedia REST + Overpass/OSM (e SMTP opcional).

Banco de dados: SQLite (relacional) com criação automática.

Código + documentação: repositório com README e one‑pager (docs/ONEPAGER.md).



<h2>🏗️ Arquitetura</h2>

Frontend (estático)             Backend (FastAPI)              Banco
HTTP :8080  ─────────►  HTTP :5173 /api/* endpoints  ─────►  SQLite (arquivo)
index.html + JS           /health, /api/score, /api/ranking
                          (/api/send-card opcional SMTP)

Observação: para simplificar a avaliação, o front é servido como arquivos estáticos (python -m http.server) e o back roda em FastAPI com CORS liberado para :8080.

<h2>🛠️ Pré‑requisitos</h2>

Python 3.11+ (testado com 3.13), pip

Navegador moderno (Chrome/Edge/Firefox) com permissão de microfone



<h2>🚀 Como rodar </h2>

Comandos para Windows/PowerShell. Em Linux/Mac, ajuste python3/pip3.

<b>1) Backend — porta 5173</b>

cd backend
pip install -r requirements.txt
python app.py

Teste: abra http://localhost:5173/health → {"ok": true}

<b>2) Frontend — porta 8080</b>

# na pasta onde estão os HTML/JS (neste projeto, a própria pasta backend)
cd backend
python -m http.server 8080

Abra: http://localhost:8080/index.html

Pronto. Jogue uma partida e veja o ranking atualizar.

<h2>🧪 Como testar a API</h2>

# health
curl http://localhost:5173/health

# salvar score
curl -X POST http://localhost:5173/api/score `
  -H "Content-Type: application/json" `
  -d "{\"name\":\"Gomes\",\"hits\":4,\"total\":5}"

# listar ranking
curl http://localhost:5173/api/ranking

🔌 APIs externas

Wikipedia REST — perguntas/curiosidades:https://pt.wikipedia.org/api/rest_v1/page/summary/{title}

Overpass / OpenStreetMap — pontos de reciclagem:https://overpass-api.de/api/interpreter (consulta amenity=recycling)

<h2>🗃️ Banco de dados</h2>

Arquivo SQLite criado automaticamente (padrão: backend/ranking.db ou backend/data/ranking.db, conforme o código).

Tabela scores:

CREATE TABLE IF NOT EXISTS scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  hits INTEGER NOT NULL,
  total INTEGER NOT NULL,
  percent REAL NOT NULL,
  created_at TEXT NOT NULL
);

Endpoints

POST /api/scoreBody: { name: string (1–24), hits: number, total: number }Regra: percent = round(hits*100/total, 1)

GET /api/ranking?limit=10Retorno: [{ name, hits, total, percent, created_at }] ordenado por percent DESC, hits DESC.

POST /api/send-card (opcional e‑mail)Body: { to, subject?, message?, png_base64 } — anexa o PNG gerado no front.

<h2>🧱 Estrutura do projeto</h2>



backend/
├─ app.py                 # FastAPI (porta 5173)
├─ requirements.txt
├─ ranking.db             # gerado em runtime (pode não existir no repo)
├─ index.html             # quiz
├─ impacto.html
├─ curiosidade.html
├─ mapa.html
├─ interativo.html        # medidor de dB + CSV
├─ script.js              # core do quiz + ranking + share/email
├─ script-impacto.js
├─ script-curiosidade.js
├─ script-mapa.js
└─ script-interativo.js



<h2>🧯 Troubleshooting</h2>

“API offline?” no rankingVerifique se o back está em :5173 e o front em :8080. Abra /health.

no such table: scoresApagou o .db? Reinicie o back para rodar init_db() e recriar a tabela.

database disk image is malformedPare o back, apague ranking.db, ranking.db-wal, ranking.db-shm e rode python app.py para recriar.

Mic não funciona no InterativoAcesse via http://localhost (não file://) e permita o microfone no cadeado do navegador.

404 em arquivos ************************************************.jsCaminho/nome errado. Confira no DevTools (aba Network) e ajuste a tag <script defer src="./NOME.js">.

Mapa sem pontosA API Overpass às vezes limita requisições; tente novamente ou reduza a área de busca.
