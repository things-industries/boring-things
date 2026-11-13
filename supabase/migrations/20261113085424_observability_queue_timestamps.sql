-- Record each queue entry separately from record creation and import source waiting.
alter table bt.imports add column queued_at timestamptz;
alter table bt.imports add column source_wait_started_at timestamptz;
alter table bt.attachments add column transcription_queued_at timestamptz;
alter table bt.attachments alter column transcription_queued_at set default now();
alter table bt.messages add column queued_at timestamptz;
alter table bt.messages alter column queued_at set default now();
