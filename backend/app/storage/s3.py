import asyncio
from typing import Any

import boto3
from botocore.exceptions import BotoCoreError, ClientError

from app.storage.base import StorageError


class S3FileStorage:
    """Stores objects in an S3-compatible bucket (AWS S3, MinIO, Garage, R2, ...)."""

    def __init__(
        self,
        bucket: str,
        *,
        endpoint_url: str | None,
        region: str,
        access_key_id: str | None,
        secret_access_key: str | None,
    ) -> None:
        self.bucket = bucket
        self.client: Any = boto3.client(
            "s3",
            endpoint_url=endpoint_url,
            region_name=region,
            aws_access_key_id=access_key_id,
            aws_secret_access_key=secret_access_key,
        )

    async def put(self, key: str, data: bytes, content_type: str) -> None:
        try:
            await asyncio.to_thread(
                self.client.put_object,
                Bucket=self.bucket,
                Key=key,
                Body=data,
                ContentType=content_type,
                ServerSideEncryption="AES256",
            )
        except (BotoCoreError, ClientError) as exc:
            raise StorageError("Could not store the file") from exc

    async def get(self, key: str) -> bytes:
        try:
            response = await asyncio.to_thread(self.client.get_object, Bucket=self.bucket, Key=key)
            body: bytes = await asyncio.to_thread(response["Body"].read)
            return body
        except (BotoCoreError, ClientError) as exc:
            raise StorageError(f"Could not read object {key}") from exc

    async def delete(self, key: str) -> None:
        try:
            await asyncio.to_thread(self.client.delete_object, Bucket=self.bucket, Key=key)
        except (BotoCoreError, ClientError) as exc:
            raise StorageError(f"Could not delete object {key}") from exc
