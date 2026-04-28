import io
import tarfile
from dataclasses import dataclass
from typing import Optional

import httpx

from selector.selector import should_skip_path


GITHUB_TARBALL_URL = "https://api.github.com/repos/{owner}/{repo}/tarball"
MAX_FILE_BYTES = 1_000_000  # skip individual files larger than 1MB


@dataclass(frozen=True)
class ExtractedFile:
    path: str
    content: str


class FileTooLargeError(Exception):
    def __init__(self, count: int, limit: int):
        super().__init__(f"Repo has {count} source files, exceeds limit of {limit}")
        self.count = count
        self.limit = limit


async def fetch_tarball(
    owner: str, repo: str, github_token: Optional[str] = None
) -> bytes:
    headers = {"Accept": "application/vnd.github+json"}
    if github_token:
        headers["Authorization"] = f"Bearer {github_token}"
    async with httpx.AsyncClient(follow_redirects=True, timeout=60.0) as client:
        resp = await client.get(
            GITHUB_TARBALL_URL.format(owner=owner, repo=repo), headers=headers
        )
        resp.raise_for_status()
        return resp.content


def extract_and_walk(tarball_bytes: bytes, file_cap: int) -> list[ExtractedFile]:
    out: list[ExtractedFile] = []
    with tarfile.open(fileobj=io.BytesIO(tarball_bytes), mode="r:gz") as tar:
        for member in tar.getmembers():
            if not member.isfile():
                continue
            # Strip the top-level directory GitHub adds (e.g. "owner-repo-sha/")
            parts = member.name.split("/", 1)
            if len(parts) < 2:
                continue
            rel_path = parts[1]
            if should_skip_path(rel_path):
                continue
            if member.size > MAX_FILE_BYTES:
                continue
            f = tar.extractfile(member)
            if f is None:
                continue
            try:
                text = f.read().decode("utf-8")
            except UnicodeDecodeError:
                continue
            out.append(ExtractedFile(path=rel_path, content=text))

    if len(out) > file_cap:
        raise FileTooLargeError(count=len(out), limit=file_cap)
    return out
