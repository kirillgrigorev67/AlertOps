import hashlib
import json
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, Optional

from config import settings


class DiagnosisCache:
    """File-based cache for LLM diagnosis results.
    
    Cache key: fingerprint + hash of log sample.
    This ensures identical alerts with identical logs get cached results.
    """
    
    def __init__(self):
        self.cache_dir = Path(settings.data_dir) / "diagnosis_cache"
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.ttl_hours = 24  # Cache entries valid for 24 hours
    
    def _make_key(self, fingerprint: str, logs: str) -> str:
        """Create cache key from fingerprint + log hash."""
        log_hash = hashlib.sha256(logs.encode("utf-8")).hexdigest()[:16]
        return f"{fingerprint}_{log_hash}"
    
    def _cache_path(self, key: str) -> Path:
        return self.cache_dir / f"{key}.json"
    
    def get(self, fingerprint: str, logs: str) -> Optional[Dict[str, Any]]:
        """Get cached diagnosis if exists and not expired."""
        key = self._make_key(fingerprint, logs)
        path = self._cache_path(key)
        
        if not path.exists():
            return None
        
        try:
            with open(path, "r", encoding="utf-8") as f:
                entry = json.load(f)
            
            # Check TTL
            created_at = datetime.fromisoformat(entry["created_at"])
            if datetime.utcnow() - created_at > timedelta(hours=self.ttl_hours):
                # Expired
                path.unlink(missing_ok=True)
                return None
            
            return entry
            
        except (json.JSONDecodeError, KeyError, ValueError):
            # Corrupted cache entry
            path.unlink(missing_ok=True)
            return None
    
    def set(self, fingerprint: str, logs: str, diagnosis: str) -> None:
        """Store diagnosis result in cache."""
        key = self._make_key(fingerprint, logs)
        path = self._cache_path(key)
        
        entry = {
            "fingerprint": fingerprint,
            "log_hash": hashlib.sha256(logs.encode("utf-8")).hexdigest()[:16],
            "diagnosis": diagnosis,
            "created_at": datetime.utcnow().isoformat(),
            "expires_at": (datetime.utcnow() + timedelta(hours=self.ttl_hours)).isoformat(),
        }
        
        with open(path, "w", encoding="utf-8") as f:
            json.dump(entry, f, ensure_ascii=False, indent=2)
    
    def cleanup_expired(self) -> int:
        """Remove expired cache entries. Returns count of removed entries."""
        removed = 0
        for path in self.cache_dir.glob("*.json"):
            try:
                with open(path, "r", encoding="utf-8") as f:
                    entry = json.load(f)
                
                created_at = datetime.fromisoformat(entry["created_at"])
                if datetime.utcnow() - created_at > timedelta(hours=self.ttl_hours):
                    path.unlink()
                    removed += 1
            except Exception:
                # Remove corrupted entries
                path.unlink(missing_ok=True)
                removed += 1
        
        return removed
    
    def get_stats(self) -> Dict[str, Any]:
        """Return cache statistics."""
        entries = list(self.cache_dir.glob("*.json"))
        total_size = sum(f.stat().st_size for f in entries)
        
        return {
            "entries_count": len(entries),
            "total_size_bytes": total_size,
            "ttl_hours": self.ttl_hours,
            "cache_dir": str(self.cache_dir),
        }


diagnosis_cache = DiagnosisCache()