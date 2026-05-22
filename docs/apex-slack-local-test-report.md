# APEX Slack Local Test Report

Test date/time: 2026-05-22 16:55 Europe/Madrid

## Environment

- Local APEX/ORDS: `http://127.0.0.1:8181/ords`
- APEX application: `http://127.0.0.1:8181/ords/r/local_codex/emeachatbot/dashboard`
- ORDS API base: `http://127.0.0.1:8181/ords/local_codex/api`
- Slack workspace: `WJTest`
- Slack workspace ID: `T0B59N1M0F6`
- Slack conversation tested: Knowledge Bot DM `D0B4ZU0NLRZ`, mapped to `EMEA-E-invoice`
- Bot name: `Knowledge Bot`
- Backend mode: `APEX`
- Deployment mode: `LOCAL`

## APEX Status

APEX was running locally and the imported Knowledge Bot application was reachable. The application is authentication-protected and redirected to login as expected.

Validated modules:

- Dashboard
- Channel Management
- Knowledge Sources
- Guardrails
- Question History
- Analytics
- Runner Management
- Settings
- Audit Logs

Validated ORDS endpoints:

- `GET /api/system/config`
- `GET /api/channel-config/:channelId`
- `GET /api/knowledge-source/:id`
- `GET /api/guardrails/:profileId`
- `POST /api/analytics/event`
- `POST /api/question-log`
- `POST /api/runner/heartbeat`
- `GET /api/runner/available`
- `GET /api/runners`
- `GET /api/questions/history`
- `GET /api/analytics/summary`

## Channel Configuration

Channel config tested:

- Display name: `EMEA-E-invoice`
- Slack-safe channel name: `emea-e-invoice`
- Linked Slack conversation ID: `D0B4ZU0NLRZ`
- Enabled: yes
- Knowledge source: `E-Invoice Knowledge Bundle`
- Knowledge source type: `JSON_BUNDLE`
- Bundle path: `./data/e-invoicing-knowledge-bundle.json`
- Bundle version: `1.0.0`
- Document count: `96`
- Chunk count: `989`
- Guardrails profile: `Strict Document Only`
- Runner pool: `Default Codex Runner Pool`

## Runner And Codex

The local runner registered successfully through the bot runtime and mirrored heartbeat status into APEX.

- Runner ID: `local-runner-dev`
- Runner type: `CLI`
- Platform: `darwin`
- APEX runner status: `ONLINE`
- Codex status: available
- Codex version: `codex-cli 0.133.0-alpha.1`

## Slack Runtime Result

The bot service started in APEX mode and loaded the E-Invoice knowledge bundle. The Knowledge Bot DM was opened in the browser and a real Slack message was submitted.

Live Slack Socket Mode did not complete because local Node/curl outbound connections to Slack timed out:

- `curl https://slack.com/api/api.test` timed out after 10 seconds.
- Slack Bolt logged repeated HTTP request failures.
- Bot service health showed Slack Socket Mode configured but not fully started.

Because of this network-layer blocker, the real Slack message was visible in Slack but was not received by the local Socket Mode runtime.

## APEX-Backed Runtime Validation

To validate the same server-side path without relying on Slack's WebSocket connection, the local Slack mock endpoint was tested with the live Slack conversation ID `D0B4ZU0NLRZ`.

This exercised:

- APEX channel lookup
- APEX knowledge source metadata
- APEX guardrails profile
- E-Invoice knowledge bundle search
- Local runner routing
- Codex execution
- APEX analytics logging
- APEX question history logging

Questions tested:

| Question | Result | Codex Used | Confidence | Sources | Response Time |
| --- | --- | --- | --- | --- | --- |
| what is e-invoicing? | Answered from E-Invoice bundle | Yes | High | 6 | 56.8s |
| what can you answer? | Answered from E-Invoice bundle | Yes | High | 6 | 59.0s |
| which countries are supported for e-invoicing? | Answered with clean country/qualifier formatting | Yes | High | 6 | 57.8s |
| what are the prerequisites for e-invoicing? | Answered and flagged truncated source item | Yes | High in metadata, Medium in answer text | 6 | 56.3s |
| which documents are you using? | Returned retrieved source documents | Yes | High | 6 | 54.4s |
| what is the weather in Madrid? | Refused safely; no indexed support found | No | Low | 0 | 0.09s |

## Analytics And Question History

After validation:

- APEX Dashboard total questions: `10`
- Online runners: `1`
- Codex-available runners: `1`
- Analytics events for 2026-05-22: `9`
- Average logged response time: about `31.6s`

Question History showed the new questions under `EMEA-E-invoice` with:

- question
- answer preview
- channel
- knowledge source
- confidence
- response time
- Codex used flag
- cache hit flag
- timestamp

## Findings

Passed:

- APEX is the authoritative backend for channel config, knowledge source metadata, guardrails profile lookup, runner status, question history, and analytics.
- The Slack runtime can use APEX channel config for the mapped Slack conversation ID.
- The local runner can execute Codex jobs and return answers.
- Out-of-scope questions refuse safely without running Codex.
- Answers include sources and confidence.
- APEX Question History and Analytics update after each runtime question.

Fixed during validation:

- Added local runtime support for the APEX runner pool key `default-codex-runner-pool`.
- Mirrored runner heartbeat events from the local runtime into APEX.
- Pulled APEX-managed guardrails into prompt construction.
- Made Slack Socket Mode startup non-blocking so local health checks remain available while Slack connects.

Known limitations:

- Real Slack Socket Mode could not be fully validated because local outbound network calls to Slack API/WebSocket endpoints timed out.
- The Slack browser UI itself was reachable, but the local Node runtime could not connect to Slack.
- First-time Codex answers are slow in local terminal-runner mode, typically around 55-60 seconds.
- APEX app pages are locally deployed and usable, but production security, OAuth, and OCI deployment are intentionally out of scope for this local validation.

## Next Steps

- Re-test real Slack Socket Mode when local outbound access to Slack API/WebSocket endpoints is available.
- Keep APEX as the backend/admin/governance source of truth.
- Keep the external runtime limited to Slack event handling and local Codex runner orchestration.
