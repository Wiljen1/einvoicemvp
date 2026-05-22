declare
  l_base_url varchar2(4000) := rtrim(coalesce(:P2_API_BASE_URL, 'http://127.0.0.1:8010'), '/');
  l_response clob;
  l_active_files varchar2(100);
  l_total_files varchar2(100);
  l_latest_run varchar2(100);
  l_database_status varchar2(100);
  l_folder_status varchar2(100);
  l_codex_status varchar2(100);
begin
  :P2_ERROR := null;
  apex_collection.create_or_truncate_collection('LOCAL_CODEX_STATUS');
  apex_web_service.g_request_headers.delete;

  if :P2_ADMIN_TOKEN is not null then
    apex_web_service.g_request_headers(1).name  := 'X-Admin-Token';
    apex_web_service.g_request_headers(1).value := :P2_ADMIN_TOKEN;
  end if;

  l_response := apex_web_service.make_rest_request(
    p_url         => l_base_url || '/api/status',
    p_http_method => 'GET'
  );

  :P2_STATUS_JSON := dbms_lob.substr(l_response, 32767, 1);

  if apex_web_service.g_status_code between 200 and 299 then
    apex_json.parse(l_response);
    l_active_files := apex_json.get_varchar2(p_path => 'index.active_files');
    l_total_files  := apex_json.get_varchar2(p_path => 'index.total_files');
    l_latest_run   := apex_json.get_varchar2(p_path => 'index.latest_run.status');
    l_database_status := 'Not connected';
    l_folder_status := 'Missing';
    l_codex_status := 'no';

    if apex_json.get_boolean(p_path => 'database.connected') then
      l_database_status := 'Connected';
    end if;
    if apex_json.get_boolean(p_path => 'folder.exists') then
      l_folder_status := 'Exists';
    end if;
    if apex_json.get_boolean(p_path => 'llm.codex.available') then
      l_codex_status := 'yes';
    end if;

    :P2_STATUS_SUMMARY :=
      'Local API reachable. Active files: ' || coalesce(l_active_files, '0') ||
      ', total files: ' || coalesce(l_total_files, '0') ||
      ', latest run: ' || coalesce(l_latest_run, 'none');

    apex_collection.add_member(
      p_collection_name => 'LOCAL_CODEX_STATUS',
      p_c001 => 'Service',
      p_c002 => apex_json.get_varchar2(p_path => 'service'),
      p_c003 => l_base_url
    );
    apex_collection.add_member(
      p_collection_name => 'LOCAL_CODEX_STATUS',
      p_c001 => 'Database',
      p_c002 => apex_json.get_varchar2(p_path => 'database.path'),
      p_c003 => l_database_status
    );
    apex_collection.add_member(
      p_collection_name => 'LOCAL_CODEX_STATUS',
      p_c001 => 'Folder',
      p_c002 => apex_json.get_varchar2(p_path => 'folder.path'),
      p_c003 => l_folder_status
    );
    apex_collection.add_member(
      p_collection_name => 'LOCAL_CODEX_STATUS',
      p_c001 => 'Active Files',
      p_c002 => coalesce(l_active_files, '0'),
      p_c003 => 'Total files: ' || coalesce(l_total_files, '0')
    );
    apex_collection.add_member(
      p_collection_name => 'LOCAL_CODEX_STATUS',
      p_c001 => 'Latest Index Run',
      p_c002 => coalesce(l_latest_run, 'none'),
      p_c003 => apex_json.get_varchar2(p_path => 'index.latest_run.completed_at')
    );
    apex_collection.add_member(
      p_collection_name => 'LOCAL_CODEX_STATUS',
      p_c001 => 'LLM Provider',
      p_c002 => apex_json.get_varchar2(p_path => 'llm.provider'),
      p_c003 => 'Codex available: ' || l_codex_status
    );
  else
    :P2_STATUS_SUMMARY := 'Local API returned HTTP ' || apex_web_service.g_status_code;
    :P2_ERROR := 'GET /api/status failed with HTTP ' || apex_web_service.g_status_code ||
                 chr(10) || dbms_lob.substr(l_response, 4000, 1);
  end if;
exception
  when others then
    :P2_STATUS_SUMMARY := 'Local API unreachable';
    :P2_ERROR := 'Error connecting to local API status endpoint: ' || sqlerrm;
    apex_error.add_error(
      p_message          => :P2_ERROR,
      p_display_location => apex_error.c_inline_in_notification
    );
end;
