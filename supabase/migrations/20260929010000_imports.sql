-- Single-process durable imports. Candidate targets are allocated once and reused on retry.
alter table bt.imports add column skeleton_id uuid references bt.things(id) on delete set null;
alter table bt.imports add constraint import_target_owner foreign key(target_thing_id,owner_id) references bt.things(id,owner_id);
alter table bt.imports add constraint imports_owner_identity unique(id,owner_id);
alter table bt.imports add constraint import_skeleton_owner foreign key(skeleton_id,owner_id) references bt.things(id,owner_id);
create table bt.import_targets (
  import_id uuid not null references bt.imports(id) on delete cascade,
  candidate_id text not null,
  thing_id uuid not null,
  owner_id uuid not null,
  is_new boolean not null,
  selected boolean not null default false,
  mapped boolean not null default false,
  discovered boolean not null default false,
  discovery jsonb,
  primary key(import_id,candidate_id),
  foreign key(import_id,owner_id) references bt.imports(id,owner_id) on delete cascade,
  foreign key(thing_id,owner_id) references bt.things(id,owner_id) on delete cascade
);
create index on bt.import_targets(thing_id,owner_id);
-- Discovery records have stable retry keys. User edits survive subsequent attempts.
alter table bt.events add column import_key text unique;
alter table bt.purchasables add column import_key text unique;
alter table bt.attachments add column import_key text unique;
