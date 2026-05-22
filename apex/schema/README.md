# APEX Schema Changes

Put database changes for the hosted APEX workspace here.

Run a script through the authenticated APEX SQL Workshop session:

```bash
npm run apex:chrome:sql -- apex/schema/001_example.sql
```

For ad hoc SQL:

```bash
printf "select count(*) from user_tables;" | npm run apex:chrome:sql -- -
```

Current hosted workspace schema:

```text
WKSP_EMEAWJ
```

Keep scripts repeatable where possible. Prefer `create or replace` for views, packages, and synonyms. For tables, use guarded PL/SQL blocks or additive migration scripts.
