alter table public.restaurants
    add column if not exists square_refresh_token text,
    add column if not exists square_token_expires_at timestamptz;

comment on column public.restaurants.square_refresh_token is
    'Square OAuth refresh token. Restrict this column to trusted server-side access.';
