-- ============================================================
-- Migration: harden_rls_admin_only
-- Data: 2026-04-30
-- Objetivo: corrigir o vetor crítico em que qualquer conta Google
--           autenticada (mesmo não-admin) tinha acesso a admins
--           e reservas via SDK + anon key.
--
-- Estratégia:
--   1. Função is_admin() consulta a tabela admins via SECURITY DEFINER
--   2. Policies passam a exigir is_admin() em vez de auth.role()
--   3. INSERT direto em reservas é bloqueado: tudo passa pela RPC
--      criar_reserva (SECURITY DEFINER, já existente)
--   4. produtos.read continua público (catálogo)
--   5. admins.ativo vira NOT NULL DEFAULT true
--
-- Compatibilidade pública:
--   - GET produtos                  → produtos_read (true)         OK
--   - POST reserva (criar_reserva)  → SECURITY DEFINER bypassa RLS OK
--   - DELETE reserva (cancelar_..)  → SECURITY DEFINER bypassa RLS OK
--   - GET reservas (buscar_..)      → SECURITY DEFINER bypassa RLS OK
-- ============================================================

-- 1) Helper: is_admin()
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.admins
    WHERE email = (auth.jwt() ->> 'email')
      AND ativo = true
  );
$$;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- 2) admins.ativo: NOT NULL com default true
UPDATE public.admins SET ativo = true WHERE ativo IS NULL;
ALTER TABLE public.admins ALTER COLUMN ativo SET DEFAULT true;
ALTER TABLE public.admins ALTER COLUMN ativo SET NOT NULL;

-- 3) Policies: tabela admins
DROP POLICY IF EXISTS admins_read ON public.admins;
CREATE POLICY admins_read ON public.admins
  FOR SELECT TO authenticated
  USING (public.is_admin());

-- 4) Policies: tabela reservas
DROP POLICY IF EXISTS reservas_read ON public.reservas;
CREATE POLICY reservas_read ON public.reservas
  FOR SELECT TO authenticated
  USING (public.is_admin());

-- INSERT direto bloqueado: público usa RPC criar_reserva (SECURITY DEFINER)
DROP POLICY IF EXISTS reservas_insert ON public.reservas;
CREATE POLICY reservas_insert ON public.reservas
  FOR INSERT TO authenticated
  WITH CHECK (false);

DROP POLICY IF EXISTS reservas_update ON public.reservas;
CREATE POLICY reservas_update ON public.reservas
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS reservas_delete ON public.reservas;
CREATE POLICY reservas_delete ON public.reservas
  FOR DELETE TO authenticated
  USING (public.is_admin());

-- 5) Policies: tabela produtos
-- read continua public (catálogo da loja)
DROP POLICY IF EXISTS produtos_insert ON public.produtos;
CREATE POLICY produtos_insert ON public.produtos
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS produtos_update ON public.produtos;
CREATE POLICY produtos_update ON public.produtos
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS produtos_delete ON public.produtos;
CREATE POLICY produtos_delete ON public.produtos
  FOR DELETE TO authenticated
  USING (public.is_admin());
