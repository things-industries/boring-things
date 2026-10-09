-- Completed Imports retain their results; new work cites one or more transcribed Attachments.
do $$
begin
  if exists (select 1 from bt.imports where status <> 'COMPLETE') then
    raise exception 'Finish or remove unfinished Imports before this migration';
  end if;
end $$;

alter table bt.imports
  add column candidates_allocated boolean not null default false,
  add column revision bigint not null default 1;

create function bt.bump_import_revision() returns trigger language plpgsql as $$
begin new.revision = old.revision + 1; return new; end $$;
create trigger bump_import_revision before update on bt.imports
  for each row execute function bt.bump_import_revision();

create table bt.import_sources (
  import_id uuid not null,
  attachment_id uuid not null,
  owner_id uuid not null,
  position integer not null check (position >= 0 and position < 10),
  primary key (import_id, attachment_id),
  unique (import_id, position),
  foreign key (import_id, owner_id) references bt.imports(id, owner_id) on delete cascade,
  foreign key (attachment_id, owner_id) references bt.attachments(id, owner_id)
);

insert into bt.import_sources(import_id, attachment_id, owner_id, position)
select id, attachment_id, owner_id, 0 from bt.imports;

update bt.imports
set candidates_allocated = true,
    extraction = case when extraction is null then null else
      jsonb_set(extraction, '{candidates}', coalesce((
        select jsonb_agg(candidate || '{"targeted":true,"linksCommitted":true}'::jsonb)
        from jsonb_array_elements(coalesce(extraction->'candidates','[]'::jsonb)) candidate
      ), '[]'::jsonb)) end;

alter table bt.imports drop column skeleton_id, drop column selection;

alter table bt.imports drop constraint imports_status_check;
alter table bt.imports add constraint imports_status_check check(status in (
  'QUEUED','WAITING_FOR_TRANSCRIPTION','EXTRACTING',
  'MAPPING','DISCOVERING','REVIEW_REQUIRED','COMPLETE','INCOMPLETE','FAILED'
));

create index import_sources_attachment on bt.import_sources(attachment_id, import_id);
create index attachments_pending_transcription on bt.attachments(created_at, id)
  where transcription_status in ('PENDING','PROCESSING');
