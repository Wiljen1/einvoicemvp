set define off
whenever sqlerror exit sql.sqlcode rollback

prompt Creating Knowledge Bot APEX console pages

declare
  l_workspace_id number;
  l_nav_list_id number;

  function endpoint_for(p_page_id in number) return varchar2 is
  begin
    return case p_page_id
      when 1 then 'system/config'
      when 10 then 'channels'
      when 20 then 'knowledge-sources'
      when 30 then 'guardrails'
      when 40 then 'questions/history'
      when 50 then 'analytics/summary'
      when 60 then 'runners'
      when 70 then 'settings'
      when 80 then 'audit-logs'
      else 'system/config'
    end;
  end;

  function module_note(p_page_id in number) return varchar2 is
  begin
    return case p_page_id
      when 1 then 'System status, channel count, knowledge count, question volume, and runner summary.'
      when 10 then 'Create or link Slack channels and review assigned knowledge sources, guardrails, analytics, and runner pools.'
      when 20 then 'Track knowledge bundle locations, versions, validation state, document counts, and chunk counts.'
      when 30 then 'Review protected system guardrails, defaults, additional instructions, and channel assignment profiles.'
      when 40 then 'Review stored questions, answers, confidence, response time, Codex usage, cache hits, and sources.'
      when 50 then 'Review question trends, cache hits, source usage, confidence, and response times.'
      when 60 then 'Track runner pools, registered runners, Codex availability, and last heartbeat.'
      when 70 then 'Manage deployment mode, API flags, refresh intervals, and feature flags.'
      when 80 then 'Review admin and configuration changes for governance.'
      else 'Knowledge Bot governance module.'
    end;
  end;

  function page_html(p_page_id in number, p_title in varchar2) return varchar2 is
    l_endpoint varchar2(200) := endpoint_for(p_page_id);
    l_note varchar2(1000) := module_note(p_page_id);
  begin
    return q'~<style>
.kb-console{font-family:var(--a-base-font-family,Arial,sans-serif);max-width:1200px}
.kb-toolbar{display:flex;gap:.5rem;align-items:center;margin:.75rem 0 1rem}
.kb-note{color:#586069;margin:.25rem 0 1rem;max-width:780px}
.kb-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:.75rem;margin:1rem 0}
.kb-card{border:1px solid #d7dce2;border-radius:8px;padding:.8rem;background:#fff}
.kb-card strong{display:block;font-size:1.35rem;margin-top:.25rem}
.kb-table{width:100%;border-collapse:collapse;background:#fff;border:1px solid #d7dce2}
.kb-table th,.kb-table td{border-bottom:1px solid #edf0f3;padding:.55rem;text-align:left;vertical-align:top}
.kb-table th{background:#f6f8fa;font-weight:600}
.kb-muted{color:#6a737d}
.kb-error{color:#b00020}
.kb-button{border:1px solid #9aa4af;background:#fff;border-radius:6px;padding:.45rem .7rem;cursor:pointer}
.kb-input{border:1px solid #c9d1d9;border-radius:6px;padding:.45rem .55rem;min-width:280px}
pre.kb-json{white-space:pre-wrap;background:#f6f8fa;border:1px solid #d7dce2;border-radius:8px;padding:.75rem;max-height:360px;overflow:auto}
</style>
<div class="kb-console">
  <h1>~' || apex_escape.html(p_title) || q'~</h1>
  <p class="kb-note">~' || apex_escape.html(l_note) || q'~</p>
  <div class="kb-toolbar">
    <button type="button" class="kb-button" data-kb-refresh>Refresh</button>
    <input class="kb-input" data-kb-filter placeholder="Filter visible rows">
    <span class="kb-muted" data-kb-status>Loading APEX-owned data...</span>
  </div>
  <div data-kb-summary class="kb-grid"></div>
  <div data-kb-table></div>
  <h2>API response</h2>
  <pre class="kb-json" data-kb-json></pre>
</div>
<script>
(function(){
  const root = document.currentScript.closest('.kb-console');
  const endpoint = '/ords/local_codex/api/~' || l_endpoint || q'~';
  const status = root.querySelector('[data-kb-status]');
  const jsonBox = root.querySelector('[data-kb-json]');
  const summary = root.querySelector('[data-kb-summary]');
  const tableHost = root.querySelector('[data-kb-table]');
  const filter = root.querySelector('[data-kb-filter]');
  let lastRows = [];

  function flatten(input) {
    if (!input) return [];
    if (Array.isArray(input.items)) return input.items;
    if (input.data && Array.isArray(input.data.items)) return input.data.items;
    if (input.data && typeof input.data === 'object') return [input.data];
    return Array.isArray(input) ? input : [input];
  }

  function renderSummary(rows) {
    summary.innerHTML = '';
    if (!rows.length) return;
    const first = rows[0];
    const keys = Object.keys(first).filter(k => typeof first[k] !== 'object').slice(0, 6);
    keys.forEach(k => {
      const div = document.createElement('div');
      div.className = 'kb-card';
      div.innerHTML = '<span class="kb-muted">' + k + '</span><strong>' + String(first[k] ?? '') + '</strong>';
      summary.appendChild(div);
    });
  }

  function renderTable(rows) {
    const q = (filter.value || '').toLowerCase();
    const filtered = rows.filter(r => JSON.stringify(r).toLowerCase().includes(q));
    if (!filtered.length) {
      tableHost.innerHTML = '<p class="kb-muted">No rows found.</p>';
      return;
    }
    const cols = Array.from(new Set(filtered.flatMap(r => Object.keys(r)))).slice(0, 10);
    const html = '<table class="kb-table"><thead><tr>' + cols.map(c => '<th>' + c + '</th>').join('') +
      '</tr></thead><tbody>' + filtered.map(r => '<tr>' + cols.map(c => '<td>' +
      String(r[c] == null ? '' : typeof r[c] === 'object' ? JSON.stringify(r[c]) : r[c]).slice(0, 500) +
      '</td>').join('') + '</tr>').join('') + '</tbody></table>';
    tableHost.innerHTML = html;
  }

  async function load() {
    status.textContent = 'Loading ' + endpoint;
    try {
      const res = await fetch(endpoint, {headers:{'Accept':'application/json'}});
      const data = await res.json();
      jsonBox.textContent = JSON.stringify(data, null, 2);
      lastRows = flatten(data);
      renderSummary(lastRows);
      renderTable(lastRows);
      status.textContent = 'Loaded ' + lastRows.length + ' row(s).';
    } catch (error) {
      status.innerHTML = '<span class="kb-error">' + error.message + '</span>';
      jsonBox.textContent = error.stack || error.message;
    }
  }

  root.querySelector('[data-kb-refresh]').addEventListener('click', load);
  filter.addEventListener('input', () => renderTable(lastRows));
  load();
})();
</script>~';
  end;

  procedure create_static_page(p_page_id in number, p_name in varchar2, p_alias in varchar2, p_title in varchar2, p_seq in number, p_icon in varchar2) is
  begin
    wwv_flow_imp_page.remove_page(p_flow_id => 56594, p_page_id => p_page_id);
    wwv_flow_imp_page.create_page(
      p_id => p_page_id,
      p_name => p_name,
      p_alias => p_alias,
      p_step_title => p_title,
      p_autocomplete_on_off => 'OFF',
      p_step_template => 4073832297226169690,
      p_page_template_options => '#DEFAULT#',
      p_protection_level => 'C'
    );
    wwv_flow_imp_page.create_page_plug(
      p_id => wwv_flow_imp.id(565940000 + p_page_id),
      p_page_id => p_page_id,
      p_plug_name => p_title,
      p_title => p_title,
      p_region_template_options => '#DEFAULT#',
      p_plug_template => 4073835273271169698,
      p_plug_display_sequence => 10,
      p_plug_display_point => 'BODY',
      p_plug_source_type => 'NATIVE_STATIC_CONTENT',
      p_plug_source => page_html(p_page_id, p_title),
      p_attributes => wwv_flow_t_plugin_attributes(wwv_flow_t_varchar2(
        'expand_shortcuts', 'N',
        'output_as', 'HTML')).to_clob
    );

    wwv_flow_imp_shared.create_list_item(
      p_id => wwv_flow_imp.id(565950000 + p_page_id),
      p_list_id => l_nav_list_id,
      p_list_item_display_sequence => p_seq,
      p_list_item_link_text => p_title,
      p_static_id => lower(replace(p_alias, '_', '-')),
      p_list_item_link_target => 'f?p=&APP_ID.:' || p_page_id || ':&SESSION.::&DEBUG.',
      p_list_item_icon => p_icon,
      p_list_item_current_type => 'TARGET_PAGE'
    );
  end;
begin
  select workspace_id
    into l_workspace_id
    from apex_workspaces
   where workspace = 'LOCAL_CODEX';

  wwv_flow_imp.import_begin(
    p_version_yyyy_mm_dd => '2026.03.30',
    p_release => '26.1.0',
    p_default_workspace_id => l_workspace_id,
    p_default_application_id => 56594,
    p_default_id_offset => 0,
    p_default_owner => 'LOCAL_CODEX'
  );

  select list_id
    into l_nav_list_id
    from apex_application_lists
   where application_id = 56594
     and list_name = 'Navigation Menu';

  create_static_page(1,  'Dashboard',          'DASHBOARD',          'Dashboard',          10, 'fa-dashboard');
  create_static_page(10, 'Channel Management', 'CHANNELS',           'Channel Management', 20, 'fa-hashtag');
  create_static_page(20, 'Knowledge Sources',  'KNOWLEDGE_SOURCES',  'Knowledge Sources',  30, 'fa-database');
  create_static_page(30, 'Guardrails',         'GUARDRAILS',         'Guardrails',         40, 'fa-shield');
  create_static_page(40, 'Question History',   'QUESTION_HISTORY',   'Question History',   50, 'fa-comments');
  create_static_page(50, 'Analytics',          'ANALYTICS',          'Analytics',          60, 'fa-bar-chart');
  create_static_page(60, 'Runner Management',  'RUNNERS',            'Runner Management',  70, 'fa-server');
  create_static_page(70, 'Settings',           'SETTINGS',           'Settings',           80, 'fa-gear');
  create_static_page(80, 'Audit Logs',         'AUDIT_LOGS',         'Audit Logs',         90, 'fa-history');

  wwv_flow_imp.import_end(p_auto_install_sup_obj => false);
  commit;
end;
/

prompt Knowledge Bot APEX console pages complete
