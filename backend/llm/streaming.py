import os
from typing import AsyncIterator

from openai import AsyncOpenAI


async def stream_chat(
    context_files: dict[str, str],
    question: str,
) -> AsyncIterator[str]:
    """
    Stream an LLM response about a repo.

    context_files: dict of {path: file_content}
    question: the user's question
    Yields text tokens as they arrive.
    """
    model = os.getenv("LLM_MODEL", "gpt-4o-mini")

    file_context = "\n\n".join(
        f"=== {path} ===\n{content}"
        for path, content in context_files.items()
    )

    system_prompt = (
        "You are an expert software engineer helping users understand open-source repositories. "
        "Answer questions clearly and concisely based on the provided source files. "
        "If the answer isn't evident from the files shown, say so — don't guess.\n\n"
        f"Repository files:\n\n{file_context}"
    )

    client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))

    stream = await client.chat.completions.create(
        model=model,
        max_tokens=1024,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": question},
        ],
        stream=True,
    )

    async for chunk in stream:
        delta = chunk.choices[0].delta.content
        if delta:
            yield delta
