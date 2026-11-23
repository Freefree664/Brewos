-- BrewOS owner onboarding: create a cafe, owner membership and first branch atomically.
create or replace function public.create_cafe_with_owner(
  p_name text,
  p_slug text,
  p_description text default null,
  p_contact_phone text default null,
  p_branch_name text default 'Main Branch',
  p_address text default null
)
returns table(cafe_id uuid, branch_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_cafe_id uuid;
  v_branch_id uuid;
  v_name text := btrim(coalesce(p_name, ''));
  v_slug text := lower(btrim(coalesce(p_slug, '')));
  v_branch_name text := btrim(coalesce(p_branch_name, ''));
begin
  if v_user_id is null then
    raise exception 'You must be signed in to create a restaurant.';
  end if;
  if length(v_name) < 2 or length(v_name) > 100 then
    raise exception 'Restaurant name must be between 2 and 100 characters.';
  end if;
  if v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or length(v_slug) > 60 then
    raise exception 'Use a web address with lowercase letters, numbers and hyphens.';
  end if;
  if v_branch_name = '' then
    v_branch_name := 'Main Branch';
  end if;
  if length(v_branch_name) > 100 then
    raise exception 'Branch name must be 100 characters or fewer.';
  end if;

  insert into public.cafes(name, slug, description, contact_phone, created_by)
  values (v_name, v_slug, nullif(btrim(coalesce(p_description, '')), ''),
          nullif(btrim(coalesce(p_contact_phone, '')), ''), v_user_id)
  returning id into v_cafe_id;

  insert into public.cafe_memberships(cafe_id, user_id, role, active)
  values (v_cafe_id, v_user_id, 'owner', true);

  insert into public.branches(cafe_id, name, address, phone)
  values (v_cafe_id, v_branch_name, nullif(btrim(coalesce(p_address, '')), ''),
          nullif(btrim(coalesce(p_contact_phone, '')), ''))
  returning id into v_branch_id;

  return query select v_cafe_id, v_branch_id;
end;
$$;

revoke all on function public.create_cafe_with_owner(text,text,text,text,text,text) from public;
grant execute on function public.create_cafe_with_owner(text,text,text,text,text,text) to authenticated;
