-- Tasks own user work; Events represent appointments, visits and deliveries.
delete from bt.events;
alter table bt.events drop constraint events_status_check;
alter table bt.events drop column completed_at;
alter table bt.events add column ends_at timestamptz;
alter table bt.events add column closed_at timestamptz;
alter table bt.events add column completion_actions jsonb not null default '[]';
alter table bt.events alter column status set default 'SCHEDULED';
alter table bt.events add constraint events_status_check check (status in ('SCHEDULED','CLOSED'));
alter table bt.events add constraint events_end_check check (ends_at is null or (starts_at is not null and ends_at >= starts_at));
alter table bt.events add constraint events_closed_check check ((status='CLOSED')=(closed_at is not null));

create table bt.tasks (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references bt.users(id),
 thing_id uuid not null, issue_id uuid, title text not null, description text not null default '',
 status text not null default 'SUGGESTED' check(status in ('SUGGESTED','ACTIVE','COMPLETED','CLOSED')),
 importance text not null default 'RECOMMENDED' check(importance in ('CRITICAL','IMPORTANT','RECOMMENDED','NICE_TO_HAVE')),
 scheduled_on date, deadline_on date, recurrence jsonb, completion_actions jsonb not null default '[]',
 completed_at timestamptz, closed_at timestamptz,
 reference_task_id uuid, reference_dates jsonb,
 source_refs jsonb not null default '[]', import_key text unique, is_sample boolean not null default false,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(thing_id,owner_id) references bt.things(id,owner_id) on delete cascade,
 foreign key(issue_id,thing_id,owner_id) references bt.issues(id,thing_id,owner_id) on delete cascade,
 check(scheduled_on is null or deadline_on is null or scheduled_on<=deadline_on),
 check(recurrence is null or (scheduled_on is not null or deadline_on is not null)),
 check(recurrence is null or recurrence->>'from'<>'DEADLINE' or deadline_on is not null),
 check((status='CLOSED')=(closed_at is not null)),
 check(status<>'COMPLETED' or completed_at is not null)
);
revoke all on bt.tasks from public,anon,authenticated;
create index on bt.tasks(owner_id,status,scheduled_on,id);
create index on bt.tasks(issue_id);
create trigger touch before update on bt.tasks for each row execute function bt.touch_updated_at();
alter table bt.conversations add column activity_context jsonb;
