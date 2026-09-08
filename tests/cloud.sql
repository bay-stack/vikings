begin;
insert into vikings_private.workspaces(key_hash) values(sha256(convert_to(repeat('a',64),'UTF8'))),(sha256(convert_to(repeat('b',64),'UTF8')));
set local role anon;
do $test$
declare b jsonb; result jsonb; denied boolean;
begin
 select jsonb_build_object('version',1,'title','Verification fixture','plays',jsonb_agg(jsonb_build_object('number',i::text,'name','Twins right','color','#49206e','overlay',false,'image',null) order by i)) into b from generate_series(1,24) i;
 result:=public.vikings_save(repeat('a',64),'11111111-1111-4111-8111-111111111111',b,0);
 if result->>'revision'<>'1' then raise exception 'create failed'; end if;
 result:=public.vikings_load(repeat('a',64),'11111111-1111-4111-8111-111111111111');
 if result->'payload'<>b then raise exception 'round trip failed'; end if;
 b:=jsonb_set(jsonb_set(b,'{plays,0,line2}','"Jet sweep"'),'{plays,0,imageMode}','"canva-326"');
 perform public.vikings_save(repeat('a',64),'11111111-1111-4111-8111-111111111111',b,1);
 result:=public.vikings_load(repeat('a',64),'11111111-1111-4111-8111-111111111111');
 if result->'payload'<>b then raise exception 'Canva and second-line round trip failed'; end if;
 denied:=false;begin perform public.vikings_save(repeat('a',64),'11111111-1111-4111-8111-111111111111',jsonb_set(b,'{plays,0,line2}',to_jsonb(repeat('x',39))),2);exception when sqlstate 'PT400' then denied:=true;end;if not denied then raise exception 'oversized second line accepted';end if;
 denied:=false;begin perform public.vikings_save(repeat('a',64),'11111111-1111-4111-8111-111111111111',jsonb_set(b,'{plays,0,imageMode}','"unknown"'),2);exception when sqlstate 'PT400' then denied:=true;end;if not denied then raise exception 'invalid image format accepted';end if;
 denied:=false;begin perform public.vikings_save(repeat('a',64),'11111111-1111-4111-8111-111111111111',jsonb_set(b,'{plays,0,line2}','null'),2);exception when sqlstate 'PT400' then denied:=true;end;if not denied then raise exception 'null second line accepted';end if;
 denied:=false;begin perform public.vikings_save(repeat('a',64),'11111111-1111-4111-8111-111111111111',b,1); exception when sqlstate 'PT409' then denied:=true;end;if not denied then raise exception 'stale write accepted';end if;
 denied:=false;begin perform public.vikings_load(repeat('b',64),'11111111-1111-4111-8111-111111111111');exception when sqlstate 'PT404' then denied:=true;end;if not denied then raise exception 'cross-workspace read accepted';end if;
 denied:=false;begin perform public.vikings_save(repeat('c',64),'11111111-1111-4111-8111-111111111111',b,0);exception when sqlstate 'PT403' then denied:=true;end;if not denied then raise exception 'unknown workspace created';end if;
 denied:=false;begin perform public.vikings_save(repeat('a',64),'11111111-1111-4111-8111-111111111111',jsonb_set(b,'{plays}','[]'),2);exception when sqlstate 'PT400' then denied:=true;end;if not denied then raise exception 'malformed book accepted';end if;
 denied:=false;begin perform public.vikings_list(null);exception when sqlstate 'PT403' then denied:=true;end;if not denied then raise exception 'null secret accepted';end if;
 denied:=false;begin perform 1 from vikings_private.playbooks;exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'direct table access allowed';end if;
 if public.vikings_list(repeat('b',64))<>'[]'::jsonb then raise exception 'list leaked another workspace';end if;
end;
$test$;
rollback;
select 'PASS: create/load, revision conflict, workspace isolation, unknown key, invalid input, null key, direct table denial, no leaked list. Fixtures rolled back.' as verification;
