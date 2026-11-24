-- Remove legacy policy names created by the first live application of migration 0005.
-- The replacement owner-only policies remain in place.
drop policy if exists "Cafe managers upload BrewOS menu images" on storage.objects;
drop policy if exists "Cafe managers update BrewOS menu images" on storage.objects;
drop policy if exists "Cafe managers delete BrewOS menu images" on storage.objects;
