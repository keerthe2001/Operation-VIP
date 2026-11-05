class PipelineError(Exception):
    """A resume processing failure with a stable code and a user-facing message."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


UNSUPPORTED_TYPE = "UNSUPPORTED_FILE_TYPE"
TOO_LARGE = "FILE_TOO_LARGE"
EMPTY_FILE = "EMPTY_FILE"
CORRUPT = "CORRUPT_FILE"
PASSWORD_PROTECTED = "PASSWORD_PROTECTED"  # noqa: S105 (error code, not a secret)
NO_TEXT = "NO_TEXT_FOUND"
MALWARE = "MALWARE_DETECTED"
SCAN_UNAVAILABLE = "SCAN_UNAVAILABLE"
CONVERSION_FAILED = "CONVERSION_FAILED"
