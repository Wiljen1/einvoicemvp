select
  user as db_user,
  sys_context('USERENV', 'CURRENT_SCHEMA') as current_schema,
  systimestamp as checked_at
from dual;
