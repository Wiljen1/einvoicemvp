# Local APEX Desktop Setup

This is the current local Oracle APEX developer setup on this Mac. It is meant to make APEX easy to launch locally and easy for Codex to inspect or automate. It is not a replacement for Oracle-hosted APEX or Autonomous Database.

## What Exists Now

- Oracle APEX 26.1 installer bundle:
  - `$HOME/Downloads/apex-latest/apex`
- Oracle Database Free container:
  - container name: `local-oracle-free`
  - image: `container-registry.oracle.com/database/free:23.26.0.0-arm64`
  - database service: `FREEPDB1`
  - listener: `127.0.0.1:1521`
- ORDS 26.1:
  - ORDS home: `$HOME/ords`
  - ORDS config: `$HOME/ords-config`
  - local URL: `http://127.0.0.1:8181/ords`
- Java:
  - Homebrew OpenJDK 21
  - path used by scripts: `/opt/homebrew/opt/openjdk@21/bin`
- Local APEX workspace:
  - workspace: `LOCAL_CODEX`
  - schema: `LOCAL_CODEX`
  - user: local APEX workspace user

The deprecated local middleware on `127.0.0.1:8010` is not part of this local APEX desktop setup and should not be required for launching APEX.

## Launch APEX

From the project folder:

```bash
npm run local-apex:open
```

This command:

1. Starts Colima if needed.
2. Starts the Oracle Database Free container if needed.
3. Starts ORDS if needed.
4. Opens APEX in a Chrome app-style window.

There is also a macOS app wrapper:

```text
$HOME/Applications/Local Oracle APEX.app
```

Opening that app runs the same `npm run local-apex:open` flow. It does not store or submit credentials.

## Stop APEX

```bash
npm run local-apex:stop
```

This stops ORDS and the local Oracle container.

## Check APEX

```bash
npm run local-apex:check
```

Quick HTTP checks:

```bash
curl http://127.0.0.1:8181/i/apex_version.txt
curl -I http://127.0.0.1:8181/ords/
```

## Browser URLs

Workspace sign-in:

```text
http://127.0.0.1:8181/ords/r/apex/workspace-sign-in/oracle-apex-sign-in
```

APEX root:

```text
http://127.0.0.1:8181/ords
```

## Codex Access

Codex can inspect and automate the local APEX browser page at:

```text
http://127.0.0.1:8181/ords
```

It can also connect to the local database container for setup checks using SQL*Plus inside Docker. Codex must not request, store, or hardcode Oracle SSO credentials.

## Oracle Credentials / SSO

Local APEX does not automatically accept an Oracle corporate account. A self-managed local APEX install uses APEX workspace users by default: workspace, username, and password.

True Oracle SSO for local APEX is only possible if an approved Oracle identity provider allows an OAuth2/OpenID Connect or SAML client for this local ORDS callback URL. That typically requires identity-admin configuration, a client ID/secret, allowed redirect URI, and HTTPS/trusted callback rules. Without that approved identity-provider registration, local APEX cannot securely use Oracle SSO.

Closest secure alternative for local development:

- use a local APEX workspace user for APEX Builder
- do not reuse Oracle corporate passwords locally
- configure SSO later in Oracle-hosted APEX or Autonomous Database, where the approved identity provider and redirect URLs are managed properly

## Why The App-Style Launcher Helps

The launcher opens APEX in a normal Chrome app-style window, not in the embedded Codex browser. That helps avoid embedded-browser SSO limitations when you use a real cloud APEX URL later. For the current local APEX instance, no Oracle SSO happens unless you explicitly configure an external authentication scheme.

## Official References

- APEX local workspace sign-in uses workspace/user/password: https://docs.oracle.com/en/database/oracle/apex/26.1/htmig/creating-workspace-and-adding-apex-users.html
- APEX Social Sign-In supports OAuth2/OpenID Connect-capable providers: https://docs.oracle.com/en/database/oracle/apex/26.1/aeadm/editing-social-sign-in.html
- APEX and ORDS install/configuration: https://docs.oracle.com/en/database/oracle/apex/26.1/htmig/installing-and-configuring-apex-and-ords.html
- ORDS installation guide: https://docs.oracle.com/en/database/oracle/oracle-rest-data-services/26.1/ordig/index.html
- Autonomous Database IAM tool note: APEX is not supported for IAM users: https://docs.oracle.com/en-us/iaas/autonomous-database-serverless/doc/iam-tools-notes.html
