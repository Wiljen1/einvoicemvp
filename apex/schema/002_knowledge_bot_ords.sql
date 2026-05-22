set define off
whenever sqlerror exit sql.sqlcode rollback

prompt Creating Knowledge Bot ORDS API package

create or replace package kb_rest_api authid definer as
  procedure emit(p_json in clob, p_status in number default 200);
  procedure emit_error(p_message in varchar2, p_status in number default 400);
  procedure print_channel_config(p_channel_id in varchar2);
  procedure print_knowledge_source(p_source_id in varchar2);
  procedure print_guardrails(p_profile_id in varchar2);
  procedure record_analytics_event(p_body in clob);
  procedure record_question_log(p_body in clob);
  procedure record_runner_heartbeat(p_body in clob);
  procedure print_runner_available;
  procedure print_system_config;
end kb_rest_api;
/

create or replace package body kb_rest_api as
  procedure write_clob(p_clob in clob) is
    l_pos integer := 1;
    l_len integer := dbms_lob.getlength(p_clob);
  begin
    while l_pos <= l_len loop
      htp.prn(dbms_lob.substr(p_clob, 32000, l_pos));
      l_pos := l_pos + 32000;
    end loop;
  end;

  procedure emit(p_json in clob, p_status in number default 200) is
  begin
    owa_util.status_line(p_status, case when p_status between 200 and 299 then 'OK' else 'ERROR' end, false);
    owa_util.mime_header('application/json', false);
    htp.p('Cache-Control: no-store');
    owa_util.http_header_close;
    write_clob(p_json);
  end;

  procedure emit_error(p_message in varchar2, p_status in number default 400) is
    l_json clob;
  begin
    select json_object('ok' value false, 'error' value p_message returning clob)
      into l_json
      from dual;
    emit(l_json, p_status);
  end;

  function bool_json(p_value in varchar2) return varchar2 is
  begin
    return case when upper(p_value) in ('Y','TRUE','1','YES','ONLINE') then 'true' else 'false' end;
  end;

  function is_valid_json(p_body in clob) return boolean is
    l_ok number;
  begin
    select 1
      into l_ok
      from dual
     where p_body is json;
    return true;
  exception
    when no_data_found then
      return false;
  end;

  procedure print_channel_config(p_channel_id in varchar2) is
    l_json clob;
  begin
    select json_object(
      'ok' value true,
      'data' value json_object(
        'channelConfigId' value channel_config_id,
        'channelId' value coalesce(slack_channel_id, slack_channel_name),
        'slackWorkspaceId' value slack_workspace_id,
        'slackChannelId' value slack_channel_id,
        'channelName' value slack_channel_name,
        'displayName' value channel_display_name,
        'enabled' value case when config_enabled_yn = 'Y' then true else false end,
        'knowledgeSourceId' value knowledge_source_id,
        'knowledgeSourceKey' value knowledge_source_key,
        'knowledgeSourceName' value knowledge_source_name,
        'knowledgeSourceType' value knowledge_source_type,
        'knowledgeBundlePath' value knowledge_bundle_path,
        'knowledgeBundleVersion' value current_bundle_version,
        'sourceFolderLink' value source_folder_link,
        'guardrailsProfileId' value guardrail_profile_id,
        'guardrailsProfileKey' value guardrail_profile_key,
        'answerStyle' value answer_style,
        'requiresLocalRunner' value case when requires_local_runner_yn = 'Y' then true else false end,
        'runnerPoolId' value runner_pool_id,
        'runnerPoolKey' value runner_pool_key,
        'analyticsSourceId' value analytics_source_id,
        'analyticsSourceKey' value analytics_source_key,
        'analyticsScope' value analytics_scope,
        'documentCount' value document_count,
        'chunkCount' value chunk_count,
        'validationStatus' value knowledge_validation_status
      returning clob)
    returning clob)
    into l_json
    from kb_channel_config_v
    where lower(coalesce(slack_channel_id, slack_channel_name)) = lower(p_channel_id)
       or lower(slack_channel_name) = lower(p_channel_id)
    fetch first 1 row only;

    emit(l_json);
  exception
    when no_data_found then
      emit_error('Channel is not configured for Knowledge Bot.', 404);
  end;

  procedure print_knowledge_source(p_source_id in varchar2) is
    l_json clob;
  begin
    select json_object(
      'ok' value true,
      'data' value json_object(
        'id' value knowledge_source_id,
        'sourceKey' value source_key,
        'name' value name,
        'type' value source_type,
        'sourceFolderLink' value source_folder_link,
        'knowledgeBundlePath' value knowledge_bundle_path,
        'currentBundleVersion' value current_bundle_version,
        'lastLoadedAt' value to_char(last_loaded_at, 'YYYY-MM-DD"T"HH24:MI:SSTZH:TZM'),
        'documentCount' value document_count,
        'chunkCount' value chunk_count,
        'validationStatus' value validation_status,
        'metadata' value coalesce(metadata_json, to_clob('{}')) format json
      returning clob)
    returning clob)
    into l_json
    from knowledge_sources
    where source_key = p_source_id or to_char(knowledge_source_id) = p_source_id
    fetch first 1 row only;

    emit(l_json);
  exception
    when no_data_found then
      emit_error('Knowledge source not found.', 404);
  end;

  procedure print_guardrails(p_profile_id in varchar2) is
    l_json clob;
  begin
    select json_object(
      'ok' value true,
      'data' value json_object(
        'id' value guardrail_profile_id,
        'profileKey' value profile_key,
        'name' value name,
        'systemGuardrails' value system_guardrails format json,
        'checkboxDefaults' value coalesce(checkbox_defaults_json, to_clob('{}')) format json,
        'additionalGuardrails' value additional_guardrails,
        'requireSources' value case when require_sources_yn = 'Y' then true else false end,
        'requireConfidence' value case when require_confidence_yn = 'Y' then true else false end,
        'enabled' value case when enabled_yn = 'Y' then true else false end
      returning clob)
    returning clob)
    into l_json
    from guardrail_profiles
    where profile_key = p_profile_id or to_char(guardrail_profile_id) = p_profile_id
    fetch first 1 row only;

    emit(l_json);
  exception
    when no_data_found then
      emit_error('Guardrails profile not found.', 404);
  end;

  procedure resolve_context(
    p_channel_token in varchar2,
    p_channel_id out number,
    p_channel_config_id out number,
    p_knowledge_source_id out number,
    p_guardrail_profile_id out number,
    p_analytics_source_id out number
  ) is
  begin
    select channel_id, channel_config_id, knowledge_source_id, guardrail_profile_id, analytics_source_id
      into p_channel_id, p_channel_config_id, p_knowledge_source_id, p_guardrail_profile_id, p_analytics_source_id
      from kb_channel_config_v
     where lower(coalesce(slack_channel_id, slack_channel_name)) = lower(p_channel_token)
        or lower(slack_channel_name) = lower(p_channel_token)
     fetch first 1 row only;
  exception
    when no_data_found then
      p_channel_id := null;
      p_channel_config_id := null;
      p_knowledge_source_id := null;
      p_guardrail_profile_id := null;
      p_analytics_source_id := null;
  end;

  procedure record_analytics_event(p_body in clob) is
    l_body clob := coalesce(p_body, '{}');
    l_channel_token varchar2(255);
    l_channel_id number;
    l_channel_config_id number;
    l_knowledge_source_id number;
    l_guardrail_profile_id number;
    l_analytics_source_id number;
    l_event_id number;
  begin
    if not is_valid_json(l_body) then
      emit_error('Request body must be valid JSON.', 400);
      return;
    end if;

    l_channel_token := coalesce(
      json_value(l_body, '$.slackChannelId'),
      json_value(l_body, '$.channelId'),
      json_value(l_body, '$.channelName'),
      'emea-e-invoice'
    );
    resolve_context(l_channel_token, l_channel_id, l_channel_config_id, l_knowledge_source_id, l_guardrail_profile_id, l_analytics_source_id);

    insert into analytics_events (
      channel_id, channel_config_id, knowledge_source_id, analytics_source_id, event_type, event_json, error_message
    ) values (
      l_channel_id,
      l_channel_config_id,
      l_knowledge_source_id,
      l_analytics_source_id,
      coalesce(json_value(l_body, '$.eventType'), 'QUESTION_ANSWER'),
      l_body,
      json_value(l_body, '$.error')
    )
    returning analytics_event_id into l_event_id;

    commit;
    select json_object('ok' value true, 'data' value json_object('analyticsEventId' value l_event_id) returning clob)
      into l_body
      from dual;
    emit(l_body);
  exception
    when others then
      rollback;
      emit_error(sqlerrm, 500);
  end;

  procedure record_question_log(p_body in clob) is
    l_body clob := coalesce(p_body, '{}');
    l_channel_token varchar2(255);
    l_channel_id number;
    l_channel_config_id number;
    l_knowledge_source_id number;
    l_guardrail_profile_id number;
    l_analytics_source_id number;
    l_question_log_id number;
    l_runner_id number;
    l_runner_key varchar2(255);
    l_question clob;
    l_answer clob;
  begin
    if not is_valid_json(l_body) then
      emit_error('Request body must be valid JSON.', 400);
      return;
    end if;

    l_question := json_value(l_body, '$.question' returning clob);
    if l_question is null then
      emit_error('question is required.', 400);
      return;
    end if;
    l_answer := json_value(l_body, '$.answer' returning clob);
    l_channel_token := coalesce(json_value(l_body, '$.slackChannelId'), json_value(l_body, '$.channelId'), 'emea-e-invoice');
    l_runner_key := json_value(l_body, '$.runnerId');
    resolve_context(l_channel_token, l_channel_id, l_channel_config_id, l_knowledge_source_id, l_guardrail_profile_id, l_analytics_source_id);

    if l_runner_key is not null then
      begin
        select runner_id into l_runner_id
        from runners
        where runner_key = l_runner_key or to_char(runner_id) = l_runner_key
        fetch first 1 row only;
      exception
        when no_data_found then
          l_runner_id := null;
      end;
    end if;

    insert into question_logs (
      channel_id, channel_config_id, knowledge_source_id, guardrail_profile_id,
      slack_workspace_id, slack_channel_id, slack_user_id, slack_message_ts,
      question, normalized_question, question_hash, answer, confidence_score, confidence_level,
      response_time_ms, codex_used_yn, cache_hit_yn, runner_id, sources_json, retrieved_chunk_ids_json
    ) values (
      l_channel_id, l_channel_config_id, l_knowledge_source_id, l_guardrail_profile_id,
      json_value(l_body, '$.slackWorkspaceId'), json_value(l_body, '$.slackChannelId'),
      json_value(l_body, '$.userId'), json_value(l_body, '$.messageTs'),
      l_question,
      lower(regexp_replace(dbms_lob.substr(l_question, 2000, 1), '\s+', ' ')),
      standard_hash(lower(regexp_replace(dbms_lob.substr(l_question, 2000, 1), '\s+', ' ')), 'SHA256'),
      l_answer,
      to_number(nullif(json_value(l_body, '$.confidenceScore'), '')),
      json_value(l_body, '$.confidenceLevel'),
      to_number(nullif(json_value(l_body, '$.responseTimeMs'), '')),
      case when json_value(l_body, '$.codexUsed') = 'true' then 'Y' else 'N' end,
      case when json_value(l_body, '$.cacheHit') = 'true' then 'Y' else 'N' end,
      l_runner_id,
      coalesce(json_query(l_body, '$.sources' returning clob), to_clob('[]')),
      coalesce(json_query(l_body, '$.retrievedChunkIds' returning clob), to_clob('[]'))
    )
    returning question_log_id into l_question_log_id;

    if l_answer is not null then
      insert into answer_logs (
        question_log_id, answer, confidence_score, confidence_level, codex_used_yn, cache_hit_yn
      ) values (
        l_question_log_id,
        l_answer,
        to_number(nullif(json_value(l_body, '$.confidenceScore'), '')),
        json_value(l_body, '$.confidenceLevel'),
        case when json_value(l_body, '$.codexUsed') = 'true' then 'Y' else 'N' end,
        case when json_value(l_body, '$.cacheHit') = 'true' then 'Y' else 'N' end
      );
    end if;

    commit;
    select json_object('ok' value true, 'data' value json_object('questionLogId' value l_question_log_id) returning clob)
      into l_body
      from dual;
    emit(l_body);
  exception
    when no_data_found then
      rollback;
      emit_error('Referenced runner or channel was not found.', 404);
    when others then
      rollback;
      emit_error(sqlerrm, 500);
  end;

  procedure record_runner_heartbeat(p_body in clob) is
    l_body clob := coalesce(p_body, '{}');
    l_runner_key varchar2(255);
    l_pool_key varchar2(255);
    l_pool_id number;
    l_runner_id number;
  begin
    if not is_valid_json(l_body) then
      emit_error('Request body must be valid JSON.', 400);
      return;
    end if;

    l_runner_key := coalesce(json_value(l_body, '$.runnerId'), json_value(l_body, '$.runnerKey'));
    if l_runner_key is null then
      emit_error('runnerId is required.', 400);
      return;
    end if;
    l_pool_key := coalesce(json_value(l_body, '$.runnerPoolKey'), 'default-codex-runner-pool');

    select runner_pool_id into l_pool_id
    from runner_pools
    where pool_key = l_pool_key
    fetch first 1 row only;

    merge into runners t
    using (
      select
        l_pool_id runner_pool_id,
        l_runner_key runner_key,
        coalesce(json_value(l_body, '$.name'), l_runner_key) name,
        coalesce(json_value(l_body, '$.runnerType'), 'CLI') runner_type,
        json_value(l_body, '$.platform') platform,
        json_value(l_body, '$.appVersion') app_version,
        case when json_value(l_body, '$.status') in ('BUSY','ERROR') then json_value(l_body, '$.status') else 'ONLINE' end status,
        case when json_value(l_body, '$.codexAvailable') = 'true' then 'Y' else 'N' end codex_available_yn,
        json_value(l_body, '$.codexVersion') codex_version,
        json_query(l_body, '$.metadata' returning clob) metadata_json
      from dual
    ) s
    on (t.runner_key = s.runner_key)
    when matched then update set
      t.runner_pool_id = s.runner_pool_id,
      t.name = s.name,
      t.runner_type = s.runner_type,
      t.platform = s.platform,
      t.app_version = s.app_version,
      t.status = s.status,
      t.codex_available_yn = s.codex_available_yn,
      t.codex_version = s.codex_version,
      t.last_heartbeat_at = systimestamp,
      t.metadata_json = coalesce(s.metadata_json, t.metadata_json)
    when not matched then insert (
      runner_pool_id, runner_key, name, runner_type, platform, app_version,
      status, codex_available_yn, codex_version, last_heartbeat_at, metadata_json
    ) values (
      s.runner_pool_id, s.runner_key, s.name, s.runner_type, s.platform, s.app_version,
      s.status, s.codex_available_yn, s.codex_version, systimestamp, coalesce(s.metadata_json, to_clob('{}'))
    );

    select runner_id into l_runner_id from runners where runner_key = l_runner_key;
    commit;
    select json_object('ok' value true, 'data' value json_object('runnerId' value l_runner_id, 'runnerKey' value l_runner_key) returning clob)
      into l_body
      from dual;
    emit(l_body);
  exception
    when no_data_found then
      rollback;
      emit_error('Runner pool not found.', 404);
    when others then
      rollback;
      emit_error(sqlerrm, 500);
  end;

  procedure print_runner_available is
    l_json clob;
  begin
    select json_object(
      'ok' value true,
      'data' value json_object(
        'available' value case when count(*) > 0 then true else false end,
        'runnerCount' value count(*),
        'runners' value json_arrayagg(
          json_object(
            'runnerId' value runner_key,
            'name' value name,
            'status' value status,
            'codexAvailable' value case when codex_available_yn = 'Y' then true else false end,
            'lastHeartbeatAt' value to_char(last_heartbeat_at, 'YYYY-MM-DD"T"HH24:MI:SSTZH:TZM')
          )
        )
      returning clob)
    returning clob)
    into l_json
    from runners
    where status = 'ONLINE'
      and codex_available_yn = 'Y'
      and last_heartbeat_at > systimestamp - interval '10' minute;

    emit(l_json);
  end;

  procedure print_system_config is
    l_json clob;
  begin
    select json_object(
      'ok' value true,
      'data' value json_object(
        'settings' value (
          select json_objectagg(setting_key value setting_value)
          from system_settings
          where is_secret_yn = 'N'
        ) format json,
        'dashboard' value (
          select json_object(
            'totalChannels' value total_channels,
            'enabledChannels' value enabled_channels,
            'totalKnowledgeSources' value total_knowledge_sources,
            'totalQuestions' value total_questions,
            'onlineRunners' value online_runners,
            'codexAvailableRunners' value codex_available_runners
          )
          from kb_dashboard_v
        ) format json
      returning clob)
    returning clob)
    into l_json
    from dual;

    emit(l_json);
  end;
end kb_rest_api;
/

show errors package body kb_rest_api

prompt Creating Knowledge Bot ORDS module

begin
  ords.enable_schema(
    p_enabled => true,
    p_schema => user,
    p_url_mapping_type => 'BASE_PATH',
    p_url_mapping_pattern => lower(user),
    p_auto_rest_auth => false
  );

  ords.delete_module(p_module_name => 'knowledge_bot_api');

  ords.define_module(
    p_module_name => 'knowledge_bot_api',
    p_base_path => 'api/',
    p_items_per_page => 25,
    p_status => 'PUBLISHED',
    p_comments => 'Knowledge Bot APEX-first governance API'
  );

  ords.define_template('knowledge_bot_api', 'channel-config/:channelId');
  ords.define_handler(
    p_module_name => 'knowledge_bot_api',
    p_pattern => 'channel-config/:channelId',
    p_method => 'GET',
    p_source_type => ords.source_type_plsql,
    p_source => 'begin kb_rest_api.print_channel_config(:channelId); end;'
  );

  ords.define_template('knowledge_bot_api', 'knowledge-source/:sourceId');
  ords.define_handler(
    p_module_name => 'knowledge_bot_api',
    p_pattern => 'knowledge-source/:sourceId',
    p_method => 'GET',
    p_source_type => ords.source_type_plsql,
    p_source => 'begin kb_rest_api.print_knowledge_source(:sourceId); end;'
  );

  ords.define_template('knowledge_bot_api', 'guardrails/:profileId');
  ords.define_handler(
    p_module_name => 'knowledge_bot_api',
    p_pattern => 'guardrails/:profileId',
    p_method => 'GET',
    p_source_type => ords.source_type_plsql,
    p_source => 'begin kb_rest_api.print_guardrails(:profileId); end;'
  );

  ords.define_template('knowledge_bot_api', 'analytics/event');
  ords.define_handler(
    p_module_name => 'knowledge_bot_api',
    p_pattern => 'analytics/event',
    p_method => 'POST',
    p_source_type => ords.source_type_plsql,
    p_source => 'begin kb_rest_api.record_analytics_event(:body_text); end;'
  );

  ords.define_template('knowledge_bot_api', 'question-log');
  ords.define_handler(
    p_module_name => 'knowledge_bot_api',
    p_pattern => 'question-log',
    p_method => 'POST',
    p_source_type => ords.source_type_plsql,
    p_source => 'begin kb_rest_api.record_question_log(:body_text); end;'
  );

  ords.define_template('knowledge_bot_api', 'runner/heartbeat');
  ords.define_handler(
    p_module_name => 'knowledge_bot_api',
    p_pattern => 'runner/heartbeat',
    p_method => 'POST',
    p_source_type => ords.source_type_plsql,
    p_source => 'begin kb_rest_api.record_runner_heartbeat(:body_text); end;'
  );

  ords.define_template('knowledge_bot_api', 'runner/available');
  ords.define_handler(
    p_module_name => 'knowledge_bot_api',
    p_pattern => 'runner/available',
    p_method => 'GET',
    p_source_type => ords.source_type_plsql,
    p_source => 'begin kb_rest_api.print_runner_available; end;'
  );

  ords.define_template('knowledge_bot_api', 'system/config');
  ords.define_handler(
    p_module_name => 'knowledge_bot_api',
    p_pattern => 'system/config',
    p_method => 'GET',
    p_source_type => ords.source_type_plsql,
    p_source => 'begin kb_rest_api.print_system_config; end;'
  );

  ords.define_template('knowledge_bot_api', 'channels');
  ords.define_handler(
    p_module_name => 'knowledge_bot_api',
    p_pattern => 'channels',
    p_method => 'GET',
    p_source_type => ords.source_type_query,
    p_source => 'select channel_config_id, slack_channel_id, slack_channel_name, channel_display_name, channel_enabled_yn, knowledge_source_name, guardrail_profile_name, runner_pool_name, answer_style, config_updated_at from kb_channel_config_v order by channel_display_name'
  );

  ords.define_template('knowledge_bot_api', 'knowledge-sources');
  ords.define_handler(
    p_module_name => 'knowledge_bot_api',
    p_pattern => 'knowledge-sources',
    p_method => 'GET',
    p_source_type => ords.source_type_query,
    p_source => 'select knowledge_source_id, source_key, name, source_type, source_folder_link, knowledge_bundle_path, current_bundle_version, document_count, chunk_count, validation_status, last_loaded_at from knowledge_sources order by name'
  );

  ords.define_template('knowledge_bot_api', 'guardrails');
  ords.define_handler(
    p_module_name => 'knowledge_bot_api',
    p_pattern => 'guardrails',
    p_method => 'GET',
    p_source_type => ords.source_type_query,
    p_source => 'select guardrail_profile_id, profile_key, name, require_sources_yn, require_confidence_yn, enabled_yn, updated_at from guardrail_profiles order by name'
  );

  ords.define_template('knowledge_bot_api', 'questions/history');
  ords.define_handler(
    p_module_name => 'knowledge_bot_api',
    p_pattern => 'questions/history',
    p_method => 'GET',
    p_source_type => ords.source_type_query,
    p_source => 'select question_log_id, channel_name, knowledge_source_name, confidence_score, confidence_level, response_time_ms, codex_used_yn, cache_hit_yn, created_at, question, answer_preview from kb_question_history_v order by created_at desc fetch first 50 rows only'
  );

  ords.define_template('knowledge_bot_api', 'analytics/summary');
  ords.define_handler(
    p_module_name => 'knowledge_bot_api',
    p_pattern => 'analytics/summary',
    p_method => 'GET',
    p_source_type => ords.source_type_query,
    p_source => 'select event_day, total_events, cache_hits, avg_response_time_ms from kb_analytics_summary_v order by event_day desc'
  );

  ords.define_template('knowledge_bot_api', 'runners');
  ords.define_handler(
    p_module_name => 'knowledge_bot_api',
    p_pattern => 'runners',
    p_method => 'GET',
    p_source_type => ords.source_type_query,
    p_source => 'select runner_pool_name, runner_pool_mode, runner_key, runner_name, runner_type, platform, status, codex_available_yn, codex_version, last_heartbeat_at from kb_runner_status_v order by runner_pool_name, runner_name'
  );

  ords.define_template('knowledge_bot_api', 'settings');
  ords.define_handler(
    p_module_name => 'knowledge_bot_api',
    p_pattern => 'settings',
    p_method => 'GET',
    p_source_type => ords.source_type_query,
    p_source => 'select setting_key, case when is_secret_yn = ''Y'' then ''***'' else setting_value end setting_value, value_type, is_secret_yn, description, updated_at from system_settings order by setting_key'
  );

  ords.define_template('knowledge_bot_api', 'audit-logs');
  ords.define_handler(
    p_module_name => 'knowledge_bot_api',
    p_pattern => 'audit-logs',
    p_method => 'GET',
    p_source_type => ords.source_type_query,
    p_source => 'select audit_log_id, entity_type, entity_id, action, changed_by, created_at from audit_logs order by created_at desc fetch first 100 rows only'
  );

  commit;
end;
/

prompt Knowledge Bot ORDS API complete
