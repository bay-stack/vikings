-- Vikings-only input validation; no saved plays are changed.
begin;
create or replace function public.vikings_save(p_key text,p_id uuid,p_payload jsonb,p_revision integer) returns jsonb language plpgsql security definer set search_path='' as $fn$
declare v_hash bytea; result jsonb; p jsonb;
begin
 if p_key is null or p_key !~ '^[a-f0-9]{64}$' then raise sqlstate 'PT403' using message='Use your private playbook link.'; end if;
 v_hash:=pg_catalog.sha256(pg_catalog.convert_to(p_key,'UTF8'));
 if not exists(select 1 from vikings_private.workspaces where key_hash=v_hash) then raise sqlstate 'PT403' using message='Use your private playbook link.'; end if;
 if p_id is null or p_revision is null or p_revision<0 or p_payload is null or jsonb_typeof(p_payload) is distinct from 'object' or (p_payload->'version') is distinct from '1'::jsonb or jsonb_typeof(p_payload->'title') is distinct from 'string' or length(p_payload->>'title')>70 or jsonb_typeof(p_payload->'plays') is distinct from 'array' or pg_column_size(p_payload)>8000000 then raise sqlstate 'PT400' using message='Invalid or oversized playbook.'; end if;
 if jsonb_array_length(p_payload->'plays')<>24 then raise sqlstate 'PT400' using message='A playbook must contain 24 slots.'; end if;
 for p in select value from jsonb_array_elements(p_payload->'plays') loop
  if jsonb_typeof(p) is distinct from 'object' or jsonb_typeof(p->'number') is distinct from 'string' or length(p->>'number')>4 or jsonb_typeof(p->'name') is distinct from 'string' or length(p->>'name')>38 or coalesce(p->>'color','') !~ '^#[a-fA-F0-9]{6}$' or jsonb_typeof(p->'overlay') is distinct from 'boolean' or not (p ? 'image') then raise sqlstate 'PT400' using message='Invalid play details.'; end if;
  -- Optional for old backups and clients; new clients supply both fields.
  if (p ? 'line2') and (jsonb_typeof(p->'line2') is distinct from 'string' or length(p->>'line2')>38) then raise sqlstate 'PT400' using message='Invalid second banner line.'; end if;
  if (p ? 'imageMode') and (jsonb_typeof(p->'imageMode') is distinct from 'string' or p->>'imageMode' not in ('full','canva-326')) then raise sqlstate 'PT400' using message='Invalid image format.'; end if;
  if p->'image'<>'null'::jsonb then
   if jsonb_typeof(p->'image') is distinct from 'object' or coalesce(p->'image'->>'data','') !~ '^data:image/(png|jpeg);base64,[a-zA-Z0-9+/]+=*$' or length(p->'image'->>'data')>360000 or coalesce(p->'image'->>'width','') !~ '^[0-9]{1,4}$' or coalesce(p->'image'->>'height','') !~ '^[0-9]{1,4}$' then raise sqlstate 'PT400' using message='Invalid play image.'; end if;
   if (p->'image'->>'width')::int not between 1 and 1600 or (p->'image'->>'height')::int not between 1 and 1600 then raise sqlstate 'PT400' using message='Invalid image dimensions.'; end if;
  end if;
 end loop;
 if p_revision=0 then
  perform 1 from vikings_private.workspaces where key_hash=v_hash for update;
  if (select count(*) from vikings_private.playbooks where workspace_hash=v_hash)>=30 then raise sqlstate 'PT400' using message='This workspace is full (30 playbooks). Keep a backup and reuse an existing playbook.'; end if;
  insert into vikings_private.playbooks(workspace_hash,id,payload) values(v_hash,p_id,p_payload) on conflict do nothing
   returning jsonb_build_object('revision',revision,'updated_at',updated_at) into result;
 else
  update vikings_private.playbooks b set payload=p_payload,revision=b.revision+1,updated_at=now()
   where workspace_hash=v_hash and id=p_id and b.revision=p_revision returning jsonb_build_object('revision',b.revision,'updated_at',b.updated_at) into result;
 end if;
 if result is null then raise sqlstate 'PT409' using message='This playbook changed. Open the cloud version or save a copy.'; end if;
 return result;
end; $fn$;
notify pgrst,'reload schema';
commit;
