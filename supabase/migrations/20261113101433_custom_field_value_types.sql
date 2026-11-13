-- Use the Gregorian calendar to distinguish full dates from date-shaped text.
create function bt.is_calendar_date(value text) returns boolean
language sql immutable strict
return length(value) = 10 and value ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
  and pg_input_is_valid(
    case when left(value, 4) = '0000' then '2000' || substr(value, 5) else value end,
    'date'
  );

-- Older app processes can still write during deployment.
create function bt.set_custom_field_value_type() returns trigger language plpgsql as $$
begin
  new.custom_definition := new.custom_definition || jsonb_build_object(
    'valueType', case jsonb_typeof(new.value)
      when 'number' then 'NUMBER'
      when 'boolean' then 'BOOLEAN'
      when 'object' then 'MONEY'
      when 'string' then case when bt.is_calendar_date(new.value #>> '{}')
        then 'DATE' else 'STRING' end
      else 'STRING'
    end
  );
  return new;
end
$$;

create trigger set_custom_field_value_type before insert or update of custom_definition
on bt.thing_fields for each row
when (new.custom_definition is not null and new.custom_definition->>'valueType' is null)
execute function bt.set_custom_field_value_type();

-- Report counts in the database log because the migration CLI suppresses notices.
do $$
declare
  invalid_registry_dates bigint;
  invalid_custom_dates bigint;
begin
  select count(*) into invalid_registry_dates
  from bt.thing_fields f join bt.field_definitions d on d.id = f.field_id
  where f.value is not null and d.schema->>'format' = 'date'
    and not bt.is_calendar_date(f.value #>> '{}');
  select count(*) into invalid_custom_dates from bt.thing_fields
  where custom_definition is not null and value is not null
    and not bt.is_calendar_date(value #>> '{}')
    and (custom_definition->>'valueType' = 'DATE'
      or (custom_definition->>'valueType' is null
        and value #>> '{}' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'));
  if invalid_registry_dates + invalid_custom_dates > 0 then
    raise log 'Invalid legacy Thing dates: % registry values and % custom values',
      invalid_registry_dates, invalid_custom_dates;
  end if;
end
$$;

update bt.thing_fields
set custom_definition = custom_definition - 'valueType'
where custom_definition is not null and (
  custom_definition->>'valueType' is null
  or (custom_definition->>'valueType' = 'DATE' and value is not null
    and not bt.is_calendar_date(value #>> '{}'))
);
