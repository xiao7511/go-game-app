-- Same role initialization as official Supabase Compose; values stay in container environment.
\set pgpass `echo "$POSTGRES_PASSWORD"`
alter user authenticator with password :'pgpass';
alter user supabase_auth_admin with password :'pgpass';
alter user supabase_admin with password :'pgpass';
