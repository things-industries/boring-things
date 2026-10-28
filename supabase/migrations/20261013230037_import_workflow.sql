-- cspell:words fkey errcode
-- Demo field storage moves to field occurrences; old Import checkpoints are replaced.
delete from bt.imports;
update bt.things set data = jsonb_build_object('setIds', '[]'::jsonb, 'pins', '[]'::jsonb);
alter table bt.field_definitions add column identifier_kind text not null default 'NONE'
  check (identifier_kind in ('NONE','GROUP','CLASS','INSTANCE'));
alter table bt.field_sets alter column eligibility drop not null;
create table bt.thing_fields (
  id uuid primary key default gen_random_uuid(),
  thing_id uuid not null,
  owner_id uuid not null,
  field_key text not null,
  field_id text references bt.field_definitions(id),
  field_set_id text references bt.field_sets(id),
  value jsonb,
  auto_populate boolean not null default true,
  origin text not null check (origin in ('USER','IMPORT','DISCOVERY')),
  source_refs jsonb not null default '[]',
  custom_definition jsonb,
  unique(thing_id, field_key),
  foreign key(thing_id,owner_id) references bt.things(id,owner_id) on delete cascade,
  check ((field_id is not null and custom_definition is null) or
         (field_id is null and field_set_id is null and custom_definition is not null))
);
create index thing_fields_owner_identifier on bt.thing_fields(owner_id,field_id);
create index thing_fields_sources on bt.thing_fields using gin(source_refs);

alter table bt.imports alter column attachment_id drop not null;
alter table bt.imports add column operation text not null default 'IMPORT'
  check(operation in ('IMPORT','RECOMMENDATION'));
alter table bt.imports add column workflow jsonb not null default '{}';
alter table bt.imports drop constraint imports_status_check;
alter table bt.imports add constraint imports_status_check check(status in (
  'QUEUED','WAITING_FOR_TRANSCRIPTION','EXTRACTING','MAPPING','DISCOVERING',
  'RECOMMENDING','COMPLETE','INCOMPLETE','FAILED'));
alter table bt.attachments add column transcription_usage jsonb;
alter table bt.attachments add column identifier_observations jsonb not null default '[]';
alter table bt.attachments add column identifier_coverage jsonb not null default '[]';

-- Public resources share content while their links remain owner-scoped.
alter table bt.thing_attachments drop constraint thing_attachments_attachment_id_owner_id_fkey;
alter table bt.import_sources drop constraint import_sources_attachment_id_owner_id_fkey;
alter table bt.imports drop constraint imports_attachment_id_owner_id_fkey;
alter table bt.attachments alter column owner_id drop not null;
alter table bt.attachments add constraint shared_attachment_source check(owner_id is not null or source_url is not null);
alter table bt.thing_attachments add foreign key(attachment_id) references bt.attachments(id);
alter table bt.import_sources add foreign key(attachment_id) references bt.attachments(id);
alter table bt.imports add foreign key(attachment_id) references bt.attachments(id);
create unique index shared_attachment_url on bt.attachments(source_url) where owner_id is null;
create function bt.validate_attachment_link_owner() returns trigger language plpgsql as $$
begin
  if new.attachment_id is not null and not exists(select 1 from bt.attachments where id=new.attachment_id
    and (owner_id=new.owner_id or owner_id is null)) then
    raise exception 'Attachment owner mismatch' using errcode='23514';
  end if;
  return new;
end $$;
create trigger attachment_link_owner before insert or update on bt.thing_attachments
  for each row execute function bt.validate_attachment_link_owner();
create trigger import_attachment_owner before insert or update on bt.imports
  for each row execute function bt.validate_attachment_link_owner();
create trigger import_source_owner before insert or update on bt.import_sources
  for each row execute function bt.validate_attachment_link_owner();

alter table bt.import_sources drop constraint import_sources_position_check;
alter table bt.import_sources add constraint import_sources_position_check check(position>=0 and position<20);

-- Replace superseded fact-mapping checkpoints and bind request lifetime to its target.
drop table bt.import_targets;
alter table bt.imports drop column extraction, drop column candidates_allocated;
alter table bt.imports drop constraint import_target_owner;
alter table bt.imports drop constraint imports_target_thing_id_fkey;
alter table bt.imports add foreign key(target_thing_id,owner_id)
  references bt.things(id,owner_id) on delete cascade;
