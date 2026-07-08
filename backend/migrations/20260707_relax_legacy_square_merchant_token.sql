alter table public.restaurants
    add column if not exists square_merchant_token text;

update public.restaurants
set square_merchant_token = coalesce(square_merchant_token, square_access_token)
where square_merchant_token is null;

alter table public.restaurants
    alter column square_merchant_token drop not null;

comment on column public.restaurants.square_merchant_token is
    'Legacy Square OAuth access token column. Prefer square_access_token for new code.';
