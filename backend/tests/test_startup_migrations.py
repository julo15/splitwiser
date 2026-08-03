import sqlite3
from pathlib import Path

from migrations.add_tab_participant_name_uniqueness import migrate as migrate_tab_names
from migrations.add_venmo_username import run_migration


def _tab_participants_db(path, rows):
    with sqlite3.connect(path) as connection:
        connection.execute(
            """
            CREATE TABLE tab_participants (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                tab_id INTEGER NOT NULL,
                display_name VARCHAR NOT NULL,
                user_id INTEGER,
                claim_token VARCHAR NOT NULL UNIQUE,
                joined_at DATETIME NOT NULL
            )
            """
        )
        connection.executemany(
            "INSERT INTO tab_participants (tab_id, display_name, claim_token, joined_at)"
            " VALUES (?, ?, ?, '2026-01-01')",
            rows,
        )


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


def test_tab_name_migration_clears_duplicates_and_is_idempotent(tmp_path):
    db_path = tmp_path / "splitwiser.sqlite3"
    _tab_participants_db(
        db_path,
        [
            # One tab that already carries the bug: three rows, one person.
            (1, "Maya", "t1"),
            (1, "maya", "t2"),
            (1, " Maya ", "t3"),
            (1, "Sam", "t4"),
            # A different tab is allowed its own Maya.
            (2, "Maya", "t5"),
        ],
    )

    assert migrate_tab_names(str(db_path)) == 0
    assert migrate_tab_names(str(db_path)) == 0

    with sqlite3.connect(db_path) as connection:
        names = dict(
            connection.execute("SELECT claim_token, display_name FROM tab_participants")
        )
        indexes = {
            row[0]
            for row in connection.execute(
                "SELECT name FROM sqlite_master WHERE type='index'"
            )
        }

    # The earliest row keeps its name; later ones are made distinct rather than
    # merged, since they may hold claims that are genuinely someone else's, and
    # they keep the capitalization they were typed with.
    assert names["t1"] == "Maya"
    assert names["t2"] == "maya (2)"
    assert names["t3"] == "Maya (3)"
    assert names["t4"] == "Sam"
    assert names["t5"] == "Maya"
    assert "ux_tab_participants_tab_name" in indexes

    # And the index now holds the line.
    with sqlite3.connect(db_path) as connection:
        try:
            connection.execute(
                "INSERT INTO tab_participants (tab_id, display_name, claim_token,"
                " joined_at) VALUES (1, 'MAYA', 't6', '2026-01-01')"
            )
        except sqlite3.IntegrityError:
            pass
        else:
            raise AssertionError("a duplicate name was accepted")


def test_tab_name_migration_on_a_database_without_tabs(tmp_path):
    """The tables are created by init_db, which may not have run yet."""
    db_path = tmp_path / "splitwiser.sqlite3"
    with sqlite3.connect(db_path) as connection:
        connection.execute("CREATE TABLE users (id INTEGER PRIMARY KEY)")

    assert migrate_tab_names(str(db_path)) == 0


def test_startup_runs_tab_name_migration():
    start_script = Path(__file__).parents[2] / "start.sh"

    assert (
        'python migrations/add_tab_participant_name_uniqueness.py'
        ' --db-path "$DATABASE_PATH"' in start_script.read_text()
    )
