-- size is deprecated in favor of format_id/format_name, make it nullable
ALTER TABLE sale_items ALTER COLUMN size DROP NOT NULL;
ALTER TABLE sale_items ALTER COLUMN size SET DEFAULT NULL;
