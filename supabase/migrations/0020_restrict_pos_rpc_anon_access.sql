-- Explicitly remove anonymous execution from privileged POS bill creation.
revoke all on function public.create_pos_order_v2(uuid,uuid,public.order_type,text,text,jsonb,integer,text) from public,anon;
grant execute on function public.create_pos_order_v2(uuid,uuid,public.order_type,text,text,jsonb,integer,text) to authenticated;
