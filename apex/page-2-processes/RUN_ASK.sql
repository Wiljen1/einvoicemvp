declare
  l_base_url varchar2(4000) := rtrim(coalesce(:P2_API_BASE_URL, 'http://127.0.0.1:8010'), '/');
  l_response clob;
  l_body clob;
  l_answer varchar2(32767);
begin
  :P2_ERROR := null;

  l_body := json_object(
    'question' value :P2_QUESTION
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
    p_url         => l_base_url || '/api/ask',
    p_http_method => 'POST',
    p_body        => l_body
  );

  if apex_web_service.g_status_code between 200 and 299 then
    begin
      apex_json.parse(l_response);
      l_answer := apex_json.get_varchar2(p_path => 'answer');
      if l_answer is not null then
        :P2_RESPONSE := l_answer;
      else
        :P2_RESPONSE := dbms_lob.substr(l_response, 32767, 1);
      end if;
    exception
      when others then
        :P2_RESPONSE := dbms_lob.substr(l_response, 32767, 1);
    end;
  else
    :P2_RESPONSE := 'Error connecting to local API: HTTP ' || apex_web_service.g_status_code ||
                    chr(10) || dbms_lob.substr(l_response, 4000, 1);
    :P2_ERROR := :P2_RESPONSE;
    apex_error.add_error(
      p_message          => :P2_ERROR,
      p_display_location => apex_error.c_inline_in_notification
    );
  end if;
exception
  when others then
    :P2_RESPONSE := 'Error connecting to local API: ' || sqlerrm;
    :P2_ERROR := :P2_RESPONSE;
    apex_error.add_error(
      p_message          => :P2_ERROR,
      p_display_location => apex_error.c_inline_in_notification
    );
end;
