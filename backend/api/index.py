import json
import os

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse

import state
from indexer.pipeline import run_indexing
from indexer.tarball import fetch_tarball, extract_and_walk, ExtractedFile
from indexer.types import ProgressEvent

router = APIRouter()


async def fetch_files(owner: str, repo: str) -> list[ExtractedFile]:
    raw = await fetch_tarball(owner, repo, github_token=os.getenv("GITHUB_TOKEN"))
    return extract_and_walk(raw, file_cap=state.DEEP_MODE_FILE_CAP)


def _serialize(ev: ProgressEvent) -> str:
    return json.dumps(
        {
            "phase": ev.phase,
            "current": ev.current,
            "total": ev.total,
            "message": ev.message,
        },
        separators=(",", ":"),
    )


@router.post("/index/{owner}/{repo}")
async def index_repo(owner: str, repo: str, request: Request):
    ip = request.client.host if request.client else "unknown"
    if not state.indexing_rate_limiter.is_allowed(ip):
        raise HTTPException(
            status_code=429,
            detail="Indexing rate limit reached. Try again later.",
        )

    async def generate():
        async with state.index_lock(owner, repo):
            age = state.chroma_store.collection_age_seconds(owner, repo)
            if age is not None and age < state.DEEP_MODE_TTL_SECONDS:
                yield f"data: {_serialize(ProgressEvent(phase='ready'))}\n\n"
                yield "data: [DONE]\n\n"
                return
            try:
                async for ev in run_indexing(
                    owner=owner,
                    repo=repo,
                    fetcher=fetch_files,
                    embedder=state.embedder,
                    store=state.chroma_store,
                ):
                    yield f"data: {_serialize(ev)}\n\n"
            except Exception as e:
                yield f"data: {_serialize(ProgressEvent(phase='failed', message=str(e)[:200]))}\n\n"
            yield "data: [DONE]\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")
