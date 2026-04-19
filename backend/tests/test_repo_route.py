from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from api.repo import load_repo


async def test_cache_miss_returns_files():
    with (
        patch("api.repo.GitHubClient") as MockGH,
        patch("api.repo.select_files", return_value=["README.md", "package.json"]),
        patch("api.repo.state") as mock_state,
    ):
        mock_state.context_cache.get.return_value = None
        mock_state.context_cache.set = MagicMock()

        mock_gh = AsyncMock()
        mock_gh.get_file_tree.return_value = ["README.md", "package.json", "src/index.ts"]
        mock_gh.get_file_contents.return_value = {
            "README.md": "# Hello",
            "package.json": "{}",
        }
        mock_gh.aclose = AsyncMock()
        MockGH.return_value = mock_gh

        result = await load_repo("owner", "repo")

    assert "files" in result
    assert set(result["files"]) == {"README.md", "package.json"}


async def test_cache_hit_returns_files():
    with patch("api.repo.state") as mock_state:
        mock_state.context_cache.get.return_value = {
            "README.md": "# Hello",
            "src/index.ts": "export default {}",
        }

        result = await load_repo("owner", "repo")

    assert "files" in result
    assert set(result["files"]) == {"README.md", "src/index.ts"}
