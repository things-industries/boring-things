-- Rename custom-field addresses without changing values, evidence or retry receipts.
create function pg_temp.custom_field_address(item jsonb) returns jsonb
language sql immutable as $$
  select case when item ? 'undefinedFieldId'
    then (item - 'undefinedFieldId') || jsonb_build_object('customFieldId', item->'undefinedFieldId')
    else item end;
$$;

create function pg_temp.custom_field_addresses(items jsonb) returns jsonb
language sql immutable as $$
  select coalesce(jsonb_agg(pg_temp.custom_field_address(item) order by position), '[]'::jsonb)
  from jsonb_array_elements(items) with ordinality as entries(item, position);
$$;

update bt.things set
  data = (data - 'undefinedFields') || jsonb_build_object(
    'customFields', coalesce(data->'customFields', data->'undefinedFields', '[]'::jsonb),
    'pins', pg_temp.custom_field_addresses(data->'pins')
  ),
  revision = revision + 1
where data ? 'undefinedFields' or exists (
  select 1 from jsonb_array_elements(data->'pins') as pin where pin ? 'undefinedFieldId'
);

alter table bt.things alter column data set default
  '{"setIds":[],"values":{},"standalone":{},"customFields":[],"pins":[]}';

update bt.messages set
  cards = pg_temp.custom_field_addresses(cards),
  tool_results = (
    select coalesce(jsonb_agg(
      case when receipt ? 'card'
        then jsonb_set(receipt, '{card}', pg_temp.custom_field_address(receipt->'card'))
        else receipt end order by position
    ), '[]'::jsonb)
    from jsonb_array_elements(tool_results) with ordinality as receipts(receipt, position)
  )
where exists (select 1 from jsonb_array_elements(cards) as card where card ? 'undefinedFieldId')
  or exists (
    select 1 from jsonb_array_elements(tool_results) as receipt
    where receipt->'card' ? 'undefinedFieldId'
  );

drop function pg_temp.custom_field_addresses(jsonb);
drop function pg_temp.custom_field_address(jsonb);
