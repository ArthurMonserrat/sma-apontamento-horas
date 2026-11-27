begin;

do $$
declare
  existing_job bigint;
begin
  if to_regclass('cron.job') is null then
    raise notice 'pg_cron is unavailable; skipping Banco 1 project catalog schedule in this environment';
  else
    select jobid into existing_job
    from cron.job
    where jobname = 'banco1-project-catalog-sync';
    if existing_job is not null then
      perform cron.unschedule(existing_job);
    end if;

    perform cron.schedule(
      'banco1-project-catalog-sync',
      '0 3 * * *',
      $job$
        select net.http_post(
          url := (select decrypted_secret from vault.decrypted_secrets where name = 'banco1_project_sync_url'),
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'banco1_project_sync_secret')
          ),
          body := '{}'::jsonb
        ) as request_id;
      $job$
    );
  end if;
end;
$$;

commit;
