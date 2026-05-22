/*
  Optional future setup only.

  Current hosted workspace status:
  - REST is enabled for WKSP_EMEAWJ.
  - URL mapping pattern: emeawj
  - AUTO_REST_AUTH: ENABLED

  Keep this script as a reproducible setup record. Do not change the URL mapping
  without updating .env.apex-deploy.example and apex/codex-apex-project.json.
*/

begin
  ords.enable_schema(
    p_enabled             => true,
    p_schema              => 'WKSP_EMEAWJ',
    p_url_mapping_type    => 'BASE_PATH',
    p_url_mapping_pattern => 'emeawj',
    p_auto_rest_auth      => true
  );

  commit;
end;
/

select parsing_schema, pattern, status, auto_rest_auth
from user_ords_schemas;
