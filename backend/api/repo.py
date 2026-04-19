from fastapi import APIRouter, HTTPException
from github.client import GitHubClient, GitHubError
from selector.selector import select_files
import state

router = APIRouter()


@router.get("/repo/{owner}/{repo}")
async def load_repo(owner: str, repo: str):
    """
    Fetch the repo's file tree, select key files, fetch their contents,
    and store in the context cache. Returns 200 with file list if ready.
    """
    cache_key = f"{owner}/{repo}"

    context = state.context_cache.get(cache_key)
    if context is not None:
        return {"owner": owner, "repo": repo, "status": "ready", "files": list(context.keys())}

    client = GitHubClient()
    try:
        tree = await client.get_file_tree(owner, repo)
        selected_paths = select_files(tree)
        contents = await client.get_file_contents(owner, repo, selected_paths)
    except GitHubError as e:
        raise HTTPException(status_code=e.status_code, detail=str(e))
    finally:
        await client.aclose()

    if not contents:
        raise HTTPException(
            status_code=422,
            detail="Could not read any files from this repository.",
        )

    state.context_cache.set(cache_key, contents)
    return {"owner": owner, "repo": repo, "status": "ready", "files": list(contents.keys())}
