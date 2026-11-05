from app.core.config import Settings
from app.storage.base import FileStorage
from app.storage.local import LocalFileStorage
from app.storage.s3 import S3FileStorage


def create_storage(settings: Settings) -> FileStorage:
    if settings.storage_backend == "s3":
        return S3FileStorage(
            settings.s3_bucket,
            endpoint_url=settings.s3_endpoint_url,
            region=settings.s3_region,
            access_key_id=settings.s3_access_key_id,
            secret_access_key=settings.s3_secret_access_key,
        )
    return LocalFileStorage(settings.storage_local_root)
