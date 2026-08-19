"""
Persistent webhook queue for reliable alert processing.

Alertmanager sends resolved webhooks only once. If the backend is down,
the webhook is lost forever. This module provides a persistent queue
that survives backend restarts.

Usage:
    queue = WebhookQueue()
    queue.enqueue(alert_id, resolve_at)  # Save to disk
    queue.process_queue()  # Process pending items
"""

import asyncio
import json
import os
import glob
from datetime import datetime
from typing import Optional

DATA_DIR = os.environ.get("DATA_DIR", "./data")


class WebhookQueue:
    """Persistent queue for resolved alert processing."""
    
    def __init__(self, queue_dir: Optional[str] = None):
        self.queue_dir = queue_dir or os.path.join(DATA_DIR, "webhook_queue")
        os.makedirs(self.queue_dir, exist_ok=True)
    
    def _queue_file(self, alert_id: str) -> str:
        return os.path.join(self.queue_dir, f"{alert_id}.json")
    
    def enqueue(self, alert_id: str, resolve_at: str) -> None:
        """Add a resolve task to the queue."""
        item = {
            "alert_id": alert_id,
            "resolve_at": resolve_at,
            "enqueued_at": datetime.utcnow().isoformat() + "Z",
            "attempts": 0,
        }
        file_path = self._queue_file(alert_id)
        tmp_path = file_path + ".tmp"
        with open(tmp_path, "w") as f:
            json.dump(item, f)
        os.replace(tmp_path, file_path)
    
    def dequeue(self, alert_id: str) -> None:
        """Remove a completed task from the queue."""
        file_path = self._queue_file(alert_id)
        if os.path.exists(file_path):
            os.remove(file_path)
    
    def list_pending(self) -> list:
        """List all pending queue items."""
        items = []
        for file_path in glob.glob(os.path.join(self.queue_dir, "*.json")):
            try:
                with open(file_path, "r") as f:
                    item = json.load(f)
                    items.append(item)
            except (json.JSONDecodeError, IOError):
                # Corrupted file, remove it
                try:
                    os.remove(file_path)
                except OSError:
                    pass
        return items
    
    def increment_attempts(self, alert_id: str) -> int:
        """Increment attempt counter for a queue item. Returns new count."""
        file_path = self._queue_file(alert_id)
        try:
            with open(file_path, "r") as f:
                item = json.load(f)
            item["attempts"] = item.get("attempts", 0) + 1
            item["last_attempt"] = datetime.utcnow().isoformat() + "Z"
            tmp_path = file_path + ".tmp"
            with open(tmp_path, "w") as f:
                json.dump(item, f)
            os.replace(tmp_path, file_path)
            return item["attempts"]
        except (json.JSONDecodeError, IOError, KeyError):
            return 0


# Global queue instance
webhook_queue = WebhookQueue()