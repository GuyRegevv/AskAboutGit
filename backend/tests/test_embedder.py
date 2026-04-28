import pytest
from unittest.mock import AsyncMock

from indexer.embedder import OpenAIEmbedder


@pytest.mark.asyncio
async def test_openai_embedder_calls_api_in_batches():
    fake_client = AsyncMock()
    fake_client.embeddings.create = AsyncMock(side_effect=[
        type("R", (), {"data": [type("D", (), {"embedding": [0.1, 0.2]})() for _ in range(2)]})(),
        type("R", (), {"data": [type("D", (), {"embedding": [0.3, 0.4]})()]})(),
    ])
    embedder = OpenAIEmbedder(client=fake_client, model="test-model", batch_size=2)

    result = await embedder.embed_batch(["a", "b", "c"])

    assert len(result) == 3
    assert result[0] == [0.1, 0.2]
    assert fake_client.embeddings.create.await_count == 2


@pytest.mark.asyncio
async def test_openai_embedder_empty_input():
    fake_client = AsyncMock()
    embedder = OpenAIEmbedder(client=fake_client, model="m", batch_size=10)

    result = await embedder.embed_batch([])

    assert result == []
    fake_client.embeddings.create.assert_not_called()
