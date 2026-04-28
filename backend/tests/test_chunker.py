from indexer.chunker import chunk_files
from indexer.tarball import ExtractedFile


def test_chunk_python_file_produces_chunks_with_metadata():
    files = [
        ExtractedFile(
            path="a.py",
            content="def foo():\n    return 1\n\n\ndef bar():\n    return 2\n",
        )
    ]
    chunks = chunk_files(files)
    assert len(chunks) >= 1
    for c in chunks:
        assert c.file_path == "a.py"
        assert c.language == "python"
        assert c.text.strip() != ""


def test_chunk_unknown_extension_falls_back():
    files = [ExtractedFile(path="notes.txt", content="hello world\n" * 50)]
    chunks = chunk_files(files)
    assert len(chunks) >= 1
    assert chunks[0].language == "text"


def test_chunk_skips_empty_files():
    files = [ExtractedFile(path="a.py", content="")]
    chunks = chunk_files(files)
    assert chunks == []
