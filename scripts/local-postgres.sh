#!/usr/bin/env bash
# Starts/stops a throwaway local PostgreSQL for running the database tests and
# trying the production store without Supabase.
#   scripts/local-postgres.sh start   → listens on 127.0.0.1:54329, db "ddc_test"
#   scripts/local-postgres.sh stop
# Then: export TEST_DATABASE_URL=postgres://postgres@127.0.0.1:54329/ddc_test
# Requires PostgreSQL server binaries (e.g. `apt install postgresql`).
set -euo pipefail

PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
PGDATA="${PGDATA:-/var/tmp/ddc-pgdata}"
PGPORT="${PGPORT:-54329}"
DBNAME="${DBNAME:-ddc_test}"

run() { # run a command as the postgres OS user when we are root
  if [ "$(id -u)" = "0" ]; then su postgres -c "$*"; else bash -c "$*"; fi
}

case "${1:-}" in
  start)
    if [ ! -d "$PGDATA/base" ]; then
      mkdir -p "$PGDATA"; [ "$(id -u)" = "0" ] && chown postgres:postgres "$PGDATA"
      run "'$PGBIN/initdb' -D '$PGDATA' -U postgres --auth=trust >/dev/null"
    fi
    run "'$PGBIN/pg_ctl' -D '$PGDATA' -o '-p $PGPORT -k /tmp -c listen_addresses=127.0.0.1' -l '$PGDATA/server.log' -w start" || true
    run "'$PGBIN/psql' -h 127.0.0.1 -p $PGPORT -U postgres -tc \"select 1 from pg_database where datname='$DBNAME'\" postgres | grep -q 1 || '$PGBIN/createdb' -h 127.0.0.1 -p $PGPORT -U postgres '$DBNAME'"
    echo "postgres://postgres@127.0.0.1:$PGPORT/$DBNAME"
    ;;
  stop)
    run "'$PGBIN/pg_ctl' -D '$PGDATA' -m fast stop" || true
    ;;
  *)
    echo "usage: $0 start|stop" >&2; exit 2;;
esac
