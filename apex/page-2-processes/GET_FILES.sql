declare
  l_base_url varchar2(4000) := rtrim(coalesce(:P2_API_BASE_URL, 'http://127.0.0.1:8010'), '/');
  l_response clob;
  l_count pls_integer := 0;
begin
  apex_collection.create_or_truncate_collection('LOCAL_CODEX_FILES');
  apex_web_service.g_request_headers.delete;

  if :P2_ADMIN_TOKEN is not null then
    apex_web_service.g_request_headers(1).name  := 'X-Admin-Token';
    apex_web_service.g_request_headers(1).value := :P2_ADMIN_TOKEN;
  end if;

  l_response := apex_web_service.make_rest_request(
    p_url         => l_base_url || '/api/files',
    p_http_method => 'GET'
  );

  if apex_web_service.g_status_code between 200 and 299 then
    apex_json.parse(l_response);
    l_count := coalesce(apex_json.get_count(p_path => 'files'), 0);

    for i in 1 .. l_count loop
      apex_collection.add_member(
        p_collection_name => 'LOCAL_CODEX_FILES',
        p_c001 => apex_json.get_varchar2(p_path => 'files[%d].relative_path', p0 => i),
        p_c002 => apex_json.get_varchar2(p_path => 'files[%d].file_name', p0 => i),
        p_c003 => apex_json.get_varchar2(p_path => 'files[%d].extension', p0 => i),
        p_c004 => apex_json.get_varchar2(p_path => 'files[%d].index_status', p0 => i),
        p_c005 => apex_json.get_varchar2(p_path => 'files[%d].modified_at', p0 => i),
        p_c006 => apex_json.get_varchar2(p_path => 'files[%d].file_path', p0 => i),
        p_c007 => apex_json.get_varchar2(p_path => 'files[%d].error_message', p0 => i),
        p_n001 => apex_json.get_number(p_path => 'files[%d].size_bytes', p0 => i)
      );
    end loop;
  else
    :P2_ERROR := 'GET /api/files failed with HTTP ' || apex_web_service.g_status_code ||
                 chr(10) || dbms_lob.substr(l_response, 4000, 1);
    apex_error.add_error(
      p_message          => :P2_ERROR,
      p_display_location => apex_error.c_inline_in_notification
    );
  end if;
exception
  when others then
    :P2_ERROR := 'Error connecting to local API files endpoint: ' || sqlerrm;
    apex_error.add_error(
      p_message          => :P2_ERROR,
      p_display_location => apex_error.c_inline_in_notification
    );
end;
