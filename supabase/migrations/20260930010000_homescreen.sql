alter table bt.issues
  add column status_text text check (length(status_text) <= 500),
  add column due_date date;

alter table bt.events add column starts_on date;
alter table bt.events drop constraint events_check;
alter table bt.events add constraint events_schedule_check check (
  (starts_at is null or starts_on is null)
  and (status <> 'SCHEDULED' or starts_at is not null or starts_on is not null)
);

alter table bt.things
  add column access_count integer not null default 0 check (access_count >= 0),
  add column last_viewed_at timestamptz;
create index on bt.things(owner_id, last_viewed_at desc nulls last, id);
create index on bt.things(owner_id, access_count desc, last_viewed_at desc nulls last, id);

-- Recording a view must not make a Thing appear recently edited.
create function bt.touch_thing_updated_at() returns trigger language plpgsql as $$
begin
  if (to_jsonb(new) - array['access_count', 'last_viewed_at'])
    is distinct from (to_jsonb(old) - array['access_count', 'last_viewed_at']) then
    new.updated_at = now();
  end if;
  return new;
end $$;
drop trigger touch on bt.things;
create trigger touch before update on bt.things for each row execute function bt.touch_thing_updated_at();
