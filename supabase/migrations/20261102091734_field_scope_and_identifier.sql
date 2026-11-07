-- Field scope determines research eligibility; identifier status determines identity matching.
alter table bt.field_definitions
  add column scope text not null default 'INSTANCE' check (scope in ('GROUP','CLASS','INSTANCE')),
  add column is_identifier boolean not null default false;

update bt.field_definitions set
  scope = case
    when instance_specific then 'INSTANCE'
    when identifier_kind = 'GROUP' then 'GROUP'
    else 'CLASS'
  end,
  is_identifier = identifier_kind <> 'NONE';

-- These attributes describe an individual registration or manufactured unit.
update bt.field_definitions set scope = 'INSTANCE'
where id in ('subscriptions.domainName','vehicles.registrationCountry','appliances.fdNumber');

update bt.thing_fields set custom_definition =
  (custom_definition - 'instanceSpecific') || jsonb_build_object('scope',
    case when custom_definition->'instanceSpecific' = 'false'::jsonb then 'CLASS' else 'INSTANCE' end)
where custom_definition is not null;

alter table bt.thing_fields add constraint custom_field_scope
  check (custom_definition is null or
    coalesce(custom_definition->>'scope','INSTANCE') in ('GROUP','CLASS','INSTANCE'));

alter table bt.field_definitions drop column instance_specific, drop column identifier_kind;
