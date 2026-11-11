-- Existing recurrence records keep their current fixed calendar cadence.
update bt.tasks set recurrence=recurrence || '{"from":"DEADLINE"}'::jsonb
where recurrence is not null and not recurrence ? 'from';
