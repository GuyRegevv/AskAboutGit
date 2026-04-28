import pytest
from pathlib import Path

from indexer.tarball import extract_and_walk, FileTooLargeError


FIXTURE = Path(__file__).parent / "fixtures" / "sample-repo.tar.gz"


def test_extract_and_walk_returns_source_files_only():
    files = extract_and_walk(FIXTURE.read_bytes(), file_cap=100)

    paths = sorted(f.path for f in files)
    assert "README.md" in paths
    assert "src/main.py" in paths
    assert all("tests/" not in p for p in paths)
    assert all("node_modules/" not in p for p in paths)


def test_extract_and_walk_enforces_file_cap():
    with pytest.raises(FileTooLargeError) as exc:
        extract_and_walk(FIXTURE.read_bytes(), file_cap=1)
    assert exc.value.count >= 2
    assert exc.value.limit == 1


def test_extracted_file_has_content():
    files = extract_and_walk(FIXTURE.read_bytes(), file_cap=100)
    by_path = {f.path: f.content for f in files}
    assert "def main()" in by_path["src/main.py"]
