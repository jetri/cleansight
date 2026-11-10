-- Official-image first-initialization hook. No embedded credentials or secret argv.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'littering_app') THEN
    CREATE ROLE littering_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE;
  END IF;
  EXECUTE format('ALTER ROLE littering_app PASSWORD %L',
    rtrim(pg_read_file('/run/secrets/db_app'), E'\r\n'));

END;
$$;
GRANT CONNECT ON DATABASE littering TO littering_app;
GRANT USAGE, CREATE ON SCHEMA public TO littering_app;
