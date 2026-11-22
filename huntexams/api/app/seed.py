"""Load or reload curriculum content from YAML.

uv run python -m app.seed            # load only if the database has no content
uv run python -m app.seed --reload   # overwrite database content from the YAML files
uv run python -m app.seed --check    # validate the YAML and exit (used in CI)
"""

import asyncio
import sys
from pathlib import Path

from app.config import get_settings
from app.content import check_content_tree, load_content_tree, sync_content
from app.core import Database


async def main(argv: list[str]) -> int:
    settings = get_settings()
    root = Path(settings.content_dir)
    if "--check" in argv:
        tree = load_content_tree(root)
        problems = check_content_tree(tree)
        topics = sum(len(lv.get("topics", [])) for lv in tree["levels"])
        if problems:
            print("Content problems:\n  " + "\n  ".join(problems))
            return 1
        print(
            f"Content OK: {len(tree['levels'])} levels, {topics} topics, "
            f"{len(tree['labs'])} labs, {len(tree['guides'])} guides"
        )
        return 0
    db = Database(settings.database_url)
    async with db.sessionmaker() as session:
        print(await sync_content(session, root, overwrite="--reload" in argv))
    await db.dispose()
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main(sys.argv[1:])))
