import os
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from api.repo import router as repo_router
from api.chat import router as chat_router

load_dotenv()

app = FastAPI(title="AskAboutGit API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        os.getenv("FRONTEND_URL", "https://askaboutgit.guyregev.dev"),
        "http://localhost:5173",
    ],
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)

app.include_router(repo_router, prefix="/api")
app.include_router(chat_router, prefix="/api")


@app.get("/health")
def health():
    return {"status": "ok"}
