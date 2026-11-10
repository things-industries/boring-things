-- Deadlines make every Task occurrence one-off, including historical records.
update bt.tasks set recurrence=null where deadline_on is not null and recurrence is not null;
update bt.tasks set recurrence=jsonb_set(recurrence,'{from}','"SCHEDULED"'::jsonb)
where recurrence->>'from'='DEADLINE';

alter table bt.tasks add constraint tasks_deadline_recurrence_check
  check (deadline_on is null or recurrence is null);
alter table bt.tasks drop constraint tasks_recurrence_date_check;
alter table bt.tasks add constraint tasks_recurrence_date_check
  check (recurrence is null or status in ('SUGGESTED','CLOSED') or scheduled_on is not null);
