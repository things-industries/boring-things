alter table bt.field_sets
  add column recommendation_suggestions jsonb not null
    default '{"tasks":[],"purchasables":[]}'::jsonb,
  add constraint field_sets_recommendation_suggestions_shape check (
    jsonb_typeof(recommendation_suggestions) = 'object'
    and jsonb_typeof(recommendation_suggestions -> 'tasks') is not distinct from 'array'
    and jsonb_typeof(recommendation_suggestions -> 'purchasables') is not distinct from 'array'
  );
