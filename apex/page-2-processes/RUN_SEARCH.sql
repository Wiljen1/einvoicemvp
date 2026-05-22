declare
  l_base_url varchar2(4000) := rtrim(coalesce(:P2_API_BASE_URL, 'http://127.0.0.1:8010'), '/');
  l_response clob;
  l_body clob;
  l_count pls_integer := 0;
begin
  :P2_ERROR := null;
  apex_collection.create_or_truncate_collection('LOCAL_CODEX_SEARCH_RESULTS');

  l_body := json_object(
    'query' value :P2_SEARCH,
    'limit' value 10
    returning clob
  );

  apex_web_service.g_request_headers.delete;
  apex_web_service.g_request_headers(1).name  := 'Content-Type';
  apex_web_service.g_request_headers(1).value := 'application/json';

  if :P2_ADMIN_TOKEN is not null then
    apex_web_service.g_request_headers(2).name  := 'X-Admin-Token';
    apex_web_service.g_request_headers(2).value := :P2_ADMIN_TOKEN;
  end if;

  l_response := apex_web_service.make_rest_request(
    p_url         => l_base_url || '/api/search',
    p_http_method => 'POST',
    p_body        => l_body
  );

  :P2_SEARCH_JSON := dbms_lob.substr(l_response, 32767, 1);

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
    :P2_ERROR := 'POST /api/search failed with HTTP ' || apex_web_service.g_status_code ||
                 chr(10) || dbms_lob.substr(l_response, 4000, 1);
    apex_error.add_error(
      p_message          => :P2_ERROR,
      p_display_location => apex_error.c_inline_in_notification
    );
  end if;
exception
  when others then
    :P2_SEARCH_JSON := 'Error connecting to local API: ' || sqlerrm;
    :P2_ERROR := :P2_SEARCH_JSON;
    apex_error.add_error(
      p_message          => :P2_ERROR,
      p_display_location => apex_error.c_inline_in_notification
    );
end;
