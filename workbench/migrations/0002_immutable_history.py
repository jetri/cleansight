"""Application-history guards, not a production tamper-evident audit boundary."""
from django.db import migrations

TABLES = ["configuration", "epoch", "coveragegap", "segment", "processingrun", "fixtureevent", "transition", "review"]
FUNCTION = """
CREATE FUNCTION reject_history_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Historical record cannot be rewritten' USING ERRCODE='23514'; END;
$$;
"""
FORWARD = FUNCTION + "\n".join(f"CREATE TRIGGER immutable_history BEFORE UPDATE OR DELETE ON workbench_{name} FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();" for name in TABLES)
REVERSE = "\n".join(f"DROP TRIGGER immutable_history ON workbench_{name};" for name in TABLES) + "\nDROP FUNCTION reject_history_mutation();"


class Migration(migrations.Migration):
    dependencies = [("workbench", "0001_initial")]
    operations = [migrations.RunSQL(FORWARD, REVERSE)]
