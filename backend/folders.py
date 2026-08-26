"""
Folder management module.

Folders are stored as a separate JSON file (data/folders.json) so they
persist even when no alert rules reference them.

Each folder is now an object: { "name": str, "silenced_until": str|null }
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
        data["folders"] = [{"name": f, "silenced_until": None} for f in folders]
    return data


def list_folders() -> List[Dict[str, Any]]:
    """Return all folders as objects with name and silenced_until."""
    from main import storage as main_storage
    data = _load_folders_data()
    data = _migrate_legacy_folders(data)
    
    folders_from_list = data.get("folders", [])
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
            folders_from_list.append({"name": name, "silenced_until": None})
    
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
    
    new_folder = {"name": name, "silenced_until": None}
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
    new_folder = {"name": name, "silenced_until": silenced_until}
    folders.append(new_folder)
    data["folders"] = folders
    _save_folders_data(data)
    return new_folder


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