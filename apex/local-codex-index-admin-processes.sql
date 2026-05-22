/*
  Oracle APEX page processes for "Local Codex Index Admin".

  Page assumptions:
  - Page number is 1.
  - Items exist:
      P1_API_BASE_URL
      P1_ADMIN_TOKEN
      P1_STATUS_SUMMARY
      P1_STATUS_JSON
      P1_INDEX_RESULT
      P1_SEARCH
      P1_SEARCH_JSON
      P1_QUESTION
      P1_RESPONSE
      P1_ERROR
  - Buttons exist:
      STATUS
      RUN_INDEX
      SEARCH
      ASK

  If your page number is not 1, rename P1_... items to match the page number.

  These blocks are intended to be copied into APEX page processes, not run as
  one standalone SQL script.
*/

--------------------------------------------------------------------------------
-- Process: GET_STATUS
-- Point: Before Header, or Processing when STATUS is pressed
-- Endpoint: GET /api/status
--------------------------------------------------------------------------------
declare
  l_base_url varchar2(4000) := rtrim(coalesce(:P1_API_BASE_URL, 'http://127.0.0.1:8010'), '/');
  l_response clob;
  l_active_files varchar2(100);
  l_total_files varchar2(100);
  l_latest_run varchar2(100);
  l_database_status varchar2(100);
  l_folder_status varchar2(100);
  l_codex_status varchar2(100);
begin
  :P1_ERROR := null;
  apex_collection.create_or_truncate_collection('LOCAL_CODEX_STATUS');
  apex_web_service.g_request_headers.delete;

  if :P1_ADMIN_TOKEN is not null then
    apex_web_service.g_request_headers(1).name  := 'X-Admin-Token';
    apex_web_service.g_request_headers(1).value := :P1_ADMIN_TOKEN;
  end if;

  l_response := apex_web_service.make_rest_request(
    p_url         => l_base_url || '/api/status',
    p_http_method => 'GET'
  );

  :P1_STATUS_JSON := dbms_lob.substr(l_response, 32767, 1);

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

    :P1_STATUS_SUMMARY :=
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
    :P1_STATUS_SUMMARY := 'Local API returned HTTP ' || apex_web_service.g_status_code;
    :P1_ERROR := 'GET /api/status failed with HTTP ' || apex_web_service.g_status_code ||
                 chr(10) || dbms_lob.substr(l_response, 4000, 1);
  end if;
exception
  when others then
    :P1_STATUS_SUMMARY := 'Local API unreachable';
    :P1_ERROR := 'Error connecting to local API status endpoint: ' || sqlerrm;
    apex_error.add_error(
      p_message          => :P1_ERROR,
      p_display_location => apex_error.c_inline_in_notification
    );
end;
/

--------------------------------------------------------------------------------
-- Process: GET_FILES
-- Point: Before Header, or Processing after RUN_INDEX
-- Endpoint: GET /api/files
-- Populates collection: LOCAL_CODEX_FILES
--------------------------------------------------------------------------------
declare
  l_base_url varchar2(4000) := rtrim(coalesce(:P1_API_BASE_URL, 'http://127.0.0.1:8010'), '/');
  l_response clob;
  l_count pls_integer := 0;
begin
  apex_collection.create_or_truncate_collection('LOCAL_CODEX_FILES');
  apex_web_service.g_request_headers.delete;

  if :P1_ADMIN_TOKEN is not null then
    apex_web_service.g_request_headers(1).name  := 'X-Admin-Token';
    apex_web_service.g_request_headers(1).value := :P1_ADMIN_TOKEN;
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
    :P1_ERROR := 'GET /api/files failed with HTTP ' || apex_web_service.g_status_code ||
                 chr(10) || dbms_lob.substr(l_response, 4000, 1);
    apex_error.add_error(
      p_message          => :P1_ERROR,
      p_display_location => apex_error.c_inline_in_notification
    );
  end if;
exception
  when others then
    :P1_ERROR := 'Error connecting to local API files endpoint: ' || sqlerrm;
    apex_error.add_error(
      p_message          => :P1_ERROR,
      p_display_location => apex_error.c_inline_in_notification
    );
end;
/

--------------------------------------------------------------------------------
-- Process: RUN_INDEX
-- Point: Processing
-- Server-side condition: When Button Pressed = RUN_INDEX
-- Endpoint: POST /api/index
--------------------------------------------------------------------------------
declare
  l_base_url varchar2(4000) := rtrim(coalesce(:P1_API_BASE_URL, 'http://127.0.0.1:8010'), '/');
  l_response clob;
begin
  :P1_ERROR := null;
  apex_web_service.g_request_headers.delete;
  apex_web_service.g_request_headers(1).name  := 'Content-Type';
  apex_web_service.g_request_headers(1).value := 'application/json';

  if :P1_ADMIN_TOKEN is not null then
    apex_web_service.g_request_headers(2).name  := 'X-Admin-Token';
    apex_web_service.g_request_headers(2).value := :P1_ADMIN_TOKEN;
  end if;

  l_response := apex_web_service.make_rest_request(
    p_url         => l_base_url || '/api/index',
    p_http_method => 'POST',
    p_body        => '{}'
  );

  :P1_INDEX_RESULT := dbms_lob.substr(l_response, 32767, 1);

  if apex_web_service.g_status_code not between 200 and 299 then
    :P1_ERROR := 'POST /api/index failed with HTTP ' || apex_web_service.g_status_code ||
                 chr(10) || dbms_lob.substr(l_response, 4000, 1);
    apex_error.add_error(
      p_message          => :P1_ERROR,
      p_display_location => apex_error.c_inline_in_notification
    );
  end if;
exception
  when others then
    :P1_INDEX_RESULT := 'Error connecting to local API: ' || sqlerrm;
    :P1_ERROR := :P1_INDEX_RESULT;
    apex_error.add_error(
      p_message          => :P1_ERROR,
      p_display_location => apex_error.c_inline_in_notification
    );
end;
/

--------------------------------------------------------------------------------
-- Process: RUN_SEARCH
-- Point: Processing
-- Server-side condition: When Button Pressed = SEARCH
-- Endpoint: POST /api/search
-- Populates collection: LOCAL_CODEX_SEARCH_RESULTS
--------------------------------------------------------------------------------
declare
  l_base_url varchar2(4000) := rtrim(coalesce(:P1_API_BASE_URL, 'http://127.0.0.1:8010'), '/');
  l_response clob;
  l_body clob;
  l_count pls_integer := 0;
begin
  :P1_ERROR := null;
  apex_collection.create_or_truncate_collection('LOCAL_CODEX_SEARCH_RESULTS');

  l_body := json_object(
    'query' value :P1_SEARCH,
    'limit' value 10
    returning clob
  );

  apex_web_service.g_request_headers.delete;
  apex_web_service.g_request_headers(1).name  := 'Content-Type';
  apex_web_service.g_request_headers(1).value := 'application/json';

  if :P1_ADMIN_TOKEN is not null then
    apex_web_service.g_request_headers(2).name  := 'X-Admin-Token';
    apex_web_service.g_request_headers(2).value := :P1_ADMIN_TOKEN;
  end if;

  l_response := apex_web_service.make_rest_request(
    p_url         => l_base_url || '/api/search',
    p_http_method => 'POST',
    p_body        => l_body
  );

  :P1_SEARCH_JSON := dbms_lob.substr(l_response, 32767, 1);

  if apex_web_service.g_status_code between 200 and 299 then
    apex_json.parse(l_response);
    l_count := coalesce(apex_json.get_count(p_path => 'results'), 0);

    for i in 1 .. l_count loop
      apex_collection.add_member(
        p_collection_name => 'LOCAL_CODEX_SEARCH_RESULTS',
        p_c001 => apex_json.get_varchar2(p_path => 'results[%d].relative_path', p0 => i),
        p_c002 => apex_json.get_varchar2(p_path => 'results[%d].file_name', p0 => i),
        p_c003 => apex_json.get_varchar2(p_path => 'results[%d].extension', p0 => i),
        p_c004 => apex_json.get_varchar2(p_path => 'results[%d].snippet', p0 => i),
        p_c005 => apex_json.get_varchar2(p_path => 'results[%d].file_path', p0 => i),
        p_n001 => apex_json.get_number(p_path => 'results[%d].score', p0 => i)
      );
    end loop;
  else
    :P1_ERROR := 'POST /api/search failed with HTTP ' || apex_web_service.g_status_code ||
                 chr(10) || dbms_lob.substr(l_response, 4000, 1);
    apex_error.add_error(
      p_message          => :P1_ERROR,
      p_display_location => apex_error.c_inline_in_notification
    );
  end if;
exception
  when others then
    :P1_SEARCH_JSON := 'Error connecting to local API: ' || sqlerrm;
    :P1_ERROR := :P1_SEARCH_JSON;
    apex_error.add_error(
      p_message          => :P1_ERROR,
      p_display_location => apex_error.c_inline_in_notification
    );
end;
/

--------------------------------------------------------------------------------
-- Process: RUN_ASK
-- Point: Processing
-- Server-side condition: When Button Pressed = ASK
-- Endpoint: POST /api/ask
-- Body:
--   { "question": "<value of P1_QUESTION>" }
--------------------------------------------------------------------------------
declare
  l_base_url varchar2(4000) := rtrim(coalesce(:P1_API_BASE_URL, 'http://127.0.0.1:8010'), '/');
  l_response clob;
  l_body clob;
  l_answer varchar2(32767);
begin
  :P1_ERROR := null;

  l_body := json_object(
    'question' value :P1_QUESTION
    returning clob
  );

  apex_web_service.g_request_headers.delete;
  apex_web_service.g_request_headers(1).name  := 'Content-Type';
  apex_web_service.g_request_headers(1).value := 'application/json';

  if :P1_ADMIN_TOKEN is not null then
    apex_web_service.g_request_headers(2).name  := 'X-Admin-Token';
    apex_web_service.g_request_headers(2).value := :P1_ADMIN_TOKEN;
  end if;

  l_response := apex_web_service.make_rest_request(
    p_url         => l_base_url || '/api/ask',
    p_http_method => 'POST',
    p_body        => l_body
  );

  if apex_web_service.g_status_code between 200 and 299 then
    begin
      apex_json.parse(l_response);
      l_answer := apex_json.get_varchar2(p_path => 'answer');
      if l_answer is not null then
        :P1_RESPONSE := l_answer;
      else
        :P1_RESPONSE := dbms_lob.substr(l_response, 32767, 1);
      end if;
    exception
      when others then
        :P1_RESPONSE := dbms_lob.substr(l_response, 32767, 1);
    end;
  else
    :P1_RESPONSE := 'Error connecting to local API: HTTP ' || apex_web_service.g_status_code ||
                    chr(10) || dbms_lob.substr(l_response, 4000, 1);
    :P1_ERROR := :P1_RESPONSE;
    apex_error.add_error(
      p_message          => :P1_ERROR,
      p_display_location => apex_error.c_inline_in_notification
    );
  end if;
exception
  when others then
    :P1_RESPONSE := 'Error connecting to local API: ' || sqlerrm;
    :P1_ERROR := :P1_RESPONSE;
    apex_error.add_error(
      p_message          => :P1_ERROR,
      p_display_location => apex_error.c_inline_in_notification
    );
end;
/
