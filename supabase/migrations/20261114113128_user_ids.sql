-- cspell:words fkey idx errcode

-- Rename account references in place; PostgreSQL updates dependent constraint and index definitions.
alter table bt.attachments rename column owner_id to user_id;
alter table bt.conversations rename column owner_id to user_id;
alter table bt.events rename column owner_id to user_id;
alter table bt.import_sources rename column owner_id to user_id;
alter table bt.imports rename column owner_id to user_id;
alter table bt.issues rename column owner_id to user_id;
alter table bt.purchasables rename column owner_id to user_id;
alter table bt.tags rename column owner_id to user_id;
alter table bt.tasks rename column owner_id to user_id;
alter table bt.thing_attachments rename column owner_id to user_id;
alter table bt.thing_fields rename column owner_id to user_id;
alter table bt.thing_tags rename column owner_id to user_id;
alter table bt.things rename column owner_id to user_id;

-- Rename the constraint and index labels for the same account references.
alter table bt.attachments rename constraint attachments_id_owner_id_key to attachments_id_user_id_key;
alter table bt.attachments rename constraint attachments_owner_id_fkey to attachments_user_id_fkey;
alter table bt.conversations rename constraint conversations_id_owner_id_key to conversations_id_user_id_key;
alter table bt.conversations rename constraint conversations_owner_id_fkey to conversations_user_id_fkey;
alter table bt.conversations rename constraint conversations_thing_id_owner_id_fkey to conversations_thing_id_user_id_fkey;
alter table bt.events rename constraint events_issue_id_thing_id_owner_id_fkey to events_issue_id_thing_id_user_id_fkey;
alter table bt.events rename constraint events_owner_id_fkey to events_user_id_fkey;
alter table bt.events rename constraint events_thing_id_owner_id_fkey to events_thing_id_user_id_fkey;
alter table bt.import_sources rename constraint import_sources_import_id_owner_id_fkey to import_sources_import_id_user_id_fkey;
alter table bt.imports rename constraint imports_owner_id_fkey to imports_user_id_fkey;
alter table bt.imports rename constraint imports_owner_identity to imports_id_user_id_key;
alter table bt.imports rename constraint imports_target_thing_id_owner_id_fkey to imports_target_thing_id_user_id_fkey;
alter table bt.issues rename constraint issues_id_thing_id_owner_id_key to issues_id_thing_id_user_id_key;
alter table bt.issues rename constraint issues_owner_id_fkey to issues_user_id_fkey;
alter table bt.issues rename constraint issues_thing_id_owner_id_fkey to issues_thing_id_user_id_fkey;
alter table bt.purchasables rename constraint purchasables_owner_id_fkey to purchasables_user_id_fkey;
alter table bt.purchasables rename constraint purchasables_thing_id_owner_id_fkey to purchasables_thing_id_user_id_fkey;
alter table bt.tags rename constraint tags_id_owner_id_key to tags_id_user_id_key;
alter table bt.tags rename constraint tags_owner_id_fkey to tags_user_id_fkey;
alter table bt.tags rename constraint tags_owner_id_name_key to tags_user_id_name_key;
alter table bt.tasks rename constraint tasks_issue_id_thing_id_owner_id_fkey to tasks_issue_id_thing_id_user_id_fkey;
alter table bt.tasks rename constraint tasks_owner_id_fkey to tasks_user_id_fkey;
alter table bt.tasks rename constraint tasks_thing_id_owner_id_fkey to tasks_thing_id_user_id_fkey;
alter table bt.thing_attachments rename constraint thing_attachments_thing_id_owner_id_fkey to thing_attachments_thing_id_user_id_fkey;
alter table bt.thing_fields rename constraint thing_fields_thing_id_owner_id_fkey to thing_fields_thing_id_user_id_fkey;
alter table bt.thing_tags rename constraint thing_tags_tag_id_owner_id_fkey to thing_tags_tag_id_user_id_fkey;
alter table bt.thing_tags rename constraint thing_tags_thing_id_owner_id_fkey to thing_tags_thing_id_user_id_fkey;
alter table bt.things rename constraint things_id_owner_id_key to things_id_user_id_key;
alter table bt.things rename constraint things_owner_id_fkey to things_user_id_fkey;

alter index bt.imports_owner_id_status_idx rename to imports_user_id_status_idx;
alter index bt.tasks_owner_id_status_scheduled_on_id_idx rename to tasks_user_id_status_scheduled_on_id_idx;
alter index bt.thing_fields_owner_identifier rename to thing_fields_user_identifier;
alter index bt.things_owner_id_access_count_last_viewed_at_id_idx rename to things_user_id_access_count_last_viewed_at_id_idx;
alter index bt.things_owner_id_category_id_updated_at_idx rename to things_user_id_category_id_updated_at_idx;
alter index bt.things_owner_id_last_viewed_at_id_idx rename to things_user_id_last_viewed_at_id_idx;

-- Trigger bodies refer to column names directly.
alter function bt.validate_attachment_link_owner() rename to validate_attachment_link_user;
create or replace function bt.validate_attachment_link_user() returns trigger language plpgsql as $$
begin
  if new.attachment_id is not null and not exists (
    select 1 from bt.attachments
    where id = new.attachment_id and (user_id = new.user_id or user_id is null)
  ) then
    raise exception 'Attachment belongs to another user' using errcode = '23514';
  end if;
  return new;
end $$;

alter trigger attachment_link_owner on bt.thing_attachments rename to attachment_link_user;
alter trigger import_attachment_owner on bt.imports rename to import_attachment_user;
alter trigger import_source_owner on bt.import_sources rename to import_source_user;
