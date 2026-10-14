-- Cancelamento pelo próprio administrador: a assinatura para de cobrar na
-- hora, mas o acesso continua até o fim do período já pago. A rotina diária
-- de cobrança encerra a conta quando essa data passa.
alter table public.organizations add column cancel_at timestamptz;
