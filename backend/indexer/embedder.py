import os
from typing import Protocol

from openai import AsyncOpenAI


class Embedder(Protocol):
    async def embed_batch(self, texts: list[str]) -> list[list[float]]: ...


class OpenAIEmbedder:
    def __init__(
        self,
        client: AsyncOpenAI | None = None,
        model: str | None = None,
        batch_size: int = 100,
    ):
        self._client = client or AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        self._model = model or os.getenv("EMBEDDING_MODEL", "text-embedding-3-small")
        self._batch_size = batch_size

    async def embed_batch(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
        out: list[list[float]] = []
        for i in range(0, len(texts), self._batch_size):
            batch = texts[i : i + self._batch_size]
            resp = await self._client.embeddings.create(model=self._model, input=batch)
            out.extend(d.embedding for d in resp.data)
        return out
