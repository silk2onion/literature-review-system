"""
Alembic env.py - configured for the Literature Review System.

Imports the SQLAlchemy Base and all models so that autogenerate
can detect schema changes.
"""
import sys
from logging.config import fileConfig
from pathlib import Path

from sqlalchemy import engine_from_config
from sqlalchemy import pool

from alembic import context

# ---------- sys.path setup ----------
# Ensure the backend directory is on sys.path so that `app.*` imports work
# regardless of where the alembic CLI is invoked from.
BACKEND_DIR = str(Path(__file__).resolve().parents[1])
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

# ---------- Import app models & metadata ----------
from app.database import Base  # noqa: E402
from app.config import settings  # noqa: E402

# Import all models so Base.metadata is fully populated
from app.models import (  # noqa: E402, F401
    Paper,
    Review,
    ReviewPaper,
    CrawlJob,
    StagingPaper,
    Tag,
    TagGroup,
    PaperTag,
    TagGroupTag,
    PaperCitation,
    RecallLog,
    PaperGroup,
    PaperGroupAssociation,
    PipelineTask,
    ApiUsageLog,
    PaperChunk,
    SystemSetting,
)

# ---------- Alembic Config ----------
config = context.config

# Override sqlalchemy.url from the application settings so we always
# point at the same database the app uses.
config.set_main_option("sqlalchemy.url", settings.DATABASE_URL)

# Interpret the config file for Python logging.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# This is the MetaData object for autogenerate support
target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode.

    Configures the context with just a URL and not an Engine.
    Calls to context.execute() emit the given string to the script output.
    """
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        render_as_batch=True,  # Required for SQLite ALTER TABLE support
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode.

    Creates an Engine and associates a connection with the context.
    """
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            render_as_batch=True,  # Required for SQLite ALTER TABLE support
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
