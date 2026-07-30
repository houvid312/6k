-- 042_user_roles_security.sql
-- Expande el enum de roles de usuario (debe ejecutarse y comprometerse primero).

ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'GERENTE';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'ADMIN_LOCAL';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'PREPARADOR';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'RODY';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'VENDEDOR';
