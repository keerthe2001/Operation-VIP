from typing import Protocol


class StorageError(Exception):
    pass


class FileStorage(Protocol):
    """Minimal object-storage interface used for uploaded documents."""

    async def put(self, key: str, data: bytes, content_type: str) -> None: ...

    async def get(self, key: str) -> bytes: ...

    async def delete(self, key: str) -> None: ...
