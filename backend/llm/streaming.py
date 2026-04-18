import os
from typing import AsyncIterator

import anthropic


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
    model = os.getenv("LLM_MODEL", "claude-haiku-4-5-20251001")

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

    client = anthropic.AsyncAnthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))

    async with client.messages.stream(
        model=model,
        max_tokens=1024,
        system=system_prompt,
        messages=[{"role": "user", "content": question}],
    ) as stream:
        async for text in stream.text_stream:
            yield text
