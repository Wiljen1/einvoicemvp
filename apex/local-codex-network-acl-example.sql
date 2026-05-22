/*
  Optional network ACL example for Oracle DBAs.

  Only run this if APEX_WEB_SERVICE cannot reach the local middleware and your
  database reports a network ACL error such as ORA-24247.

  Replace YOUR_APEX_PARSING_SCHEMA with the parsing schema for your APEX app.
  This usually requires DBA privileges and may not be allowed from a hosted APEX
  SQL Workshop.
*/

begin
  dbms_network_acl_admin.append_host_ace(
    host       => '127.0.0.1',
    lower_port => 8010,
    upper_port => 8010,
    ace        => xs$ace_type(
      privilege_list => xs$name_list('http'),
      principal_name => 'YOUR_APEX_PARSING_SCHEMA',
      principal_type => xs_acl.ptype_db
    )
  );
end;
/

begin
  dbms_network_acl_admin.append_host_ace(
    host       => 'host.docker.internal',
    lower_port => 8010,
    upper_port => 8010,
    ace        => xs$ace_type(
      privilege_list => xs$name_list('http'),
      principal_name => 'YOUR_APEX_PARSING_SCHEMA',
      principal_type => xs_acl.ptype_db
    )
  );
end;
/

commit;

