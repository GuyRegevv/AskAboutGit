from indexer.types import Chunk, ProgressEvent


def test_chunk_holds_text_and_metadata():
    c = Chunk(
        text="def foo(): pass",
        file_path="src/a.py",
        start_line=1,
        end_line=1,
        language="python",
    )
    assert c.text == "def foo(): pass"
    assert c.file_path == "src/a.py"
    assert c.language == "python"


def test_progress_event_phases():
    ev = ProgressEvent(phase="embedding", current=10, total=100, message=None)
    assert ev.phase == "embedding"
    assert ev.current == 10
    assert ev.total == 100
