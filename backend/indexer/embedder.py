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
        self._explicit_client = client
        self._model = model or os.getenv("EMBEDDING_MODEL", "text-embedding-3-small")
        self._batch_size = batch_size
        self._lazy_client: AsyncOpenAI | None = None

    def _get_client(self) -> AsyncOpenAI:
        if self._explicit_client is not None:
            return self._explicit_client
        if self._lazy_client is None:
            self._lazy_client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        return self._lazy_client

    async def embed_batch(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
        client = self._get_client()
        out: list[list[float]] = []
        for i in range(0, len(texts), self._batch_size):
            batch = texts[i : i + self._batch_size]
            resp = await client.embeddings.create(model=self._model, input=batch)
            out.extend(d.embedding for d in resp.data)
        return out
