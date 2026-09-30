#!/usr/bin/env bash
# Starts the machine's PostgreSQL cluster on the local Supabase port for sessions without Docker,
# such as Claude Code cloud sessions. Browser checks and previews create their own databases in it.
set -euo pipefail

url=postgresql://postgres:postgres@127.0.0.1:55432/postgres
if psql "$url" -qtAc 'select 1' >/dev/null 2>&1; then
  echo "PostgreSQL already running at $url"
  exit 0
fi
command -v pg_lsclusters >/dev/null || {
  echo "No PostgreSQL cluster tools found; run pnpm db:start instead" >&2
  exit 1
}
read -r version cluster _ < <(pg_lsclusters --no-header | head -n 1)
conf=/etc/postgresql/$version/$cluster/postgresql.conf
sed -i 's/^#\?port = .*/port = 55432/' "$conf"
pg_ctlcluster "$version" "$cluster" restart
su postgres -c "psql -p 55432 -qc \"alter user postgres password 'postgres'\""
# Supabase provides these roles; the migrations grant against them.
psql "$url" -qc "do \$\$ begin
  if not exists (select from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
end \$\$"
echo "PostgreSQL $version running at $url"
