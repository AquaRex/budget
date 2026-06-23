-- A label's "home" category. This is what makes a label a cross-channel total:
-- a charge tagged "Path of Exile 2" rolls up under Games in the group view even
-- if it was paid via Klarna or a card that resolves elsewhere. Nullable; when
-- unset the labelled charge falls back to its own resolved category.
--
-- Run AFTER 0012_labels.sql, in the Supabase SQL Editor.

alter table public.labels
  add column if not exists category_id uuid
    references public.categories (id) on delete set null;

notify pgrst, 'reload schema';
