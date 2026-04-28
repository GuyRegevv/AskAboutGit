from langchain_text_splitters import (
    Language,
    RecursiveCharacterTextSplitter,
)

from indexer.tarball import ExtractedFile
from indexer.types import Chunk


CHUNK_SIZE = 1500
CHUNK_OVERLAP = 200

_EXT_TO_LANGUAGE: dict[str, Language] = {
    ".py": Language.PYTHON,
    ".js": Language.JS,
    ".jsx": Language.JS,
    ".ts": Language.TS,
    ".tsx": Language.TS,
    ".go": Language.GO,
    ".rs": Language.RUST,
    ".java": Language.JAVA,
    ".rb": Language.RUBY,
    ".php": Language.PHP,
    ".cs": Language.CSHARP,
    ".cpp": Language.CPP,
    ".c": Language.CPP,
    ".kt": Language.KOTLIN,
    ".swift": Language.SWIFT,
    ".md": Language.MARKDOWN,
}

_LANGUAGE_NAME = {
    Language.PYTHON: "python",
    Language.JS: "javascript",
    Language.TS: "typescript",
    Language.GO: "go",
    Language.RUST: "rust",
    Language.JAVA: "java",
    Language.RUBY: "ruby",
    Language.PHP: "php",
    Language.CSHARP: "csharp",
    Language.CPP: "cpp",
    Language.KOTLIN: "kotlin",
    Language.SWIFT: "swift",
    Language.MARKDOWN: "markdown",
}


def _splitter_for(path: str) -> tuple[RecursiveCharacterTextSplitter, str]:
    ext = "." + path.rsplit(".", 1)[-1].lower() if "." in path else ""
    lang = _EXT_TO_LANGUAGE.get(ext)
    if lang is None:
        return (
            RecursiveCharacterTextSplitter(
                chunk_size=CHUNK_SIZE, chunk_overlap=CHUNK_OVERLAP
            ),
            "text",
        )
    return (
        RecursiveCharacterTextSplitter.from_language(
            language=lang, chunk_size=CHUNK_SIZE, chunk_overlap=CHUNK_OVERLAP
        ),
        _LANGUAGE_NAME[lang],
    )


def chunk_files(files: list[ExtractedFile]) -> list[Chunk]:
    out: list[Chunk] = []
    for f in files:
        if not f.content.strip():
            continue
        splitter, language = _splitter_for(f.path)
        pieces = splitter.split_text(f.content)
        cursor = 0
        for piece in pieces:
            if not piece.strip():
                continue
            start = f.content.find(piece, cursor)
            if start == -1:
                start = cursor
            start_line = f.content.count("\n", 0, start) + 1
            end_line = start_line + piece.count("\n")
            cursor = start + len(piece)
            out.append(
                Chunk(
                    text=piece,
                    file_path=f.path,
                    start_line=start_line,
                    end_line=end_line,
                    language=language,
                )
            )
    return out
