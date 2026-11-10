-- Tasks and Events record chat followups after the first owner message.
alter table bt.tasks drop column completion_actions;
alter table bt.events drop column completion_actions;
alter table bt.events add column completed_followup jsonb;
alter table bt.events add constraint events_followup_closed_check
  check (completed_followup is null or status='CLOSED');

-- Keep historical followup timestamps, linking saved chat conversations when present.
update bt.tasks t set completed_followup=jsonb_build_object(
  'completedAt', t.completed_followup->'completedAt',
  'conversationId', case when t.completed_followup->'action'->>'type'='CHAT' then (
    select c.id from bt.conversations c
    where c.owner_id=t.owner_id and c.activity_context->'item'->>'id'=t.id::text
      and c.created_at <= (t.completed_followup->>'completedAt')::timestamptz
    order by c.created_at desc,c.id limit 1
  ) else null end
) where t.completed_followup is not null;

update bt.conversations c set activity_context=
  jsonb_set(c.activity_context,'{item}',(c.activity_context->'item')-'completionActions'-'completedFollowup')
  || jsonb_build_object('followup',exists(
    select 1 from bt.tasks t where t.owner_id=c.owner_id
      and t.completed_followup->>'conversationId'=c.id::text
  ))
where c.activity_context->'item' is not null;
