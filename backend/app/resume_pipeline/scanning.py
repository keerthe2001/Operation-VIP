"""Malware scanning via the ClamAV daemon's INSTREAM protocol (no extra dependencies)."""

import asyncio
import logging
import struct
from dataclasses import dataclass
from typing import Protocol

logger = logging.getLogger(__name__)

CHUNK_SIZE = 64 * 1024


@dataclass(frozen=True)
class ScanResult:
    clean: bool
    signature: str | None = None


class ScannerUnavailableError(RuntimeError):
    pass


class MalwareScanner(Protocol):
    async def scan(self, data: bytes) -> ScanResult: ...


class NoopScanner:
    """Used when scanning is disabled (development)."""

    async def scan(self, data: bytes) -> ScanResult:
        return ScanResult(clean=True)


class ClamdScanner:
    def __init__(
        self,
        *,
        host: str = "localhost",
        port: int = 3310,
        socket_path: str | None = None,
        timeout: float = 30.0,
    ) -> None:
        self.host = host
        self.port = port
        self.socket_path = socket_path
        self.timeout = timeout

    async def _connect(self) -> tuple[asyncio.StreamReader, asyncio.StreamWriter]:
        if self.socket_path:
            return await asyncio.open_unix_connection(self.socket_path)
        return await asyncio.open_connection(self.host, self.port)

    async def scan(self, data: bytes) -> ScanResult:
        try:
            return await asyncio.wait_for(self._scan(data), timeout=self.timeout)
        except (OSError, TimeoutError, asyncio.IncompleteReadError) as exc:
            raise ScannerUnavailableError(str(exc)) from exc

    async def _scan(self, data: bytes) -> ScanResult:
        reader, writer = await self._connect()
        try:
            writer.write(b"zINSTREAM\0")
            for start in range(0, len(data), CHUNK_SIZE):
                chunk = data[start : start + CHUNK_SIZE]
                writer.write(struct.pack("!L", len(chunk)) + chunk)
                await writer.drain()
            writer.write(struct.pack("!L", 0))
            await writer.drain()
            reply = (await reader.read(4096)).rstrip(b"\0").decode(errors="replace").strip()
        finally:
            writer.close()
            await writer.wait_closed()
        # Replies look like "stream: OK" or "stream: Eicar-Signature FOUND".
        if reply.endswith("OK"):
            return ScanResult(clean=True)
        if reply.endswith("FOUND"):
            signature = reply.removeprefix("stream:").removesuffix("FOUND").strip()
            return ScanResult(clean=False, signature=signature)
        raise ScannerUnavailableError(f"Unexpected clamd reply: {reply!r}")


def create_scanner(kind: str, *, host: str, port: int, socket_path: str | None) -> MalwareScanner:
    if kind == "clamd":
        return ClamdScanner(host=host, port=port, socket_path=socket_path)
    return NoopScanner()
