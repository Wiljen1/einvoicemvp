/*
  Local Codex APEX support package.

  This script can be run in APEX SQL Workshop > SQL Scripts.

  It does not create the APEX page itself. It creates reusable PL/SQL helpers
  for local middleware calls and collection population. Page-level processes
  can either use this package or use the standalone blocks in:

    apex/local-codex-index-admin-processes.sql

  Requirements:
  - APEX schema has network access to the local API host and port.
  - Local Node middleware is running on port 8010.
*/

create or replace package local_codex_apex as
  c_default_base_url constant varchar2(4000) := 'http://127.0.0.1:8010';
  c_docker_base_url  constant varchar2(4000) := 'http://host.docker.internal:8010';

  function normalize_base_url(
    p_base_url in varchar2
  ) return varchar2;

  function get_status(
    p_base_url    in varchar2 default c_default_base_url,
    p_admin_token in varchar2 default null
  ) return clob;

  function get_files(
    p_base_url    in varchar2 default c_default_base_url,
    p_admin_token in varchar2 default null
  ) return clob;

  function run_index(
    p_base_url    in varchar2 default c_default_base_url,
    p_admin_token in varchar2 default null
  ) return clob;

  function search_files(
    p_query       in varchar2,
    p_base_url    in varchar2 default c_default_base_url,
    p_admin_token in varchar2 default null,
    p_limit       in number default 10
  ) return clob;

  function ask(
    p_question    in varchar2,
    p_base_url    in varchar2 default c_default_base_url,
    p_admin_token in varchar2 default null,
    p_limit       in number default 5
  ) return clob;

  procedure populate_status_collection(
    p_response in clob,
    p_base_url in varchar2 default c_default_base_url
  );

  procedure populate_files_collection(
    p_response in clob
  );

  procedure populate_search_collection(
    p_response in clob
  );
end local_codex_apex;
/

show errors

create or replace package body local_codex_apex as
  function normalize_base_url(
    p_base_url in varchar2
  ) return varchar2 is
  begin
    return rtrim(coalesce(p_base_url, c_default_base_url), '/');
  end normalize_base_url;

  procedure set_headers(
    p_content_type_json in boolean default false,
    p_admin_token       in varchar2 default null
  ) is
    l_index pls_integer := 1;
  begin
    apex_web_service.g_request_headers.delete;

    if p_content_type_json then
      apex_web_service.g_request_headers(l_index).name  := 'Content-Type';
      apex_web_service.g_request_headers(l_index).value := 'application/json';
      l_index := l_index + 1;
    end if;

    if p_admin_token is not null then
      apex_web_service.g_request_headers(l_index).name  := 'X-Admin-Token';
      apex_web_service.g_request_headers(l_index).value := p_admin_token;
    end if;
  end set_headers;

  function get_status(
    p_base_url    in varchar2 default c_default_base_url,
    p_admin_token in varchar2 default null
  ) return clob is
  begin
    set_headers(p_admin_token => p_admin_token);
    return apex_web_service.make_rest_request(
      p_url         => normalize_base_url(p_base_url) || '/api/status',
      p_http_method => 'GET'
    );
  end get_status;

  function get_files(
    p_base_url    in varchar2 default c_default_base_url,
    p_admin_token in varchar2 default null
  ) return clob is
  begin
    set_headers(p_admin_token => p_admin_token);
    return apex_web_service.make_rest_request(
      p_url         => normalize_base_url(p_base_url) || '/api/files',
      p_http_method => 'GET'
    );
  end get_files;

  function run_index(
    p_base_url    in varchar2 default c_default_base_url,
    p_admin_token in varchar2 default null
  ) return clob is
  begin
    set_headers(
      p_content_type_json => true,
      p_admin_token       => p_admin_token
    );
    return apex_web_service.make_rest_request(
      p_url         => normalize_base_url(p_base_url) || '/api/index',
      p_http_method => 'POST',
      p_body        => '{}'
    );
  end run_index;

  function search_files(
    p_query       in varchar2,
    p_base_url    in varchar2 default c_default_base_url,
    p_admin_token in varchar2 default null,
    p_limit       in number default 10
  ) return clob is
    l_body clob;
  begin
    l_body := json_object(
      'query' value p_query,
      'limit' value coalesce(p_limit, 10)
      returning clob
    );

    set_headers(
      p_content_type_json => true,
      p_admin_token       => p_admin_token
    );
    return apex_web_service.make_rest_request(
      p_url         => normalize_base_url(p_base_url) || '/api/search',
      p_http_method => 'POST',
      p_body        => l_body
    );
  end search_files;

  function ask(
    p_question    in varchar2,
    p_base_url    in varchar2 default c_default_base_url,
    p_admin_token in varchar2 default null,
    p_limit       in number default 5
  ) return clob is
    l_body clob;
  begin
    l_body := json_object(
      'question' value p_question,
      'limit' value coalesce(p_limit, 5)
      returning clob
    );

    set_headers(
      p_content_type_json => true,
      p_admin_token       => p_admin_token
    );
    return apex_web_service.make_rest_request(
      p_url         => normalize_base_url(p_base_url) || '/api/ask',
      p_http_method => 'POST',
      p_body        => l_body
    );
  end ask;

  procedure populate_status_collection(
    p_response in clob,
    p_base_url in varchar2 default c_default_base_url
  ) is
    l_active_files varchar2(100);
    l_total_files  varchar2(100);
    l_latest_run   varchar2(100);
    l_database_status varchar2(100) := 'Not connected';
    l_folder_status   varchar2(100) := 'Missing';
    l_codex_status    varchar2(100) := 'no';
  begin
    apex_collection.create_or_truncate_collection('LOCAL_CODEX_STATUS');
    apex_json.parse(p_response);

    l_active_files := apex_json.get_varchar2(p_path => 'index.active_files');
    l_total_files  := apex_json.get_varchar2(p_path => 'index.total_files');
    l_latest_run   := apex_json.get_varchar2(p_path => 'index.latest_run.status');

    if apex_json.get_boolean(p_path => 'database.connected') then
      l_database_status := 'Connected';
    end if;
    if apex_json.get_boolean(p_path => 'folder.exists') then
      l_folder_status := 'Exists';
    end if;
    if apex_json.get_boolean(p_path => 'llm.codex.available') then
      l_codex_status := 'yes';
    end if;

    apex_collection.add_member(
      p_collection_name => 'LOCAL_CODEX_STATUS',
      p_c001 => 'Service',
      p_c002 => apex_json.get_varchar2(p_path => 'service'),
      p_c003 => normalize_base_url(p_base_url)
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
  end populate_status_collection;

  procedure populate_files_collection(
    p_response in clob
  ) is
    l_count pls_integer := 0;
  begin
    apex_collection.create_or_truncate_collection('LOCAL_CODEX_FILES');
    apex_json.parse(p_response);
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
  end populate_files_collection;

  procedure populate_search_collection(
    p_response in clob
  ) is
    l_count pls_integer := 0;
  begin
    apex_collection.create_or_truncate_collection('LOCAL_CODEX_SEARCH_RESULTS');
    apex_json.parse(p_response);
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
  end populate_search_collection;
end local_codex_apex;
/

show errors
