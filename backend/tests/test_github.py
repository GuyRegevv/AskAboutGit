import pytest
from github.client import GitHubClient


@pytest.fixture
async def client():
    c = GitHubClient()
    yield c
    await c.aclose()


@pytest.mark.asyncio
async def test_get_file_tree_returns_paths(client):
    tree = await client.get_file_tree("octocat", "Hello-World")
    assert isinstance(tree, list)
    assert len(tree) > 0
    assert all(isinstance(p, str) for p in tree)


@pytest.mark.asyncio
async def test_get_file_tree_nonexistent_repo_raises(client):
    from github.client import GitHubError
    with pytest.raises(GitHubError) as exc_info:
        await client.get_file_tree("octocat", "this-repo-does-not-exist-xyz")
    assert exc_info.value.status_code == 404


@pytest.mark.asyncio
async def test_get_file_contents_returns_text(client):
    tree = await client.get_file_tree("octocat", "Hello-World")
    contents = await client.get_file_contents("octocat", "Hello-World", tree[:1])
    assert len(contents) == 1
    path = tree[0]
    assert isinstance(contents[path], str)
