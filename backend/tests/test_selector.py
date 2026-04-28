import pytest
from selector.selector import select_files

SAMPLE_TREE = [
    "README.md",
    "package.json",
    "src/index.ts",
    "src/app.ts",
    "src/utils.ts",
    "src/auth.ts",
    "src/routes/users.ts",
    "src/routes/api.ts",
    "tests/auth.test.ts",
    "tests/utils.test.ts",
    "node_modules/express/index.js",
    "dist/bundle.js",
    "yarn.lock",
    "src/assets/logo.png",
    ".gitignore",
]


def test_readme_is_selected():
    result = select_files(SAMPLE_TREE)
    assert "README.md" in result


def test_package_json_is_selected():
    result = select_files(SAMPLE_TREE)
    assert "package.json" in result


def test_node_modules_excluded():
    result = select_files(SAMPLE_TREE)
    assert not any("node_modules" in p for p in result)


def test_dist_excluded():
    result = select_files(SAMPLE_TREE)
    assert not any("dist" in p for p in result)


def test_lock_files_excluded():
    result = select_files(SAMPLE_TREE)
    assert "yarn.lock" not in result


def test_test_files_excluded():
    result = select_files(SAMPLE_TREE)
    assert not any(".test." in p for p in result)


def test_image_assets_excluded():
    result = select_files(SAMPLE_TREE)
    assert "src/assets/logo.png" not in result


def test_max_ten_files():
    large_tree = [f"src/module{i}.ts" for i in range(20)]
    result = select_files(large_tree)
    assert len(result) <= 10


def test_readme_comes_first():
    result = select_files(SAMPLE_TREE)
    assert result[0] == "README.md"


def test_entry_point_scored_high():
    result = select_files(SAMPLE_TREE)
    idx_index = result.index("src/index.ts") if "src/index.ts" in result else 999
    idx_utils = result.index("src/utils.ts") if "src/utils.ts" in result else 999
    assert idx_index < idx_utils


from selector.selector import should_skip_path


def test_should_skip_path_skips_tests_and_locks():
    assert should_skip_path("tests/test_foo.py") is True
    assert should_skip_path("package-lock.json") is True
    assert should_skip_path("node_modules/foo/index.js") is True


def test_should_skip_path_keeps_source():
    assert should_skip_path("src/main.py") is False
    assert should_skip_path("README.md") is False
