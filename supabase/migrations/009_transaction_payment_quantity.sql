-- Track payment channel and the number of units in a transaction.
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS payment_method text NOT NULL DEFAULT 'Cash';
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS quantity integer NOT NULL DEFAULT 1;
ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_payment_method_check;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_payment_method_check
  CHECK (payment_method IN ('Cash', 'Online'));