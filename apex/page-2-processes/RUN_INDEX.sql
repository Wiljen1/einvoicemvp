declare
  l_base_url varchar2(4000) := rtrim(coalesce(:P2_API_BASE_URL, 'http://127.0.0.1:8010'), '/');
  l_response clob;
begin
  :P2_ERROR := null;
  apex_web_service.g_request_headers.delete;
  apex_web_service.g_request_headers(1).name  := 'Content-Type';
  apex_web_service.g_request_headers(1).value := 'application/json';

  if :P2_ADMIN_TOKEN is not null then
    apex_web_service.g_request_headers(2).name  := 'X-Admin-Token';
    apex_web_service.g_request_headers(2).value := :P2_ADMIN_TOKEN;
  end if;

  l_response := apex_web_service.make_rest_request(
    p_url         => l_base_url || '/api/index',
    p_http_method => 'POST',
    p_body        => '{}'
  );

  :P2_INDEX_RESULT := dbms_lob.substr(l_response, 32767, 1);

  if apex_web_service.g_status_code not between 200 and 299 then
    :P2_ERROR := 'POST /api/index failed with HTTP ' || apex_web_service.g_status_code ||
                 chr(10) || dbms_lob.substr(l_response, 4000, 1);
    apex_error.add_error(
      p_message          => :P2_ERROR,
      p_display_location => apex_error.c_inline_in_notification
    );
  end if;
exception
  when others then
    :P2_INDEX_RESULT := 'Error connecting to local API: ' || sqlerrm;
    :P2_ERROR := :P2_INDEX_RESULT;
    apex_error.add_error(
      p_message          => :P2_ERROR,
      p_display_location => apex_error.c_inline_in_notification
    );
end;
