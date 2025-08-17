from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import sqlite3, os, re, logging
from datetime import datetime
from os.path import abspath, exists, getsize

# ===== LOGGING =====
logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")

DB_PATH = os.path.join(os.path.dirname(__file__), "ranking.db")
logging.info(f"DB em: {abspath(DB_PATH)}")

def get_conn():
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    import time, shutil
    # tenta criar/abrir normalmente
    try:
        conn = get_conn()
        conn.execute("""
        CREATE TABLE IF NOT EXISTS scores (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            hits INTEGER NOT NULL,
            total INTEGER NOT NULL,
            percent REAL NOT NULL,
            created_at TEXT NOT NULL
        )
        """)
        conn.commit()
        conn.close()
        return
    except sqlite3.DatabaseError as e:
        print("WARN: DB corrompido:", e)

    # se caiu aqui, o arquivo tá zoado -> renomeia e recria do zero
    try:
        try:
            conn.close()
        except:
            pass
        bad = DB_PATH + f".bad.{int(time.time())}"
        if os.path.exists(DB_PATH):
            shutil.move(DB_PATH, bad)
            print("Backup do DB corrompido em:", bad)
        # remove possíveis arquivos WAL/SHM antigos
        for ext in ("-wal", "-shm"):
            try:
                os.remove(DB_PATH + ext)
            except FileNotFoundError:
                pass
        # cria limpo
        conn = get_conn()
        conn.execute("""
        CREATE TABLE IF NOT EXISTS scores (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            hits INTEGER NOT NULL,
            total INTEGER NOT NULL,
            percent REAL NOT NULL,
            created_at TEXT NOT NULL
        )
        """)
        conn.commit()
        conn.close()
        print("DB novo criado em:", DB_PATH)
    except Exception as e:
        print("FALHA ao recriar DB:", e)
        raise
init_db()

# Cria instância do FastAPI
app = FastAPI()

# CORS (front em http://localhost:8080)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:8080", "http://127.0.0.1:8080"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ScoreIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=24)
    hits: int = Field(..., ge=0)
    total: int = Field(..., gt=0)

def sanitize_name(name: str) -> str:
    name = re.sub(r"\s+", " ", name).strip()
    return name[:24]

@app.get("/health")
def health():
    return {"ok": True}

@app.post("/api/score")
def save_score(payload: ScoreIn):
    name = sanitize_name(payload.name)
    if not name:
        raise HTTPException(status_code=400, detail="Nome inválido")
    hits = int(payload.hits)
    total = int(payload.total)
    if hits > total:
        raise HTTPException(status_code=400, detail="Hits > total")

    percent = round((hits * 100.0) / total, 1)
    now = datetime.utcnow().isoformat() + "Z"

    conn = get_conn()
    conn.execute(
        "INSERT INTO scores (name, hits, total, percent, created_at) VALUES (?,?,?,?,?)",
        (name, hits, total, percent, now),
    )
    conn.commit()
    conn.close()

    logging.info(f"Salvo: {name} {hits}/{total} ({percent}%) @ {now}")
    return {"ok": True, "name": name, "hits": hits, "total": total, "percent": percent, "created_at": now}

@app.get("/api/ranking")
def ranking(limit: int = 10):
    limit = max(1, min(limit, 50))
    conn = get_conn()
    cur = conn.execute(
        """
        SELECT name, hits, total, percent, created_at
        FROM scores
        ORDER BY percent DESC, hits DESC, created_at ASC
        LIMIT ?
        """,
        (limit,),
    )
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows

@app.get("/debug/db")
def debug_db():
    size = getsize(DB_PATH) if exists(DB_PATH) else 0
    conn = get_conn()
    try:
        has_table = conn.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='scores'"
        ).fetchone() is not None
        count = conn.execute("SELECT COUNT(*) FROM scores").fetchone()[0] if has_table else 0
    finally:
        conn.close()
    return {
        "db_path": abspath(DB_PATH),
        "size_bytes": size,
        "has_scores_table": has_table,
        "rows": count,
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="0.0.0.0", port=5173, reload=True)
