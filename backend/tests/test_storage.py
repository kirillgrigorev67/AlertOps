import pytest
import tempfile
import shutil
from pathlib import Path
from storage import FileStorage


@pytest.fixture
def temp_storage():
    temp_dir = tempfile.mkdtemp()
    storage = FileStorage(temp_dir)
    yield storage
    shutil.rmtree(temp_dir)


def test_save_and_get(temp_storage):
    data = {"id": "test1", "name": "Test"}
    temp_storage.save("test", "test1", data)
    
    result = temp_storage.get("test", "test1")
    assert result == data


def test_list(temp_storage):
    temp_storage.save("test", "item1", {"id": "item1"})
    temp_storage.save("test", "item2", {"id": "item2"})
    
    results = temp_storage.list("test")
    assert len(results) == 2


def test_delete(temp_storage):
    temp_storage.save("test", "del1", {"id": "del1"})
    assert temp_storage.delete("test", "del1") is True
    assert temp_storage.get("test", "del1") is None


def test_search(temp_storage):
    temp_storage.save("test", "s1", {"name": "hello world", "desc": "foo"})
    temp_storage.save("test", "s2", {"name": "goodbye", "desc": "bar"})
    
    results = temp_storage.search("test", "hello", ["name", "desc"])
    assert len(results) == 1
    assert results[0]["name"] == "hello world"