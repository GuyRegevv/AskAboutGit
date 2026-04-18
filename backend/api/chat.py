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


@router.post("/chat")
async def chat(body: ChatRequest, request: Request):
    ip = request.client.host if request.client else "unknown"

    if not state.rate_limiter.is_allowed(ip):
        raise HTTPException(
            status_code=429,
            detail="You've reached the request limit. Try again in an hour.",
        )

    cache_key = f"{body.owner}/{body.repo}"
    context = state.context_cache.get(cache_key)
    if context is None:
        raise HTTPException(
            status_code=404,
            detail="Repo context not found. Reload the page and try again.",
        )

    async def generate():
        try:
            async for token in stream_chat(context, body.question):
                # Encode newlines so they don't break SSE line framing
                encoded = token.replace('\n', '\\n')
                yield f"data: {encoded}\n\n"
        except Exception:
            yield "data: [ERROR]\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")
