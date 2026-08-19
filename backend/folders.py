"""
Folder management module.

Folders are stored as a separate JSON file (data/folders.json) so they
persist even when no alert rules reference them.
"""

import os
from typing import List, Optional
from datetime import datetime, timezone

from storage import storage


FOLDERS_FILE = "folders"
FOLDERS_KEY = "all"


def _load_folders_list() -> List[str]:
    """Load the list of folder names from storage."""
    data = storage.get(FOLDERS_FILE, FOLDERS_KEY)
    if data is None:
        return []
    folders = data.get("folders", [])
    return [f for f in folders if isinstance(f, str)]


def _save_folders_list(folders: List[str]) -> None:
    """Save the list of folder names to storage."""
    storage.save(FOLDERS_FILE, FOLDERS_KEY, {
        "folders": sorted(set(folders)),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    })


def list_folders() -> List[str]:
    """Return all folder names, including those referenced by rules."""
    from main import storage as main_storage
    folders_from_list = _load_folders_list()
    # Also scan rules for any folders not in the list
    rules = main_storage.list("rules")
    folders_from_rules = set()
    for rule in rules:
        f = rule.get("folder")
        if f:
            folders_from_rules.add(f)
    all_folders = sorted(set(folders_from_list) | folders_from_rules)
    return all_folders


def create_folder(name: str) -> str:
    """Create a new folder. Returns the folder name."""
    name = name.strip()
    if not name:
        raise ValueError("Folder name cannot be empty")
    folders = _load_folders_list()
    if name in folders:
        raise ValueError(f"Folder '{name}' already exists")
    folders.append(name)
    _save_folders_list(folders)
    return name


def rename_folder(old_name: str, new_name: str) -> None:
    """Rename a folder in the list and in all rules."""
    old_name = old_name.strip()
    new_name = new_name.strip()
    if not old_name or not new_name:
        raise ValueError("Folder names cannot be empty")
    if old_name == new_name:
        return
    
    folders = _load_folders_list()
    if old_name in folders:
        folders = [f for f in folders if f != old_name]
        if new_name not in folders:
            folders.append(new_name)
        _save_folders_list(folders)
    
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
    
    folders = _load_folders_list()
    if name in folders:
        folders = [f for f in folders if f != name]
        _save_folders_list(folders)
    
    # Move rules from this folder to uncategorized
    from main import storage as main_storage
    rules = main_storage.list("rules")
    for rule in rules:
        if rule.get("folder") == name:
            rule["folder"] = None
            main_storage.save("rules", rule["id"], rule)