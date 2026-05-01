-- ============================================================
-- Migration (OPCIONAL — defesa em profundidade): block_non_admin_signups
-- Data: 2026-04-30
-- Objetivo: bloquear no nível do auth.users qualquer signup cujo
--           e-mail não esteja em public.admins com ativo=true.
--
-- Por que opcional:
--   A migration anterior (harden_rls_admin_only) já contém o dano:
--   mesmo que um não-admin consiga logar, ele não enxerga nada.
--   Esta migration impede até que o usuário seja criado em auth.users
--   — útil para reduzir lixo na base e evitar surpresas futuras.
--
-- Reverter:
--   DROP TRIGGER IF EXISTS on_auth_user_created_check_admin ON auth.users;
--   DROP FUNCTION IF EXISTS public.deny_non_admin_signup();
-- ============================================================

CREATE OR REPLACE FUNCTION public.deny_non_admin_signup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.admins
    WHERE email = NEW.email
      AND ativo = true
  ) THEN
    RAISE EXCEPTION 'Acesso negado: e-mail % não autorizado', NEW.email
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_check_admin ON auth.users;
CREATE TRIGGER on_auth_user_created_check_admin
  BEFORE INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.deny_non_admin_signup();
