import json
import os
import fcntl
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional


class FileStorage:
    def __init__(self, base_dir: str):
        self.base_dir = Path(base_dir)
        self.base_dir.mkdir(parents=True, exist_ok=True)
        self._index: Dict[str, Dict] = {}
        self._index_loaded = False

    def _atomic_write(self, filepath: Path, data: Dict) -> None:
        tmp_path = filepath.with_suffix(".tmp")
        with open(tmp_path, "w", encoding="utf-8") as f:
            fcntl.flock(f.fileno(), fcntl.LOCK_EX)
            json.dump(data, f, ensure_ascii=False, indent=2)
            f.flush()
            os.fsync(f.fileno())
            fcntl.flock(f.fileno(), fcntl.LOCK_UN)
        os.replace(tmp_path, filepath)

    def _read_json(self, filepath: Path) -> Optional[Dict]:
        if not filepath.exists():
            return None
        with open(filepath, "r", encoding="utf-8") as f:
            fcntl.flock(f.fileno(), fcntl.LOCK_SH)
            try:
                data = json.load(f)
            finally:
                fcntl.flock(f.fileno(), fcntl.LOCK_UN)
            return data

    def save(self, subdir: str, obj_id: str, data: Dict) -> None:
        dir_path = self.base_dir / subdir
        dir_path.mkdir(parents=True, exist_ok=True)
        filepath = dir_path / f"{obj_id}.json"
        self._atomic_write(filepath, data)
        self._index[obj_id] = data

    def get(self, subdir: str, obj_id: str) -> Optional[Dict]:
        filepath = self.base_dir / subdir / f"{obj_id}.json"
        return self._read_json(filepath)

    def delete(self, subdir: str, obj_id: str) -> bool:
        filepath = self.base_dir / subdir / f"{obj_id}.json"
        if filepath.exists():
            filepath.unlink()
            self._index.pop(obj_id, None)
            return True
        return False

    def list(self, subdir: str) -> List[Dict]:
        dir_path = self.base_dir / subdir
        if not dir_path.exists():
            return []
        results = []
        for f in sorted(dir_path.glob("*.json")):
            data = self._read_json(f)
            if data:
                results.append(data)
        return results

    def search(self, subdir: str, query: str, fields: List[str]) -> List[Dict]:
        items = self.list(subdir)
        query_lower = query.lower()
        results = []
        for item in items:
            for field in fields:
                value = item.get(field, "")
                if isinstance(value, str) and query_lower in value.lower():
                    results.append(item)
                    break
        return results

    def filter_by_date_range(
        self, subdir: str, field: str, start: Optional[datetime], end: Optional[datetime]
    ) -> List[Dict]:
        items = self.list(subdir)
        results = []
        for item in items:
            value = item.get(field)
            if not value:
                continue
            try:
                dt = datetime.fromisoformat(value)
                if start and dt < start:
                    continue
                if end and dt > end:
                    continue
                results.append(item)
            except (ValueError, TypeError):
                continue
        return results


storage = FileStorage(os.environ.get("DATA_DIR", "/app/data"))