-- ─────────────────────────────────────────────────────
-- 028: Trunk Show sales logger (Melbourne event)
-- ─────────────────────────────────────────────────────

create table if not exists trunk_show_sales (
  id               uuid default gen_random_uuid() primary key,
  customer_name    text not null,
  customer_phone   text,
  customer_email   text,
  sku              text,
  item_description text not null,
  sale_type        text check (sale_type in ('full_sale', 'deposit')) default 'full_sale',
  payment_method   text check (payment_method in (
    'cash', 'visa', 'mastercard', 'amex', 'eftpos', 'bank_transfer'
  )),
  payment_amount   numeric not null,
  balance_owing    numeric default 0,
  notes            text,
  created_by       uuid references auth.users(id),
  created_at       timestamptz not null default now()
);

alter table trunk_show_sales enable row level security;

drop policy if exists "Auth read trunk show"  on trunk_show_sales;
drop policy if exists "Auth write trunk show" on trunk_show_sales;

create policy "Auth read trunk show"
  on trunk_show_sales for select
  using (auth.role() = 'authenticated');

create policy "Auth write trunk show"
  on trunk_show_sales for all
  using (auth.role() = 'authenticated');
