# Staging API

The staging API runs on the staging VM with its own database and test data only. Never copy production data or secrets here.

It is deployed by `.github/workflows/deploy.yml` (every push to `main`) through [Campus-Motion/deploy](https://github.com/Campus-Motion/deploy).

## One-time setup (admin of the staging VM, as root)

1. Create the site:

   ```bash
   ./add-site.sh
   ```

   Answers: site `api`, repository `Back_End_App`, port `3000`, domain `api.staging.campusmotion.ch`, TLS `internal`.

2. Replace the generated compose file with [docker-compose.yml](docker-compose.yml), keeping the host port add-site.sh picked, and copy the database setup:

   ```bash
   git clone --depth 1 https://github.com/Campus-Motion/Back_End_App.git /tmp/back-end
   cd /srv/sites/api
   port=$(grep -oE '127\.0\.0\.1:[0-9]+' docker-compose.yml | cut -d: -f2)
   sed "s/127.0.0.1:8101/127.0.0.1:$port/" /tmp/back-end/deploy/staging/docker-compose.yml > docker-compose.yml
   rm -rf initdb && cp -r /tmp/back-end/initdb initdb
   chown -R github-deploy:github-deploy docker-compose.yml initdb
   rm -rf /tmp/back-end
   ```

3. Generate staging-only passwords and write the two settings files:

   ```bash
   pw() { openssl rand -hex 24; }
   POSTGRES_PASSWORD=$(pw) API=$(pw) AUTH=$(pw) ADMIN=$(pw) AUDIT=$(pw)
   sudo -u github-deploy tee /srv/sites/api/db.env > /dev/null <<EOF
   POSTGRES_USER=postgres
   POSTGRES_PASSWORD=$POSTGRES_PASSWORD
   POSTGRES_DB=campus_motion
   API_ROLE_PASSWORD=$API
   AUTH_ROLE_PASSWORD=$AUTH
   ADMIN_ROLE_PASSWORD=$ADMIN
   SECURE_AUDIT_PASSWORD=$AUDIT
   EOF
   sudo -u github-deploy tee /srv/sites/api/app.env > /dev/null <<EOF
   API_DB_URL=postgres://api_role:$API@db:5432/campus_motion
   AUTH_DB_URL=postgres://auth_role:$AUTH@db:5432/campus_motion
   ADMIN_DB_URL=postgres://admin_role:$ADMIN@db:5432/campus_motion
   AUDIT_DB_URL=postgres://audit_writer:$AUDIT@db:5432/campus_motion
   JWT_SECRET=$(openssl rand -hex 32)
   CORS_ORIGINS=https://admin.staging.campusmotion.ch
   EOF
   ```

4. Start the database on its own and check it. `docker compose` needs `IMAGE_TAG`, which `cm-deploy` writes to `.env` on every deploy; until the first deploy, write a placeholder (`sudo -E` is not allowed on the VM):

   ```bash
   cd /srv/sites/api
   echo "IMAGE_TAG=none" | sudo -u github-deploy tee .env > /dev/null
   sudo -u github-deploy docker compose up -d db
   sudo -u github-deploy docker compose exec db psql -U postgres -d campus_motion -c '\du'
   ```

   The list must show `api_role`, `auth_role`, `admin_role` and `audit_writer`.

5. At Hostinger, add an A record `api.staging` pointing to the staging VM.

The first push to `main` (or a re-run of the last Deploy run) then starts the API.

## Test accounts

The seed users in `initdb` have placeholder passwords and cannot sign in. Register test accounts through the API, then make one an admin:

```bash
# From the EPFL network. The password must be at least 8 characters.
curl -k https://api.staging.campusmotion.ch/auth/register -H 'Content-Type: application/json' \
  -d '{"username":"staging-admin","email":"admin@campusmotion.test","password":"<choose one>"}'

# On the staging VM, as root:
cd /srv/sites/api
sudo -u github-deploy docker compose exec db \
  psql -U postgres -d campus_motion -c "UPDATE users SET role = 'admin' WHERE email = 'admin@campusmotion.test';"
```

## Schema changes: reset the database

`initdb` only runs on an empty database. When `initdb/` changes, copy it again (the `initdb` lines of step 2) and reset. This deletes all staging data and uploads:

```bash
cd /srv/sites/api
sudo -u github-deploy docker compose down --volumes
sudo -u github-deploy docker compose up -d
```

Then recreate the test accounts.
