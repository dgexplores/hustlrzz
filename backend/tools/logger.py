"""Structured logging + audit trail helpers.

Security-relevant events (auth, data mutations) are written to a dedicated
"audit" logger as JSON lines so they can be correlated (via request_id) and
shipped to log aggregation if desired.
"""

import json
import logging
import sys
from typing import Any, Dict, Optional

_AUDIT_LOGGER_NAME = "hustlrzz.audit"

_handler_configured = False


def _configure() -> None:
    global _handler_configured
    if _handler_configured:
        return
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(
        logging.Formatter("%(asctime)s %(levelname)s %(name)s %(message)s")
    )
    root = logging.getLogger("hustlrzz")
    root.setLevel(logging.INFO)
    if not root.handlers:
        root.addHandler(handler)
    _handler_configured = True


_configure()


def get_logger(name: str) -> logging.Logger:
    """Get a namespaced application logger."""
    return logging.getLogger(f"hustlrzz.{name}")


def audit(
    event: str,
    request_id: Optional[str] = None,
    **fields: Any,
) -> None:
    """Write a JSON audit line.

    Args:
        event: Machine-readable event name, e.g. "auth.verify_success".
        request_id: Correlation id from the X-Request-ID header.
        fields: Arbitrary key/value context. Never pass secrets here.
    """
    payload: Dict[str, Any] = {"event": event, "request_id": request_id or "-"}
    payload.update(fields)
    logging.getLogger(_AUDIT_LOGGER_NAME).info(json.dumps(payload, default=str))
