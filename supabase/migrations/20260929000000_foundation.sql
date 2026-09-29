-- Private application schema: no direct browser/PostgREST access.
create schema bt;
revoke all on schema bt from public, anon, authenticated;

create table bt.users (
  id uuid primary key default gen_random_uuid(), auth_subject text not null unique,
  display_name text not null default 'You', samples_added boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table bt.categories (
  id text primary key, name text not null, description text not null, icon text not null,
  default_image text, sort_order integer not null
);
create table bt.field_definitions (
  id text primary key, name text not null, description text not null, keywords text[] not null default '{}',
  schema jsonb not null, ui_hint text not null, sensitive boolean not null default false
);
create table bt.field_sets (
  id text primary key, category_id text not null references bt.categories(id), name text not null,
  eligibility text not null, keywords text[] not null default '{}', includes text[] not null default '{}',
  consider_alongside text[] not null default '{}', field_ids text[] not null
);
create table bt.things (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references bt.users(id),
  category_id text not null references bt.categories(id), name text not null, description text not null default '',
  data jsonb not null default '{"setIds":[],"values":{},"standalone":{},"undefinedFields":[],"pins":[]}',
  revision bigint not null default 1, image_attachment_id uuid, is_sample boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(id, owner_id)
);
create table bt.attachments (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references bt.users(id),
  filename text not null, media_type text not null, byte_size integer not null check(byte_size >= 0),
  storage_key text not null unique, source_url text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(id, owner_id)
);
create table bt.thing_attachments (
  thing_id uuid not null, attachment_id uuid not null, owner_id uuid not null,
  primary key(thing_id,attachment_id),
  foreign key(thing_id,owner_id) references bt.things(id,owner_id) on delete cascade,
  foreign key(attachment_id,owner_id) references bt.attachments(id,owner_id)
);
alter table bt.things add constraint image_link foreign key(id,image_attachment_id)
  references bt.thing_attachments(thing_id,attachment_id) deferrable initially deferred;
create table bt.imports (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references bt.users(id),
  attachment_id uuid not null, target_thing_id uuid references bt.things(id) on delete set null,
  status text not null check(status in ('queued','extracting','awaiting_selection','mapping','discovering','complete','incomplete','failed')),
  extraction jsonb, selection jsonb, result_thing_ids uuid[] not null default '{}', error text, usage jsonb,
  started_at timestamptz, finished_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  foreign key(attachment_id,owner_id) references bt.attachments(id,owner_id)
);
create table bt.tags (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references bt.users(id), name text not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(owner_id,name), unique(id,owner_id)
);
create table bt.thing_tags (
  thing_id uuid not null, tag_id uuid not null, owner_id uuid not null,
  primary key(thing_id,tag_id),
  foreign key(thing_id,owner_id) references bt.things(id,owner_id) on delete cascade,
  foreign key(tag_id,owner_id) references bt.tags(id,owner_id) on delete cascade
);
create table bt.issues (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references bt.users(id), thing_id uuid not null,
  title text not null, description text not null default '', status text not null default 'open' check(status in ('open','resolved')),
  resolved_at timestamptz, is_sample boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(id,thing_id,owner_id), foreign key(thing_id,owner_id) references bt.things(id,owner_id) on delete cascade
);
create table bt.events (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references bt.users(id), thing_id uuid not null,
  issue_id uuid, title text not null, description text not null default '',
  status text not null default 'suggested' check(status in ('suggested','scheduled','completed','dismissed')),
  starts_at timestamptz, completed_at timestamptz, source_refs jsonb not null default '[]', is_sample boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check(status <> 'scheduled' or starts_at is not null),
  foreign key(thing_id,owner_id) references bt.things(id,owner_id) on delete cascade,
  foreign key(issue_id,thing_id,owner_id) references bt.issues(id,thing_id,owner_id) on delete cascade
);
create table bt.purchasables (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references bt.users(id), thing_id uuid not null,
  kind text not null check(kind in ('consumable','accessory','upgrade')), name text not null, description text not null default '',
  merchant_url text not null, image_url text, price_amount bigint, currency text,
  source_refs jsonb not null default '[]', checked_at timestamptz, is_sample boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check((price_amount is null and currency is null) or (price_amount >= 0 and currency ~ '^[A-Z]{3}$' and checked_at is not null)),
  foreign key(thing_id,owner_id) references bt.things(id,owner_id) on delete cascade
);
create table bt.conversations (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references bt.users(id), thing_id uuid,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(id,owner_id),
  foreign key(thing_id,owner_id) references bt.things(id,owner_id) on delete cascade
);
create table bt.messages (
  id uuid primary key default gen_random_uuid(), conversation_id uuid not null references bt.conversations(id) on delete cascade,
  request_id uuid not null, role text not null check(role in ('user','assistant')), text text not null default '',
  cards jsonb not null default '[]', source_refs jsonb not null default '[]', tool_results jsonb not null default '[]',
  status text not null check(status in ('queued','processing','complete','failed')), usage jsonb, error text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(conversation_id,request_id,role)
);
create index on bt.things(owner_id,category_id,updated_at desc);
create index on bt.imports(owner_id,status);
create index on bt.issues(thing_id,status);
create index on bt.events(thing_id,status,starts_at);
create index on bt.purchasables(thing_id);
create index on bt.messages(conversation_id,created_at);
create index on bt.thing_attachments(attachment_id,thing_id);
create index on bt.thing_tags(tag_id,thing_id);
create index on bt.field_definitions using gin(to_tsvector('simple',name || ' ' || description));
create index on bt.field_sets using gin(to_tsvector('simple',name || ' ' || eligibility));

create function bt.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
do $$ declare name text; begin
  foreach name in array array['users','things','attachments','imports','tags','issues','events','purchasables','conversations','messages'] loop
    execute format('create trigger touch before update on bt.%I for each row execute function bt.touch_updated_at()',name);
  end loop;
end $$;
