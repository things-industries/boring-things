-- Move stored field-set references to the revised registry groups.
create or replace function pg_temp.registry_set_target(old_set text, field_id text default null)
returns text language sql immutable as $$
  select case
    when old_set = 'appliances.serial' then 'appliances.appliance'
    when old_set in ('appliances.bosch', 'appliances.neff', 'appliances.siemens') then 'appliances.bsh'
    when old_set = 'appliances.recess' then 'appliances.installation'
    when old_set = 'appliances.refrigeration' then 'appliances.fridge'
    when old_set = 'appliances.waterFilter' then 'appliances.consumables'
    when old_set = 'appliances.cooling' then 'appliances.spaceCooling'
    when old_set = 'appliances.refrigerant' then 'appliances.cooling'
    when old_set = 'appliances.descaling' then 'appliances.cleaning'
    when old_set = 'vehicles.distanceMaintenance' then 'vehicles.maintenance'
    when old_set = 'devices.camera' and field_id = 'devices.recordingStorage' then 'devices.recording'
    else old_set
  end;
$$;

create or replace function pg_temp.migrate_registry_thing(data jsonb) returns jsonb language plpgsql as $$
declare
  result jsonb := data || jsonb_build_object('setIds', '[]'::jsonb, 'values', '{}'::jsonb,
    'pins', '[]'::jsonb, 'userEdited', '[]'::jsonb,
    'customFields', coalesce(data->'customFields', '[]'::jsonb));
  old_set text;
  new_set text;
  field_id text;
  old_key text;
  new_key text;
  edit text;
  entry jsonb;
  existing jsonb;
  pin jsonb;
  replacement jsonb;
  redirects jsonb := '{}'::jsonb;
  custom_id text;
  field_name text;
  set_name text;
  field_sensitive boolean;
  field_instance_specific boolean;
begin
  for old_set in select jsonb_array_elements_text(coalesce(data->'setIds', '[]'::jsonb)) loop
    new_set := pg_temp.registry_set_target(old_set);
    if not (result->'setIds' ? new_set) then
      result := jsonb_set(result, '{setIds}', result->'setIds' || to_jsonb(new_set));
    end if;
  end loop;

  -- Process owner values first. Conflicting manufacturer markings retain their own evidence.
  for old_set, field_id, entry in
    select sets.key, fields.key, fields.value
    from jsonb_each(coalesce(data->'values', '{}'::jsonb)) sets
    cross join lateral jsonb_each(sets.value) fields
    order by (fields.value->>'origin' = 'USER') desc,
      (coalesce(data->'userEdited', '[]'::jsonb) ? (sets.key || ':' || fields.key)) desc,
      sets.key, fields.key
  loop
    new_set := pg_temp.registry_set_target(old_set, field_id);
    old_key := old_set || ':' || field_id;
    new_key := new_set || ':' || field_id;
    if not (result->'setIds' ? new_set) then
      result := jsonb_set(result, '{setIds}', result->'setIds' || to_jsonb(new_set));
    end if;
    if result #> array['values', new_set] is null then
      result := jsonb_set(result, array['values', new_set], '{}'::jsonb);
    end if;
    existing := result #> array['values', new_set, field_id];
    if existing is null and not (
      old_key <> new_key and coalesce(data->'userEdited', '[]'::jsonb) ? new_key
    ) then
      result := jsonb_set(result, array['values', new_set, field_id], entry);
    elsif existing is distinct from entry then
      custom_id := gen_random_uuid()::text;
      select f.name, f.sensitive, f.instance_specific into field_name, field_sensitive,
        field_instance_specific from bt.field_definitions f where f.id = field_id;
      select s.name into set_name from bt.field_sets s where s.id = old_set;
      result := jsonb_set(result, '{customFields}', result->'customFields' || jsonb_build_array(
        entry || jsonb_build_object('id', custom_id,
          'label', coalesce(set_name, old_set) || ': ' || coalesce(field_name, field_id),
          'sensitive', coalesce(field_sensitive, false),
          'instanceSpecific', coalesce(field_instance_specific, true))
      ));
      redirects := jsonb_set(redirects, array[old_key],
        jsonb_build_object('customFieldId', custom_id));
    end if;
  end loop;

  for pin in select value from jsonb_array_elements(coalesce(data->'pins', '[]'::jsonb)) loop
    replacement := pin;
    if pin->>'fieldSetId' is not null then
      old_key := (pin->>'fieldSetId') || ':' || (pin->>'fieldId');
      replacement := coalesce(redirects->old_key,
        jsonb_build_object('fieldSetId',
          pg_temp.registry_set_target(pin->>'fieldSetId', pin->>'fieldId'),
          'fieldId', pin->>'fieldId'));
    end if;
    if not (result->'pins' @> jsonb_build_array(replacement)) then
      result := jsonb_set(result, '{pins}', result->'pins' || jsonb_build_array(replacement));
    end if;
  end loop;

  for edit in select value from jsonb_array_elements_text(coalesce(data->'userEdited', '[]'::jsonb)) loop
    if left(edit, 4) = 'set:' then
      old_set := substring(edit from 5);
      if old_set = 'appliances.serial' then
        replacement := to_jsonb('appliances.appliance:common.serialNumber'::text);
      elsif old_set = 'appliances.waterFilter' then
        replacement := to_jsonb('appliances.consumables:appliances.waterFilterModel'::text);
      elsif old_set = 'appliances.descaling' then
        replacement := to_jsonb('appliances.cleaning:appliances.descalingInterval'::text);
      elsif old_set = 'vehicles.distanceMaintenance' then
        replacement := to_jsonb('vehicles.maintenance:vehicles.serviceMileageInterval'::text);
      elsif old_set = 'appliances.recess' then
        foreach field_id in array array['appliances.requiredRecessWidth',
          'appliances.requiredRecessHeight', 'appliances.requiredRecessDepth'] loop
          new_key := 'appliances.installation:' || field_id;
          if not (result->'userEdited' ? new_key) then
            result := jsonb_set(result, '{userEdited}', result->'userEdited' || to_jsonb(new_key));
          end if;
        end loop;
        continue;
      else
        replacement := to_jsonb('set:' || pg_temp.registry_set_target(old_set));
      end if;
    elsif position(':' in edit) > 0 and left(edit, 6) <> 'local:' then
      old_set := split_part(edit, ':', 1);
      field_id := substring(edit from length(old_set) + 2);
      replacement := coalesce(redirects->edit,
        to_jsonb(case when old_set = '' then edit
          else pg_temp.registry_set_target(old_set, field_id) || ':' || field_id end));
      if jsonb_typeof(replacement) = 'object' then
        replacement := to_jsonb('local:' || (replacement->>'customFieldId'));
      end if;
    else
      replacement := to_jsonb(edit);
    end if;
    if not (result->'userEdited' @> jsonb_build_array(replacement)) then
      result := jsonb_set(result, '{userEdited}', result->'userEdited' || jsonb_build_array(replacement));
    end if;
  end loop;

  if result->'setIds' ?| array['appliances.bsh', 'appliances.fridge',
    'appliances.spaceCooling'] and not (result->'setIds' ? 'appliances.appliance') then
    result := jsonb_set(result, '{setIds}', result->'setIds' || '"appliances.appliance"'::jsonb);
  end if;
  if result->'setIds' ?| array['devices.lens', 'devices.recording']
    and not (result->'setIds' ? 'devices.device') then
    result := jsonb_set(result, '{setIds}', result->'setIds' || '"devices.device"'::jsonb);
  end if;
  if not (data ? 'userEdited') and result->'userEdited' = '[]'::jsonb then
    result := result - 'userEdited';
  end if;
  return result;
end;
$$;

do $$
declare thing record; migrated jsonb;
begin
  if exists (select 1 from bt.field_sets where id = 'appliances.refrigerant') then
    for thing in select id, data from bt.things for update loop
      migrated := pg_temp.migrate_registry_thing(thing.data);
      if migrated is distinct from thing.data then
        update bt.things set data = migrated, revision = revision + 1 where id = thing.id;
      end if;
    end loop;
  end if;
end;
$$;

-- Saved import checkpoints and document targets can resume with the revised set IDs.
create or replace function pg_temp.remap_registry_checkpoint(payload jsonb) returns jsonb language plpgsql as $$
declare
  result jsonb;
  key text;
  value jsonb;
  item jsonb;
  set_id text;
  target text;
  mapped text;
begin
  if jsonb_typeof(payload) = 'array' then
    result := '[]'::jsonb;
    for item in select elements.item from jsonb_array_elements(payload) as elements(item) loop
      result := result || jsonb_build_array(pg_temp.remap_registry_checkpoint(item));
    end loop;
    return result;
  end if;
  if jsonb_typeof(payload) <> 'object' then return payload; end if;
  result := '{}'::jsonb;
  for key, value in select * from jsonb_each(payload) loop
    if key = 'setIds' and jsonb_typeof(value) = 'array' then
      result := jsonb_set(result, array[key], '[]'::jsonb);
      for set_id in select jsonb_array_elements_text(value) loop
        mapped := pg_temp.registry_set_target(set_id);
        if not (result->key ? mapped) then
          result := jsonb_set(result, array[key], result->key || to_jsonb(mapped));
        end if;
      end loop;
    elsif key = 'targetKeys' and jsonb_typeof(value) = 'array' then
      result := jsonb_set(result, array[key], '[]'::jsonb);
      for target in select jsonb_array_elements_text(value) loop
        if position(':' in target) > 1 then
          mapped := pg_temp.registry_set_target(split_part(target, ':', 1),
            substring(target from position(':' in target) + 1)) ||
            substring(target from position(':' in target));
        else mapped := target;
        end if;
        if not (result->key ? mapped) then
          result := jsonb_set(result, array[key], result->key || to_jsonb(mapped));
        end if;
      end loop;
    else
      result := jsonb_set(result, array[key], pg_temp.remap_registry_checkpoint(value));
    end if;
  end loop;
  if jsonb_typeof(result->'fieldSetId') = 'string' then
    result := jsonb_set(result, '{fieldSetId}', to_jsonb(pg_temp.registry_set_target(
      result->>'fieldSetId', result->>'fieldId')));
  end if;
  if result ? 'setIds' and result ? 'batches' and exists (
    select 1 from jsonb_array_elements(result->'batches') batch
    cross join lateral jsonb_array_elements(coalesce(batch->'values', '[]'::jsonb)) field
    where field->>'fieldSetId' = 'devices.recording'
  ) and not (result->'setIds' ? 'devices.recording') then
    result := jsonb_set(result, '{setIds}', result->'setIds' || '"devices.recording"'::jsonb);
  end if;
  return result;
end;
$$;

update bt.imports set extraction = pg_temp.remap_registry_checkpoint(extraction)
where extraction is not null
  and exists (select 1 from bt.field_sets where id = 'appliances.refrigerant');
update bt.import_targets set discovery = pg_temp.remap_registry_checkpoint(discovery)
where discovery is not null
  and exists (select 1 from bt.field_sets where id = 'appliances.refrigerant');

delete from bt.field_sets where id in (
  'appliances.serial', 'appliances.bosch', 'appliances.neff', 'appliances.siemens',
  'appliances.recess', 'appliances.refrigeration', 'appliances.waterFilter',
  'appliances.refrigerant', 'appliances.descaling', 'vehicles.distanceMaintenance'
);
