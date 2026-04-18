import re
from pathlib import Path

SKIP_DIRS = {
    "node_modules", "vendor", ".git", "dist", "build",
    "__pycache__", ".cache", "coverage", ".next", "venv",
    "env", "target", ".tox",
}

SKIP_EXTENSIONS = {
    ".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico",
    ".woff", ".woff2", ".ttf", ".eot", ".mp4", ".mp3", ".pdf",
    ".zip", ".tar", ".gz",
}

LOCK_FILES = {
    "yarn.lock", "package-lock.json", "poetry.lock",
    "cargo.lock", "pipfile.lock", "composer.lock", "go.sum",
}

TEST_PATTERN = re.compile(
    r"(test_|_test\.|\.test\.|\.spec\.|__tests__/)", re.IGNORECASE
)

ENTRY_POINTS = {
    "main.py", "main.ts", "main.js", "main.go", "main.rs",
    "index.ts", "index.js", "app.py", "app.ts", "app.js",
    "server.py", "server.ts", "server.js",
}

MANIFEST_FILES = {
    "package.json", "pyproject.toml", "go.mod", "cargo.toml",
    "setup.py", "setup.cfg", "composer.json", "gemfile",
    "build.gradle", "pom.xml",
}

CONFIG_EXTENSIONS = {".yaml", ".yml", ".toml", ".ini", ".cfg", ".env.example"}


def _score(path: str) -> int:
    """Return priority score. Return -1 to skip the file."""
    p = Path(path)
    parts = p.parts

    if any(part in SKIP_DIRS for part in parts[:-1]):
        return -1

    name = p.name.lower()

    if name in LOCK_FILES:
        return -1
    if p.suffix.lower() in SKIP_EXTENSIONS:
        return -1
    if TEST_PATTERN.search(path):
        return -1

    if name.startswith("readme"):
        return 100

    if name in MANIFEST_FILES:
        return 90

    if name in ENTRY_POINTS:
        return 80

    if len(parts) == 1 and p.suffix.lower() in CONFIG_EXTENSIONS:
        return 70

    depth_penalty = (len(parts) - 1) * 8
    return max(5, 55 - depth_penalty)


def select_files(tree: list[str], max_files: int = 10) -> list[str]:
    """Given a flat list of file paths, return up to max_files, highest priority first."""
    scored = [(path, _score(path)) for path in tree]
    valid = [(path, score) for path, score in scored if score >= 0]
    valid.sort(key=lambda x: x[1], reverse=True)
    return [path for path, _ in valid[:max_files]]
