
-- Harden trigger function search_path.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Cover FK columns that are not the leading columns of an existing index/PK.
create index campaign_schools_school_idx
  on public.campaign_schools (school_id);

create index game_users_school_idx
  on public.game_users (school_id);

create index school_fog_chunks_school_idx
  on public.school_fog_chunks (school_id);

create index tile_knowledge_state_school_fk_idx
  on public.tile_knowledge_state (school_id);

-- Keep tile_index portable across future campaign dimensions.
-- Runtime validates tile_index < map_width * map_height for the campaign.
alter table public.tile_knowledge_state
  drop constraint tile_knowledge_state_tile_index_range;

alter table public.tile_knowledge_state
  add constraint tile_knowledge_state_tile_index_nonnegative
  check (tile_index >= 0);
