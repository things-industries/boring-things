-- Domain enum values change together across columns and known JSON document paths.
alter table bt.imports drop constraint imports_status_check;
alter table bt.issues drop constraint issues_status_check;
alter table bt.events drop constraint events_status_check;
alter table bt.events drop constraint events_check;
alter table bt.purchasables drop constraint purchasables_kind_check;
alter table bt.messages drop constraint messages_role_check;
alter table bt.messages drop constraint messages_status_check;
alter table bt.messages drop constraint messages_intent_check;
drop index bt.messages_one_inflight;

update bt.imports set status=upper(status);
update bt.issues set status=upper(status);
update bt.events set status=upper(status);
update bt.purchasables set kind=upper(kind);
update bt.messages set role=upper(role),status=upper(status),intent=upper(intent);
update bt.field_definitions set ui_hint=upper(ui_hint);

alter table bt.issues alter column status set default 'OPEN';
alter table bt.events alter column status set default 'SUGGESTED';
alter table bt.messages alter column intent set default 'ANSWER';
alter table bt.imports add constraint imports_status_check check(status in ('QUEUED','EXTRACTING','AWAITING_SELECTION','MAPPING','DISCOVERING','COMPLETE','INCOMPLETE','FAILED'));
alter table bt.issues add constraint issues_status_check check(status in ('OPEN','RESOLVED'));
alter table bt.events add constraint events_status_check check(status in ('SUGGESTED','SCHEDULED','COMPLETED','DISMISSED'));
alter table bt.events add constraint events_check check(status <> 'SCHEDULED' or starts_at is not null);
alter table bt.purchasables add constraint purchasables_kind_check check(kind in ('CONSUMABLE','ACCESSORY','UPGRADE'));
alter table bt.messages add constraint messages_role_check check(role in ('USER','ASSISTANT'));
alter table bt.messages add constraint messages_status_check check(status in ('QUEUED','PROCESSING','COMPLETE','FAILED'));
alter table bt.messages add constraint messages_intent_check check(intent in ('ANSWER','CREATE_EVENT','CREATE_ISSUE'));
create unique index messages_one_inflight on bt.messages(conversation_id)
  where role='ASSISTANT' and status in ('QUEUED','PROCESSING');

create function pg_temp.enum_origin(entry jsonb) returns jsonb language sql immutable as $$
  select case when entry->>'origin' in ('user','import')
    then jsonb_set(entry,'{origin}',to_jsonb(upper(entry->>'origin'))) else entry end
$$;
create function pg_temp.enum_origins(entries jsonb) returns jsonb language sql immutable as $$
  select coalesce(jsonb_object_agg(key,pg_temp.enum_origin(value)), '{}'::jsonb) from jsonb_each(entries)
$$;
create function pg_temp.enum_card(card jsonb) returns jsonb language sql immutable as $$
  select case when card->>'type' in ('thing','field','attachment','issue','event','purchasable')
    then jsonb_set(card,'{type}',to_jsonb(upper(card->>'type'))) else card end
$$;

update bt.things set data = data
  || case when data ? 'standalone' then jsonb_build_object('standalone',pg_temp.enum_origins(data->'standalone')) else '{}'::jsonb end
  || case when data ? 'values' then jsonb_build_object('values',(
    select coalesce(jsonb_object_agg(key,pg_temp.enum_origins(value)), '{}'::jsonb) from jsonb_each(data->'values')
  )) else '{}'::jsonb end
  || case when data ? 'undefinedFields' then jsonb_build_object('undefinedFields',(
    select coalesce(jsonb_agg(pg_temp.enum_origin(value) order by ord), '[]'::jsonb)
    from jsonb_array_elements(data->'undefinedFields') with ordinality as entries(value,ord)
  )) else '{}'::jsonb end;

update bt.messages set cards = (
  select coalesce(jsonb_agg(pg_temp.enum_card(value) order by ord),'[]'::jsonb)
  from jsonb_array_elements(cards) with ordinality as entries(value,ord)
), tool_results = (
  select coalesce(jsonb_agg(case when value ? 'card' then jsonb_set(value,'{card}',pg_temp.enum_card(value->'card')) else value end order by ord),'[]'::jsonb)
  from jsonb_array_elements(tool_results) with ordinality as entries(value,ord)
);

drop function pg_temp.enum_origins(jsonb);
drop function pg_temp.enum_origin(jsonb);
drop function pg_temp.enum_card(jsonb);
