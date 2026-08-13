import json
import os
import tarfile
from datetime import datetime, timedelta
from pathlib import Path
from typing import List, Dict

from config import settings


class CleanupService:
    def __init__(self):
        self.data_dir = Path(settings.data_dir)
        self.history_dir = self.data_dir / "alerts" / "history"
        self.archive_dir = self.data_dir / "alerts" / "archives"
        self.logs: List[Dict] = []
    
    def _log(self, message: str, level: str = "info") -> None:
        """Log a cleanup operation."""
        entry = {
            "timestamp": datetime.utcnow().isoformat(),
            "message": message,
            "level": level,
        }
        self.logs.append(entry)
        print(f"[Cleanup {level.upper()}] {message}")
    
    def get_logs(self, limit: int = 100) -> List[Dict]:
        """Return recent cleanup logs."""
        return self.logs[-limit:]
    
    def run_cleanup(self, dry_run: bool = False) -> Dict:
        """
        Run cleanup of old alert history.
        
        Args:
            dry_run: If True, only report what would be done without actually doing it.
        
        Returns:
            Dict with cleanup results.
        """
        retention_days = settings.alert_history_retention_days
        action = settings.alert_history_cleanup_action
        
        cutoff_date = datetime.utcnow() - timedelta(days=retention_days)
        
        self._log(
            f"Starting cleanup: retention={retention_days} days, action={action}, "
            f"cutoff={cutoff_date.isoformat()}, dry_run={dry_run}"
        )
        
        if not self.history_dir.exists():
            self._log("History directory does not exist, nothing to clean", "warning")
            return {
                "dry_run": dry_run,
                "retention_days": retention_days,
                "action": action,
                "cutoff_date": cutoff_date.isoformat(),
                "processed": 0,
                "deleted": 0,
                "archived": 0,
                "errors": 0,
                "logs": self.get_logs(),
            }
        
        processed = 0
        deleted = 0
        archived = 0
        errors = 0
        
        for filepath in self.history_dir.glob("*.json"):
            try:
                with open(filepath, "r", encoding="utf-8") as f:
                    alert = json.load(f)
                
                # Get the alert's end time (when it was resolved)
                ends_at = alert.get("ends_at") or alert.get("updated_at")
                if not ends_at:
                    self._log(f"Skipping {filepath.name}: no ends_at timestamp", "warning")
                    continue
                
                try:
                    alert_date = datetime.fromisoformat(ends_at)
                except (ValueError, TypeError):
                    self._log(f"Skipping {filepath.name}: invalid date format", "warning")
                    continue
                
                if alert_date < cutoff_date:
                    processed += 1
                    
                    if dry_run:
                        self._log(f"Would process {filepath.name} (date: {ends_at})")
                        continue
                    
                    if action == "archive":
                        # Archive to tar.gz
                        self.archive_dir.mkdir(parents=True, exist_ok=True)
                        archive_name = f"alerts_{datetime.utcnow().strftime('%Y%m%d')}.tar.gz"
                        archive_path = self.archive_dir / archive_name
                        
                        with tarfile.open(archive_path, "a:gz") as tar:
                            tar.add(filepath, arcname=filepath.name)
                        
                        filepath.unlink()
                        archived += 1
                        self._log(f"Archived {filepath.name} to {archive_name}")
                    
                    else:  # delete
                        filepath.unlink()
                        deleted += 1
                        self._log(f"Deleted {filepath.name} (date: {ends_at})")
                        
            except Exception as e:
                errors += 1
                self._log(f"Error processing {filepath.name}: {e}", "error")
        
        result = {
            "dry_run": dry_run,
            "retention_days": retention_days,
            "action": action,
            "cutoff_date": cutoff_date.isoformat(),
            "processed": processed,
            "deleted": deleted,
            "archived": archived,
            "errors": errors,
            "logs": self.get_logs(),
        }
        
        self._log(
            f"Cleanup complete: {processed} processed, {deleted} deleted, "
            f"{archived} archived, {errors} errors"
        )
        
        return result
    
    def get_archive_info(self) -> Dict:
        """Return information about existing archives."""
        if not self.archive_dir.exists():
            return {"archives": [], "total_size_bytes": 0}
        
        archives = []
        total_size = 0
        
        for archive in sorted(self.archive_dir.glob("*.tar.gz")):
            size = archive.stat().st_size
            total_size += size
            archives.append({
                "name": archive.name,
                "size_bytes": size,
                "created": datetime.fromtimestamp(archive.stat().st_mtime).isoformat(),
            })
        
        return {
            "archives": archives,
            "total_size_bytes": total_size,
            "archive_dir": str(self.archive_dir),
        }


cleanup_service = CleanupService()