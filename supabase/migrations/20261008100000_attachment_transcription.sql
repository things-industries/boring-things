-- Store reusable readable content on its source and recover text from earlier Imports.
alter table bt.attachments
  add column transcription text,
  add column transcription_summary text,
  add column transcription_terms jsonb not null default '[]'::jsonb
    check (jsonb_typeof(transcription_terms) = 'array'),
  add column transcription_status text not null default 'PENDING'
    check (transcription_status in ('PENDING','PROCESSING','COMPLETE','EMPTY','PARTIAL','SKIPPED','FAILED','INSUFFICIENT_LANGUAGE')),
  add column transcription_completed_at timestamptz;

with latest as (
  select distinct on (attachment_id) attachment_id, extraction->>'text' as text
  from bt.imports
  where jsonb_typeof(extraction) = 'object' and extraction ? 'text'
  order by attachment_id, (length(extraction->>'text') > 0) desc, created_at desc
)
update bt.attachments a
set transcription = latest.text,
    transcription_status = case when length(latest.text) > 0 then 'COMPLETE' else 'EMPTY' end,
    transcription_completed_at = now()
from latest
where a.id = latest.attachment_id;
