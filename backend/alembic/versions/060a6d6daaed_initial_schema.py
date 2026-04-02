"""initial schema baseline

Revision ID: 060a6d6daaed
Revises:
Create Date: 2026-04-02 04:13:41.326480

This is a baseline migration representing the existing database schema.
All tables already exist, so upgrade/downgrade are intentionally empty.
This revision is stamped (not executed) via: alembic stamp head
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '060a6d6daaed'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Baseline: all tables already exist in the database.
    # This migration is stamped, not executed.
    pass


def downgrade() -> None:
    # Baseline: nothing to downgrade.
    pass
