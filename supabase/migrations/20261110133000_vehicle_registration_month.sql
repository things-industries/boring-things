-- First registration values use month precision while keeping their occurrence metadata.
update bt.thing_fields
set value = to_jsonb(left(value #>> '{}', 7))
where field_id = 'vehicles.firstRegistered'
  and jsonb_typeof(value) = 'string'
  and value #>> '{}' ~ '^[0-9]{4}-(0[1-9]|1[0-2])-[0-9]{2}$';

update bt.field_definitions
set schema = '{"type":"string","pattern":"^[0-9]{4}-(0[1-9]|1[0-2])$","minLength":7,"maxLength":7}',
    ui_hint = 'TEXT',
    description = 'Month and year of first registration, formatted YYYY-MM.'
where id = 'vehicles.firstRegistered';
