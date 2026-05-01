-- ============================================================
-- Migration: add_numero_serie_to_produtos
-- Data: 2026-05-01
-- Objetivo: adicionar identificador serial ao produto (Funko #89,
--           HQ Vol. 5, Card set, etc.) e documentar a mudança
--           semântica da coluna foto (base64 → URL do Storage).
--
-- Coluna foto: NÃO é alterada estruturalmente. Continua text nullable.
-- O conteúdo passa a ser URL pública do bucket Supabase Storage
-- "produtos" (introduzido no PR #1 — harden RLS + split assets).
-- ============================================================

-- 1) Nova coluna numero_serie
ALTER TABLE public.produtos ADD COLUMN numero_serie text;

COMMENT ON COLUMN public.produtos.numero_serie IS 'Identificador serial do produto: número do Funko, volume da HQ, set do card, etc.';

-- 2) Documenta mudança semântica da coluna foto
COMMENT ON COLUMN public.produtos.foto IS 'URL pública da imagem no bucket Supabase Storage "produtos". Antes desta migration era base64 inline.';
