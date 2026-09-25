-- POS Slice 1: session, cash sale, receipt lines.
--
-- staff_id references profiles(id). That is the live staff foreign key
-- (inventory_sales.staff_id → profiles). There is no separate staff table.
--
-- variance is written when the session closes:
--   actual_cash_count − (expected_cash_float + cash sales in the session).
-- It is not a generated column — expected cash includes sales, which are
-- rows on pos_transactions, not a column on the session.
--
-- payment_method / payment_status use the locked spec values. Slice 1 only
-- writes cash + paid. Other methods stay unused until a later slice.
--
-- piece_id → inventory_pieces is required. product_id is optional.

CREATE TABLE IF NOT EXISTS public.pos_sessions (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid        NOT NULL REFERENCES public.tenants(id),
  staff_id             uuid        NOT NULL REFERENCES public.profiles(id),
  opened_at            timestamptz NOT NULL DEFAULT now(),
  closed_at            timestamptz,
  expected_cash_float  numeric     NOT NULL,
  actual_cash_count    numeric,
  variance             numeric,
  notes                text
);

CREATE TABLE IF NOT EXISTS public.pos_transactions (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  pos_session_id   uuid        NOT NULL REFERENCES public.pos_sessions(id),
  tenant_id        uuid        NOT NULL REFERENCES public.tenants(id),
  customer_id      uuid        REFERENCES public.customers(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  subtotal         numeric     NOT NULL,
  discount         numeric,
  tax              numeric     NOT NULL DEFAULT 0,
  total            numeric     NOT NULL,
  payment_method   text        NOT NULL,
  payment_status   text        NOT NULL,
  receipt_number   text        NOT NULL
);

CREATE TABLE IF NOT EXISTS public.pos_transaction_items (
  id                     uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  pos_transaction_id     uuid    NOT NULL REFERENCES public.pos_transactions(id),
  tenant_id              uuid    NOT NULL REFERENCES public.tenants(id),
  piece_id               uuid    NOT NULL REFERENCES public.inventory_pieces(id),
  product_id             uuid    REFERENCES public.inventory_products(id),
  quantity               integer NOT NULL,
  unit_price             numeric NOT NULL,
  line_total             numeric NOT NULL,
  custom_price_override  boolean NOT NULL DEFAULT false,
  notes                  text
);

-- tenant_id is not in the locked column list. It is here so line items use
-- the same tenant_isolation policy and tenantScoped() insert as every other
-- tenant table. piece_id remains required.

ALTER TABLE public.pos_transactions DROP CONSTRAINT IF EXISTS pos_transactions_payment_method_check;
ALTER TABLE public.pos_transactions
  ADD CONSTRAINT pos_transactions_payment_method_check
  CHECK (payment_method IN ('card', 'cash', 'bank_transfer', 'gift_card', 'customer_account', 'layby'));

ALTER TABLE public.pos_transactions DROP CONSTRAINT IF EXISTS pos_transactions_payment_status_check;
ALTER TABLE public.pos_transactions
  ADD CONSTRAINT pos_transactions_payment_status_check
  CHECK (payment_status IN ('pending', 'paid', 'failed'));

ALTER TABLE public.pos_transaction_items DROP CONSTRAINT IF EXISTS pos_transaction_items_quantity_check;
ALTER TABLE public.pos_transaction_items
  ADD CONSTRAINT pos_transaction_items_quantity_check
  CHECK (quantity > 0);

CREATE UNIQUE INDEX IF NOT EXISTS pos_transactions_receipt_number_key
  ON public.pos_transactions (receipt_number);

CREATE INDEX IF NOT EXISTS pos_sessions_tenant_open_idx
  ON public.pos_sessions (tenant_id, staff_id, closed_at);

CREATE INDEX IF NOT EXISTS pos_transactions_session_idx
  ON public.pos_transactions (pos_session_id);

CREATE INDEX IF NOT EXISTS pos_transactions_tenant_idx
  ON public.pos_transactions (tenant_id);

CREATE INDEX IF NOT EXISTS pos_transaction_items_txn_idx
  ON public.pos_transaction_items (pos_transaction_id);

CREATE INDEX IF NOT EXISTS pos_transaction_items_piece_idx
  ON public.pos_transaction_items (piece_id);

ALTER TABLE public.pos_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_transaction_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_isolation" ON public.pos_sessions;
CREATE POLICY "tenant_isolation" ON public.pos_sessions
  FOR ALL USING (tenant_id = public.current_tenant_id());

DROP POLICY IF EXISTS "tenant_isolation" ON public.pos_transactions;
CREATE POLICY "tenant_isolation" ON public.pos_transactions
  FOR ALL USING (tenant_id = public.current_tenant_id());

DROP POLICY IF EXISTS "tenant_isolation" ON public.pos_transaction_items;
CREATE POLICY "tenant_isolation" ON public.pos_transaction_items
  FOR ALL USING (tenant_id = public.current_tenant_id());

-- Receipt numbers follow daily_counters (CA- / QT- / ON-).
ALTER TABLE public.daily_counters
  ADD COLUMN IF NOT EXISTS pos_receipt_count integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.increment_pos_receipt_counter(input_date date, input_tenant_id uuid)
RETURNS integer
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  new_count integer;
BEGIN
  INSERT INTO public.daily_counters (date, tenant_id, packet_count, pos_receipt_count)
  VALUES (input_date, input_tenant_id, 0, 1)
  ON CONFLICT (date, tenant_id) DO UPDATE
    SET pos_receipt_count = COALESCE(public.daily_counters.pos_receipt_count, 0) + 1
  RETURNING pos_receipt_count INTO new_count;

  RETURN new_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.increment_pos_receipt_counter(date, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_pos_receipt_counter(date, uuid) TO service_role;
