-- Move appliance fields to their new addresses and keep ambiguous values as custom fields.
create temporary table appliance_field_moves on commit drop as
with destinations(field_id, set_ids) as (
  values
    ('common.serviceInterval', array['appliances.appliance']),
    ('appliances.replacementFilter', array['appliances.drying', 'appliances.spaceCooling', 'appliances.vacuum']),
    ('appliances.waterFilterModel', array['appliances.fridge']),
    ('appliances.cleaningInstructions', array[
      'appliances.washing', 'appliances.drying', 'appliances.dishwasher', 'appliances.fridge',
      'appliances.freezing', 'appliances.oven', 'appliances.hob', 'appliances.spaceCooling',
      'appliances.waterTank', 'appliances.vacuum'
    ]),
    ('appliances.cleaningInterval', array[
      'appliances.washing', 'appliances.drying', 'appliances.dishwasher', 'appliances.fridge',
      'appliances.freezing', 'appliances.oven', 'appliances.hob', 'appliances.spaceCooling',
      'appliances.waterTank', 'appliances.vacuum'
    ]),
    ('appliances.descalingInterval', array['appliances.washing', 'appliances.dishwasher', 'appliances.waterTank'])
)
select f.id, f.thing_id, f.field_set_id, f.field_id,
  case when existing.id is null then destination.set_id end as new_set_id,
  (nullif(f.value, 'null'::jsonb) is not null or not f.auto_populate or f.origin = 'USER'
    or f.source_refs <> '[]'::jsonb or exists (
      select 1 from jsonb_array_elements(coalesce(t.data->'pins', '[]'::jsonb)) as pin
      where pin->>'fieldSetId' is not distinct from f.field_set_id
        and pin->>'fieldId' = f.field_id
    )) as has_details,
  jsonb_build_object(
    'id', f.id, 'label', coalesce(old_set.name || ': ', '') || definition.name,
    'sensitive', definition.sensitive, 'scope', definition.scope
  ) as custom_field
from bt.thing_fields f
join bt.things t on t.id = f.thing_id
join bt.field_definitions definition on definition.id = f.field_id
left join bt.field_sets old_set on old_set.id = f.field_set_id
left join destinations on destinations.field_id = f.field_id
left join lateral (
  select min(target.id) as set_id
  from bt.field_sets target
  where target.id = any(destinations.set_ids)
    and (target.id = 'appliances.appliance' or t.data->'setIds' ? target.id)
  having count(*) = 1
) destination on true
left join bt.thing_fields existing
  on existing.thing_id = f.thing_id and existing.field_key = destination.set_id || ':' || f.field_id
where f.field_set_id in ('appliances.consumables', 'appliances.maintenance', 'appliances.cleaning')
  or f.field_id = 'appliances.compatibleConsumable';

update bt.thing_fields f
set field_set_id = m.new_set_id,
  field_id = case when m.new_set_id is not null then f.field_id end,
  field_key = case when m.new_set_id is not null then m.new_set_id || ':' || f.field_id
    else 'local:' || f.id::text end,
  custom_definition = case when m.new_set_id is null then m.custom_field end
from appliance_field_moves m
where f.id = m.id and (m.new_set_id is not null or m.has_details);

delete from bt.thing_fields f using appliance_field_moves m
where f.id = m.id and m.new_set_id is null and not m.has_details;

-- Remap pins in their saved order and remove the retired sets from each Thing.
update bt.things t
set data = t.data || jsonb_build_object(
  'setIds', (coalesce(t.data->'setIds', '[]'::jsonb)
    - array['appliances.consumables', 'appliances.maintenance', 'appliances.cleaning'])
    || case when not (coalesce(t.data->'setIds', '[]'::jsonb) ? 'appliances.appliance')
      and exists (
        select 1 from appliance_field_moves m where m.thing_id = t.id and m.new_set_id = 'appliances.appliance'
      ) then '["appliances.appliance"]'::jsonb else '[]'::jsonb end,
  'pins', (
    select coalesce(jsonb_agg(
      case when m.new_set_id is not null then pin || jsonb_build_object('fieldSetId', m.new_set_id)
        when m.has_details then jsonb_build_object('customFieldId', m.id)
        else pin end order by position), '[]'::jsonb)
    from jsonb_array_elements(coalesce(t.data->'pins', '[]'::jsonb)) with ordinality as pins(pin, position)
    left join appliance_field_moves m on m.thing_id = t.id
      and m.field_set_id is not distinct from pin->>'fieldSetId' and m.field_id = pin->>'fieldId'
    where m.new_set_id is not null or m.has_details or (
      coalesce(pin->>'fieldSetId', '') not in ('appliances.consumables', 'appliances.maintenance', 'appliances.cleaning')
      and coalesce(pin->>'fieldId', '') <> 'appliances.compatibleConsumable'
    )
  )
)
where t.data->'setIds' ?| array['appliances.consumables', 'appliances.maintenance', 'appliances.cleaning']
  or exists (select 1 from appliance_field_moves m where m.thing_id = t.id);

with retired(ids) as (values (array['appliances.consumables', 'appliances.maintenance', 'appliances.cleaning']))
update bt.field_sets s
set includes = array(select id from unnest(s.includes) as id where not (id = any(retired.ids))),
    consider_alongside = array(
      select id from unnest(s.consider_alongside) as id where not (id = any(retired.ids))
    )
from retired
where s.includes && retired.ids or s.consider_alongside && retired.ids;

delete from bt.field_sets
where id in ('appliances.consumables', 'appliances.maintenance', 'appliances.cleaning');

delete from bt.field_definitions where id = 'appliances.compatibleConsumable';
