"""Write the OpenAPI schema to a file so the frontend can generate TypeScript types.

Usage: uv run python -m scripts.export_openapi ../packages/api-types/openapi.json
"""

import json
import sys
from pathlib import Path

from app.core.config import Settings
from app.main import create_app


def main() -> None:
    target = Path(sys.argv[1] if len(sys.argv) > 1 else "openapi.json")
    # The schema does not depend on secrets; a throwaway value lets this run anywhere.
    app = create_app(Settings(jwt_secret="schema-export-only-" + "x" * 32))
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(app.openapi(), indent=2, sort_keys=True) + "\n")
    print(f"Wrote {target}")


if __name__ == "__main__":
    main()
