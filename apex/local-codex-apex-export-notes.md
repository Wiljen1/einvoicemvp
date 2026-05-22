# APEX Export And Import Notes

An executable APEX application or page export is not generated in this repo because a valid export depends on the target APEX application ID, workspace security group ID, parsing schema, theme, template IDs, plug-in IDs, and APEX version.

Generated instead:

- `apex/local-codex-index-admin-components.json`: machine-readable component manifest.
- `apex/local-codex-index-admin-page.md`: exact Page Builder component map.
- `apex/local-codex-index-admin-processes.sql`: page process source blocks.
- `apex/local-codex-apex-support.sql`: SQL Workshop-installable support package.

After building the page once in your target APEX app, generate a real page export from:

1. App Builder.
2. Your application.
3. Export / Import.
4. Export Page.
5. Select `Local Codex Index Admin`.

That exported page is the production-safe import artifact for the same APEX version/theme family.

For a future automated generator, use the JSON manifest as the stable source of truth and emit version-specific `wwv_flow_imp_page` calls from an actual target app export template.

