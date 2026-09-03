from abc import ABC, abstractmethod
from typing import Any, Dict


class BaseNotifier(ABC):
    """Abstract interface for notification channels."""

    def __init__(self, config: Dict[str, Any]):
        self.config = config

    @abstractmethod
    async def send(self, alert: Dict[str, Any]) -> bool:
        """
        Send a notification for the given alert.

        Args:
            alert: Alert dictionary with keys like alertname, status, severity,
                   description, labels, starts_at, diagnosis, etc.

        Returns:
            True if notification was sent successfully, False otherwise.
        """
        pass

    @property
    @abstractmethod
    def channel_type(self) -> str:
        """Return the channel type identifier (e.g., 'telegram', 'webhook')."""
        pass