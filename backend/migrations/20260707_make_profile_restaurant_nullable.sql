alter table public.profiles
    alter column restaurant_id drop not null;

comment on column public.profiles.restaurant_id is
    'Nullable until the user connects Square and a restaurant row is created.';
