from dataclasses import dataclass
from typing import Literal, Optional

Phase = Literal[
    "downloading",
    "extracting",
    "selecting",
    "chunking",
    "embedding",
    "storing",
    "ready",
    "failed",
    "too_large",
]


@dataclass(frozen=True)
class Chunk:
    text: str
    file_path: str
    start_line: int
    end_line: int
    language: str


@dataclass(frozen=True)
class ProgressEvent:
    phase: Phase
    current: Optional[int] = None
    total: Optional[int] = None
    message: Optional[str] = None
