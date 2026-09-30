create type bt.attachment_document_type as enum (
  'MANUAL', 'RECEIPT', 'INVOICE', 'INSTALLATION_GUIDE', 'SPECIFICATION', 'OTHER'
);

alter table bt.attachments
  add column title text check (length(btrim(title)) between 1 and 200),
  add column document_type bt.attachment_document_type,
  add column publisher text check (length(btrim(publisher)) between 1 and 200),
  add column document_date date,
  add column page_count integer check (page_count > 0),
  add column metadata_sources jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata_sources) = 'object'),
  add constraint attachment_pdf_page_count check (page_count is null or media_type = 'application/pdf');
