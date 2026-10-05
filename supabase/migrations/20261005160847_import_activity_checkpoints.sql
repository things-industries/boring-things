-- Each import activity operation records completion and warnings independently.
alter table bt.import_targets
  add column task_suggestions jsonb,
  add column purchasable_suggestions jsonb;
