import base64
import os
from typing import Optional

import httpx


class GitHubError(Exception):
    """Raised for known GitHub API errors."""
    def __init__(self, message: str, status_code: int):
        super().__init__(message)
        self.status_code = status_code


class GitHubClient:
    BASE_URL = "https://api.github.com"

    def __init__(self, token: Optional[str] = None):
        self._token = token or os.getenv("GITHUB_TOKEN")
        headers = {
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        }
        if self._token:
            headers["Authorization"] = f"Bearer {self._token}"
        self._client = httpx.AsyncClient(headers=headers, timeout=15.0)

    async def get_file_tree(self, owner: str, repo: str) -> list[str]:
        """Return a flat list of all blob paths in the repo's default branch."""
        repo_resp = await self._client.get(f"{self.BASE_URL}/repos/{owner}/{repo}")
        if repo_resp.status_code == 404:
            raise GitHubError(f"Repository {owner}/{repo} not found or is private.", 404)
        if repo_resp.status_code == 403:
            raise GitHubError("GitHub API rate limit exceeded. Try again later.", 503)
        repo_resp.raise_for_status()

        default_branch = repo_resp.json()["default_branch"]

        tree_resp = await self._client.get(
            f"{self.BASE_URL}/repos/{owner}/{repo}/git/trees/{default_branch}",
            params={"recursive": "1"},
        )
        tree_resp.raise_for_status()

        data = tree_resp.json()
        return [item["path"] for item in data.get("tree", []) if item["type"] == "blob"]

    async def get_file_contents(
        self, owner: str, repo: str, paths: list[str]
    ) -> dict[str, str]:
        """Fetch and decode content for each path. Skips files that fail."""
        results: dict[str, str] = {}
        for path in paths:
            resp = await self._client.get(
                f"{self.BASE_URL}/repos/{owner}/{repo}/contents/{path}"
            )
            if resp.status_code != 200:
                continue
            data = resp.json()
            if data.get("encoding") == "base64":
                try:
                    results[path] = base64.b64decode(data["content"]).decode(
                        "utf-8", errors="replace"
                    )
                except Exception:
                    continue
        return results

    async def aclose(self):
        await self._client.aclose()
