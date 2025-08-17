🌱 EcoQuiz — One‑Pager

O que é: Plataforma web gamificada de educação ambiental com quiz (perguntas da Wikipedia), ranking (SQLite), mapa de reciclagem (OSM) e aba interativa (decibéis/CSV). 
--------------------------------------------------------------------------------------

Problema
--------------------------------------------------------------------------------------

Conteúdo ambiental costuma ser teórico e pouco engajador. Falta feedback, prática e dados do mundo real.

Solução
--------------------------------------------------------------------------------------

Aprendizado em formato de jogo + dados vivos da web.

Quiz com perguntas geradas da Wikipedia (pt‑BR).

Ranking persistente com nome, acertos, % e data.

Mapa OSM com pontos de reciclagem da região.

Medidor de ruído via microfone (WebAudio) + export CSV.

Card de resultado em PNG (e e‑mail opcional).

Diferenciais
--------------------------------------------------------------------------------------

Conteúdo sempre atualizado (Wikipedia REST).

Ação local com Overpass/OSM (reciclagem perto do usuário).

Interatividade real (áudio do ambiente) e dados exportáveis.

Simples de rodar (HTML/JS estático + FastAPI + SQLite).

Arquitetura & Stack
--------------------------------------------------------------------------------------

Front (8080): HTML + Tailwind + JS (estático).

Back (5173): FastAPI (Python) com endpoints /health, /api/score, /api/ranking (e /api/send-card opcional).

Banco: SQLite (arquivo criado automaticamente).

APIs externas: Wikipedia REST e Overpass/OSM (sem chave).

Como executar (2 passos)
--------------------------------------------------------------------------------------

Backend

cd backend
pip install -r requirements.txt
python app.py   # http://localhost:5173/health

Frontend (na mesma pasta dos HTML/JS)

python -m http.server 8080   # http://localhost:8080/index.html


--------------------------------------------------------------------------------------


Repo: Repo: https://github.com/gladnoo/EcoQuiz-Hackaton/tree/main •  Contato: jg256972@gmail.com

