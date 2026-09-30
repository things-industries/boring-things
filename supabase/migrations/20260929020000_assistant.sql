alter table bt.messages add column intent text not null default 'answer'
  check(intent in ('answer','create_event','create_issue'));
-- The conversation row serialises enqueue/retry; this also protects other writers.
create unique index messages_one_inflight on bt.messages(conversation_id)
  where role='assistant' and status in ('queued','processing');
