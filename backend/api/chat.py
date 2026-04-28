from typing import Literal

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from llm.streaming import stream_chat
import state

router = APIRouter()


class ChatRequest(BaseModel):
    owner: str
    repo: str
    question: str
    mode: Literal["free", "deep"] = "free"


async def _build_deep_context(
    owner: str, repo: str, question: str, base_context: dict[str, str]
) -> dict[str, str]:
    age = state.chroma_store.collection_age_seconds(owner, repo)
    if age is None or age >= state.DEEP_MODE_TTL_SECONDS:
        raise HTTPException(
            status_code=409,
            detail="Deep mode index not ready for this repo. Run indexing first.",
        )
    [q_emb] = await state.embedder.embed_batch([question])
    chunks = state.chroma_store.query(owner, repo, q_emb, k=state.DEEP_MODE_TOP_K)
    merged = dict(base_context)
    for c in chunks:
        key = f"{c.file_path}:{c.start_line}-{c.end_line}"
        merged[key] = c.text
    return merged


@router.post("/chat")
async def chat(body: ChatRequest, request: Request):
    ip = request.client.host if request.client else "unknown"
    if not state.rate_limiter.is_allowed(ip):
        raise HTTPException(
            status_code=429,
            detail="You've reached the request limit. Try again in an hour.",
        )

    cache_key = f"{body.owner}/{body.repo}"
    base_context = state.context_cache.get(cache_key)
    if base_context is None:
        raise HTTPException(
            status_code=404,
            detail="Repo context not found. Reload the page and try again.",
        )

    if body.mode == "deep":
        context = await _build_deep_context(
            body.owner, body.repo, body.question, base_context
        )
    else:
        context = base_context

    async def generate():
        try:
            async for token in stream_chat(context, body.question):
                encoded = token.replace("\n", "\\n")
                yield f"data: {encoded}\n\n"
        except Exception:
            yield "data: [ERROR]\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")
