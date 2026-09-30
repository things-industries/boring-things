alter table bt.field_definitions
  add column icon text check (length(icon) <= 80 and icon ~ '^[A-Za-z][A-Za-z0-9]*$');
