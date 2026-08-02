import sqlite3
from pathlib import Path

from migrations.add_venmo_username import run_migration


def test_venmo_migration_adds_column_and_is_idempotent(tmp_path):
    db_path = tmp_path / "splitwiser.sqlite3"
    with sqlite3.connect(db_path) as connection:
        connection.execute("CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT)")

    run_migration(str(db_path))
    run_migration(str(db_path))

    with sqlite3.connect(db_path) as connection:
        columns = {
            row[1]: row
            for row in connection.execute("PRAGMA table_info(users)").fetchall()
        }

    assert "venmo_username" in columns
    assert columns["venmo_username"][3] == 0


def test_startup_runs_venmo_migration():
    start_script = Path(__file__).parents[2] / "start.sh"

    assert (
        'python migrations/add_venmo_username.py --db-path "$DATABASE_PATH"'
        in start_script.read_text()
    )
