-- A Task closes after one chosen followup; recurrence follows its original dates.
alter table bt.tasks add column completed_followup jsonb;
alter table bt.tasks add constraint tasks_followup_closed_check
  check (completed_followup is null or status='CLOSED');
alter table bt.tasks drop constraint tasks_check1;
alter table bt.tasks drop constraint tasks_check2;
alter table bt.tasks add constraint tasks_recurrence_date_check
  check (recurrence is null or status in ('SUGGESTED','CLOSED') or scheduled_on is not null or deadline_on is not null);
update bt.tasks set recurrence=recurrence-'from' where recurrence is not null;
