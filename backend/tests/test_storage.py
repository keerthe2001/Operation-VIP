import boto3
import pytest
from moto import mock_aws

from app.storage.base import StorageError
from app.storage.local import LocalFileStorage
from app.storage.s3 import S3FileStorage


async def test_local_storage_roundtrip(tmp_path):
    storage = LocalFileStorage(tmp_path)
    await storage.put("users/u1/a.pdf", b"data", "application/pdf")
    assert await storage.get("users/u1/a.pdf") == b"data"
    await storage.delete("users/u1/a.pdf")
    with pytest.raises(StorageError):
        await storage.get("users/u1/a.pdf")


async def test_local_storage_blocks_path_traversal(tmp_path):
    storage = LocalFileStorage(tmp_path / "root")
    with pytest.raises(StorageError):
        await storage.put("../escape.txt", b"x", "text/plain")


async def test_s3_storage_roundtrip():
    with mock_aws():
        boto3.client("s3", region_name="us-east-1").create_bucket(Bucket="resumes")
        storage = S3FileStorage(
            "resumes",
            endpoint_url=None,
            region="us-east-1",
            access_key_id="test",
            secret_access_key="test",
        )
        await storage.put("k/a.pdf", b"hello", "application/pdf")
        assert await storage.get("k/a.pdf") == b"hello"
        await storage.delete("k/a.pdf")
        with pytest.raises(StorageError):
            await storage.get("k/a.pdf")
