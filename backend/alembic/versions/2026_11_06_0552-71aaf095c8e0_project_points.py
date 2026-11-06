"""project points

Revision ID: 71aaf095c8e0
Revises: b35f6afd2dc8
Create Date: 2026-11-06 05:52:30.486254

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = '71aaf095c8e0'
down_revision: Union[str, Sequence[str], None] = 'b35f6afd2dc8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Projects keep a list of points instead of description/technologies/outcomes."""
    op.add_column(
        "projects",
        sa.Column("points", postgresql.ARRAY(sa.Text()), nullable=False, server_default="{}"),
    )
    # Existing data: the description becomes the first point, outcomes follow.
    op.execute(
        """
        UPDATE projects
        SET points = array_remove(ARRAY[NULLIF(trim(description), '')], NULL)
                     || COALESCE(outcomes, '{}')
        """
    )
    op.alter_column("projects", "points", server_default=None)
    op.drop_column("projects", "description")
    op.drop_column("projects", "technologies")
    op.drop_column("projects", "outcomes")


def downgrade() -> None:
    op.add_column("projects", sa.Column("description", sa.Text(), nullable=True))
    op.add_column(
        "projects",
        sa.Column("technologies", postgresql.ARRAY(sa.Text()), nullable=False, server_default="{}"),
    )
    op.add_column(
        "projects",
        sa.Column("outcomes", postgresql.ARRAY(sa.Text()), nullable=False, server_default="{}"),
    )
    op.execute("UPDATE projects SET description = array_to_string(points, E'\\n')")
    op.drop_column("projects", "points")
