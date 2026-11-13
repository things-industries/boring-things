-- Convert known country names and aliases while keeping each value's provenance.
with country_aliases(code, aliases) as (
  values
    ('GB', array['gb', 'gbr', 'uk', 'united kingdom', 'great britain',
      'england', 'scotland', 'wales', 'northern ireland']),
    ('PT', array['pt', 'portugal'])
)
update bt.thing_fields f
set value = to_jsonb(c.code)
from country_aliases c
where f.field_id in ('household.country', 'vehicles.registrationCountry')
  and jsonb_typeof(f.value) = 'string'
  and lower(btrim(f.value #>> '{}')) = any(c.aliases)
  and f.value is distinct from to_jsonb(c.code);
