#!/bin/bash
set -e

psql -v ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" \
  -v api_password="$API_ROLE_PASSWORD" \
  -v auth_password="$AUTH_ROLE_PASSWORD" \
  -v admin_password="$ADMIN_ROLE_PASSWORD" <<'EOSQL'
CREATE ROLE api_role WITH LOGIN PASSWORD :'api_password';
CREATE ROLE auth_role WITH LOGIN PASSWORD :'auth_password';
CREATE ROLE admin_role WITH LOGIN PASSWORD :'admin_password' BYPASSRLS;
EOSQL