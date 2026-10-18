"""
Folder management module.

Folders are stored as a separate JSON file (data/folders.json) so they
persist even when no alert rules reference them.

Each folder is an object: { "name": str, "silenced_until": str|null, "channels": list[str] }

The optional "channels" field holds notification channel IDs that alerts in
this folder inherit when the alert itself has no explicit channel list.
"""

import os
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone

from storage import storage


FOLDERS_FILE = "folders"
FOLDERS_KEY = "all"


def _load_folders_data() -> Dict[str, Any]:
    """Load the folders data from storage."""
    data = storage.get(FOLDERS_FILE, FOLDERS_KEY)
    if data is None:
        return {"folders": [], "updated_at": None}
    return data


def _save_folders_data(data: Dict[str, Any]) -> None:
    """Save the folders data to storage."""
    data["updated_at"] = datetime.now(timezone.utc).isoformat()
    storage.save(FOLDERS_FILE, FOLDERS_KEY, data)


def _migrate_legacy_folders(data: Dict[str, Any]) -> Dict[str, Any]:
    """Migrate old list-of-strings format to new object format."""
    folders = data.get("folders", [])
    if folders and isinstance(folders[0], str):
        # Old format: list of strings
        data["folders"] = [{"name": f, "silenced_until": None, "channels": []} for f in folders]
    return data


def _normalize_folder(folder: Dict[str, Any]) -> Dict[str, Any]:
    """Ensure a folder object has all expected keys (channels defaults to [])."""
    folder.setdefault("channels", [])
    if folder.get("channels") is None:
        folder["channels"] = []
    return folder


def list_folders() -> List[Dict[str, Any]]:
    """Return all folders as objects with name and silenced_until."""
    from main import storage as main_storage
    data = _load_folders_data()
    data = _migrate_legacy_folders(data)
    
    folders_from_list = [_normalize_folder(dict(f)) for f in data.get("folders", [])]
    # Also scan rules for any folders not in the list
    rules = main_storage.list("rules")
    folders_from_rules = set()
    for rule in rules:
        f = rule.get("folder")
        if f:
            folders_from_rules.add(f)
    
    # Build set of names already in list
    existing_names = {f["name"] for f in folders_from_list}
    
    # Add folders from rules that aren't in the list
    for name in sorted(folders_from_rules):
        if name not in existing_names:
            folders_from_list.append({"name": name, "silenced_until": None, "channels": []})
    
    return folders_from_list


def get_folder(name: str) -> Optional[Dict[str, Any]]:
    """Get a single folder by name."""
    folders = list_folders()
    for folder in folders:
        if folder["name"] == name:
            return folder
    return None


def create_folder(name: str) -> Dict[str, Any]:
    """Create a new folder. Returns the folder object."""
    name = name.strip()
    if not name:
        raise ValueError("Folder name cannot be empty")
    
    data = _load_folders_data()
    data = _migrate_legacy_folders(data)
    folders = data.get("folders", [])
    
    for f in folders:
        if f["name"] == name:
            raise ValueError(f"Folder '{name}' already exists")
    
    new_folder = {"name": name, "silenced_until": None, "channels": []}
    folders.append(new_folder)
    data["folders"] = folders
    _save_folders_data(data)
    return new_folder


def rename_folder(old_name: str, new_name: str) -> None:
    """Rename a folder in the list and in all rules."""
    old_name = old_name.strip()
    new_name = new_name.strip()
    if not old_name or not new_name:
        raise ValueError("Folder names cannot be empty")
    if old_name == new_name:
        return
    
    data = _load_folders_data()
    data = _migrate_legacy_folders(data)
    folders = data.get("folders", [])
    
    for f in folders:
        if f["name"] == old_name:
            f["name"] = new_name
            break
    
    data["folders"] = folders
    _save_folders_data(data)
    
    # Also update all rules
    from main import storage as main_storage
    rules = main_storage.list("rules")
    for rule in rules:
        if rule.get("folder") == old_name:
            rule["folder"] = new_name
            main_storage.save("rules", rule["id"], rule)


def delete_folder(name: str) -> None:
    """Delete a folder. Rules in this folder become uncategorized."""
    name = name.strip()
    if not name:
        raise ValueError("Folder name cannot be empty")
    
    data = _load_folders_data()
    data = _migrate_legacy_folders(data)
    folders = data.get("folders", [])
    
    folders = [f for f in folders if f["name"] != name]
    data["folders"] = folders
    _save_folders_data(data)
    
    # Move rules from this folder to uncategorized
    from main import storage as main_storage
    rules = main_storage.list("rules")
    for rule in rules:
        if rule.get("folder") == name:
            rule["folder"] = None
            main_storage.save("rules", rule["id"], rule)


def set_folder_silenced(name: str, silenced_until: Optional[str]) -> Dict[str, Any]:
    """Set or clear silenced_until for a folder."""
    name = name.strip()
    if not name:
        raise ValueError("Folder name cannot be empty")
    
    data = _load_folders_data()
    data = _migrate_legacy_folders(data)
    folders = data.get("folders", [])
    
    for f in folders:
        if f["name"] == name:
            f["silenced_until"] = silenced_until
            data["folders"] = folders
            _save_folders_data(data)
            return f
    
    # Folder not in list but exists in rules — add it
    new_folder = {"name": name, "silenced_until": silenced_until, "channels": []}
    folders.append(new_folder)
    data["folders"] = folders
    _save_folders_data(data)
    return new_folder


def get_folder_channels(name: str) -> List[str]:
    """Return the list of notification channel IDs assigned to a folder.

    Returns an empty list when the folder has no channels configured (or the
    folder does not exist).
    """
    folder = get_folder(name)
    if not folder:
        return []
    channels = folder.get("channels") or []
    return list(channels)


def set_folder_channels(name: str, channel_ids: List[str]) -> Dict[str, Any]:
    """Set the list of notification channel IDs for a folder.

    The folder is created on demand if it does not exist yet (mirrors how
    set_folder_silenced handles unknown folders). Returns the updated folder.
    """
    name = name.strip()
    if not name:
        raise ValueError("Folder name cannot be empty")

    if channel_ids is None:
        channel_ids = []
    # Deduplicate while preserving order
    seen = set()
    unique_ids: List[str] = []
    for cid in channel_ids:
        if cid and cid not in seen:
            seen.add(cid)
            unique_ids.append(cid)

    data = _load_folders_data()
    data = _migrate_legacy_folders(data)
    folders = [_normalize_folder(dict(f)) for f in data.get("folders", [])]

    for f in folders:
        if f["name"] == name:
            f["channels"] = unique_ids
            data["folders"] = folders
            _save_folders_data(data)
            return f

    # Folder not in list — add it
    new_folder = {"name": name, "silenced_until": None, "channels": unique_ids}
    folders.append(new_folder)
    data["folders"] = folders
    _save_folders_data(data)
    return new_folder


def remove_channel_from_all_folders(channel_id: str) -> int:
    """Remove a channel ID from every folder that references it.

    Called when a notification channel is deleted so folders don't keep
    dangling references. Returns the number of folders updated.
    """
    data = _load_folders_data()
    data = _migrate_legacy_folders(data)
    folders = [_normalize_folder(dict(f)) for f in data.get("folders", [])]

    updated = 0
    for f in folders:
        if channel_id in f["channels"]:
            f["channels"] = [c for c in f["channels"] if c != channel_id]
            updated += 1

    if updated > 0:
        data["folders"] = folders
        _save_folders_data(data)
    return updated


def is_folder_silenced(name: str) -> bool:
    """Check if a folder is currently silenced."""
    if not name:
        return False
    folder = get_folder(name)
    if not folder:
        return False
    silenced_until = folder.get("silenced_until")
    if not silenced_until:
        return False
    try:
        # Parse silenced_until (offset-aware with 'Z')
        dt = datetime.fromisoformat(silenced_until.replace("Z", "+00:00"))
        return datetime.now(timezone.utc) < dt
    except (ValueError, TypeError):
        return False