# Local Oracle APEX Install

This is the local-first path for running Oracle APEX on this Mac and connecting it to the local Codex middleware on port `8010`.

It does not use SharePoint and does not require OCI.

## What Is In The Downloaded Folder

The folder below is a valid Oracle APEX installer bundle:

```text
$HOME/Downloads/apex-latest/apex
```

The bundle contains:

- APEX 26.1
- database installer scripts, including `apexins.sql`, `apxsilentins.sql`, `apex_rest_config.sql`, and `apxchpwd.sql`
- APEX static web assets under `images/`

The bundle is not a standalone server. APEX runs inside an Oracle Database and is served to the browser by ORDS.

## Target Local Architecture

```text
Browser
  -> ORDS on localhost, for example http://127.0.0.1:8181/ords
  -> local Oracle Database PDB
  -> Oracle APEX application
  -> APEX_WEB_SERVICE calls local Node API
  -> http://127.0.0.1:8010 or http://host.docker.internal:8010
  -> SQLite index plus local Codex/OpenAI bridge
```

Use `127.0.0.1:8010` when ORDS/APEX runs directly on the Mac.
Use `host.docker.internal:8010` when ORDS/APEX runs inside Docker.

## Current Readiness Check

Run:

```bash
npm run local-apex:check
```

The checker verifies:

- APEX installer folder and version
- Docker and Colima availability
- whether Colima/Docker are running
- Java runtime availability
- SQLcl or SQL*Plus availability
- ORDS availability
- local middleware reachability at `http://127.0.0.1:8010/api/status`

At the time this guide was generated, the APEX bundle was present, Docker and Colima were installed, but Colima was stopped and Java/ORDS/SQLcl were not fully available.

## Prerequisites

Install or make available:

- Java 17 or 21 for ORDS
- SQLcl or SQL*Plus for running the APEX installer scripts
- ORDS 26.1 or another compatible ORDS release
- a local Oracle Database 19c or newer

On this Mac, the practical local route is:

1. Start Colima/Docker.
2. Run an Oracle Database Free container compatible with `arm64`.
3. Install this APEX 26.1 bundle into the database PDB.
4. Configure ORDS in standalone mode.
5. Open APEX locally and import or build the Local Codex Index Admin page.

## Start The Existing Local Middleware

In this project:

```bash
npm run local-api:start
```

Validate it from another terminal:

```bash
curl http://127.0.0.1:8010/api/status
```

## Start Docker Locally

For Colima:

```bash
colima start --cpu 4 --memory 8 --disk 60
docker info
```

On Apple Silicon, use the full Oracle Database Free `arm64` image in Oracle Container Registry. Do not use the `lite` image for this APEX setup; the lite image is too stripped down for this installer path.

If the pull fails because of Oracle registry terms, sign in to Oracle Container Registry in a browser and accept the image terms, then run:

```bash
docker login container-registry.oracle.com
```

Example shape:

```bash
docker pull container-registry.oracle.com/database/free:23.26.0.0-arm64
docker volume create oracle-free-data
docker run -d \
  --name local-oracle-free \
  -p 1521:1521 \
  -p 5500:5500 \
  -e ORACLE_PWD='ChangeThisLocalPassword1!' \
  -v oracle-free-data:/opt/oracle/oradata \
  container-registry.oracle.com/database/free:23.26.0.0-arm64
```

Wait until the database logs say it is ready:

```bash
docker logs -f local-oracle-free
```

The usual local service name for the pluggable database is `FREEPDB1`.

## Install Java And SQLcl

Using Homebrew:

```bash
brew install openjdk@21 sqlcl
```

Then add Java to the current terminal session:

```bash
export PATH="/opt/homebrew/opt/openjdk@21/bin:$PATH"
export JAVA_HOME="/opt/homebrew/opt/openjdk@21"
```

Validate:

```bash
java -version
sql -v
```

## Install ORDS

Download ORDS from Oracle's ORDS download page, unzip it somewhere local, and add the ORDS folder to `PATH`.

Example folder layout:

```text
$HOME/ords/ords
$HOME/ords/lib/
```

Validate:

```bash
ords --version
```

## Install APEX Into The Local Database

Use the downloaded APEX bundle:

```bash
cd $HOME/Downloads/apex-latest/apex
```

For a more automated local development install, use `apxsilentins.sql`. This passes passwords on the command line, so use throwaway local passwords only.

```bash
sql -L 'sys/ChangeThisLocalPassword1!@//localhost:1521/FREEPDB1 as sysdba' \
  @apxsilentins.sql \
  SYSAUX \
  SYSAUX \
  TEMP \
  /i/ \
  ApexPublicUser1! \
  ApexListener1! \
  ApexRestPublicUser1! \
  ApexAdmin1!
```

This installs APEX, configures APEX REST users, creates or updates the internal `ADMIN` account, and configures basic outbound ACL privileges for local development.

If you prefer the interactive path:

```bash
sql -L 'sys/ChangeThisLocalPassword1!@//localhost:1521/FREEPDB1 as sysdba'
```

Then run:

```sql
@$HOME/Downloads/apex-latest/apex/apexins.sql SYSAUX SYSAUX TEMP /i/
@$HOME/Downloads/apex-latest/apex/apex_rest_config.sql
@$HOME/Downloads/apex-latest/apex/apxchpwd.sql
exit
```

## Configure And Start ORDS

Create a local ORDS config folder:

```bash
mkdir -p $HOME/ords-config
```

Run ORDS interactive install:

```bash
ords --config $HOME/ords-config install
```

Use these local values when prompted:

- database hostname: `localhost`
- database port: `1521`
- database service name: `FREEPDB1`
- administrator user: `SYS`
- administrator role: `SYSDBA`
- enable PL/SQL Gateway: yes
- APEX static images: `$HOME/Downloads/apex-latest/apex/images`

Start ORDS on a port that does not conflict with the Node API:

```bash
ords --config $HOME/ords-config serve \
  --port 8181 \
  --apex-images $HOME/Downloads/apex-latest/apex/images
```

Open:

```text
http://127.0.0.1:8181/ords
```

The APEX internal workspace is usually available at:

```text
http://127.0.0.1:8181/ords/apex_admin
```

Log in with:

- username: `ADMIN`
- password: the local APEX admin password you set during install

## Current Local Workspace Created By This Project

This local setup creates:

- workspace: `LOCAL_CODEX`
- workspace user: `ADMIN`
- workspace schema: `LOCAL_CODEX`
- local APEX app id target: `56594`

Open the workspace sign-in page:

```text
http://127.0.0.1:8181/ords/r/apex/workspace-sign-in/oracle-apex-sign-in
```

The local workspace password used during setup is documented in the project conversation, not committed to the repository.

## Start And Stop The Local Stack

After the database, APEX, and ORDS are installed:

```bash
npm run local-apex:start
```

Stop the local ORDS/API sessions and Oracle container:

```bash
npm run local-apex:stop
```

## Connect The Local Codex Admin Page

Once local APEX is running, use the generated project files:

```text
apex/local-codex-index-admin-install-guide.md
apex/local-codex-index-admin-page-2.md
apex/local-codex-index-admin-processes-page-2.sql
apex/page-2-processes/
```

For local ORDS running directly on this Mac, set the APEX page API base URL to:

```text
http://127.0.0.1:8010
```

If you later move ORDS into Docker, use:

```text
http://host.docker.internal:8010
```

## Network ACL For Local API Calls

If `APEX_WEB_SERVICE.MAKE_REST_REQUEST` fails with a network ACL error, run the project ACL example as a DBA:

```text
apex/local-codex-network-acl-example.sql
```

For the direct Mac setup, grant outbound access to:

- host: `127.0.0.1`
- port: `8010`

For ORDS in Docker, grant outbound access to:

- host: `host.docker.internal`
- port: `8010`

## Validation Checklist

1. Local API responds:

   ```bash
   curl http://127.0.0.1:8010/api/status
   ```

2. ORDS opens:

   ```text
   http://127.0.0.1:8181/ords
   ```

3. APEX internal admin opens:

   ```text
   http://127.0.0.1:8181/ords/apex_admin
   ```

4. APEX page button `STATUS` returns local middleware status.
5. `RUN_INDEX` calls `/api/index`.
6. `SEARCH` calls `/api/search`.
7. `ASK` calls `/api/ask` and displays the answer in `P2_RESPONSE`.

## Future OCI Migration Notes

Keep the page pointed at a single configurable API base URL. Later, that base URL can move from `http://127.0.0.1:8010` to an OCI API Gateway, Compute instance, OKE service, or Container Instance without redesigning the APEX page.

Keep SQLite and local folder ingestion behind the middleware module boundary. Later replacements can include Autonomous Database for index storage and Object Storage as another file source.
