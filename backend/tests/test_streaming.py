# backend/tests/test_streaming.py
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from llm.streaming import stream_chat


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_chunk(text: str) -> MagicMock:
    chunk = MagicMock()
    chunk.choices[0].delta.content = text
    return chunk


async def _fake_stream(text: str = "ok"):
    yield _make_chunk(text)


def _patched_openai(text: str = "ok"):
    """Context manager: patches AsyncOpenAI and returns the mock client."""
    mock_client = MagicMock()
    mock_client.chat.completions.create = AsyncMock(return_value=_fake_stream(text))

    patcher = patch("llm.streaming.AsyncOpenAI", return_value=mock_client)
    return patcher, mock_client


# ---------------------------------------------------------------------------
# Helpers that run stream_chat to completion and capture the create() call
# ---------------------------------------------------------------------------

async def _run_and_capture(context_files, question):
    patcher, mock_client = _patched_openai()
    with patcher:
        async for _ in stream_chat(context_files, question):
            pass
    return mock_client.chat.completions.create.call_args


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

async def test_system_message_is_first_message():
    """Messages list must start with a system role message."""
    call_args = await _run_and_capture({"README.md": "content"}, "What does this do?")
    messages = call_args.kwargs["messages"]
    assert messages[0]["role"] == "system"


async def test_system_prompt_contains_repo_scope_constraint():
    """System prompt must explicitly restrict answers to the loaded repository."""
    call_args = await _run_and_capture({"README.md": "content"}, "What does this do?")
    system_content = call_args.kwargs["messages"][0]["content"].lower()
    # Must state that it only handles this repository
    assert "only" in system_content or "sole purpose" in system_content or "this repository" in system_content


async def test_system_prompt_contains_off_topic_handling_instruction():
    """System prompt must instruct the model how to handle off-topic requests."""
    call_args = await _run_and_capture({"README.md": "content"}, "What does this do?")
    system_content = call_args.kwargs["messages"][0]["content"].lower()
    # Must mention off-topic deflection behavior
    assert "off-topic" in system_content or "outside" in system_content or "redirect" in system_content


async def test_system_prompt_forbids_jailbreak_compliance():
    """System prompt must instruct the model to resist prompt override attempts."""
    call_args = await _run_and_capture({"README.md": "content"}, "What does this do?")
    system_content = call_args.kwargs["messages"][0]["content"].lower()
    assert (
        "override" in system_content
        or "jailbreak" in system_content
        or "ignore" in system_content
        or "instructions" in system_content
    )


async def test_system_prompt_embeds_repo_files():
    """Repo file contents must appear verbatim in the system prompt."""
    files = {"src/main.py": "def hello(): pass"}
    call_args = await _run_and_capture(files, "What does main.py do?")
    system_content = call_args.kwargs["messages"][0]["content"]
    assert "src/main.py" in system_content
    assert "def hello(): pass" in system_content


async def test_user_question_is_last_message():
    """The user's question must be the final message with role 'user'."""
    question = "How is authentication handled?"
    call_args = await _run_and_capture({"README.md": "content"}, question)
    messages = call_args.kwargs["messages"]
    assert messages[-1]["role"] == "user"
    assert messages[-1]["content"] == question


async def test_stream_yields_tokens():
    """stream_chat must yield the text tokens from the API response."""
    patcher, _ = _patched_openai(text="Hello world")
    with patcher:
        tokens = [t async for t in stream_chat({"f.py": "x"}, "What is f?")]
    assert tokens == ["Hello world"]
