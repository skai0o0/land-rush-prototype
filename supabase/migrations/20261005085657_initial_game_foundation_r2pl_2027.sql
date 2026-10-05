
-- Road to Predator League 2027 (R2PL)
-- Initial persistent game foundation.
-- Deliberately keeps realtime gameplay in Colyseus; PostgreSQL is persistence.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.schools (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  display_name text not null,
  short_name text not null,
  knowledge_bit smallint not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint schools_code_nonempty check (btrim(code) <> ''),
  constraint schools_knowledge_bit_range check (knowledge_bit between 0 and 15)
);

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  short_name text not null,
  status text not null default 'setup',
  map_width integer not null default 1000,
  map_height integer not null default 1000,
  chunk_size integer not null default 64,
  binary_format_version smallint not null default 1,
  max_school_slots smallint not null default 16,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint campaigns_status_check check (status in ('setup','active','paused','completed','archived')),
  constraint campaigns_map_width_positive check (map_width > 0),
  constraint campaigns_map_height_positive check (map_height > 0),
  constraint campaigns_chunk_size_positive check (chunk_size > 0),
  constraint campaigns_binary_format_positive check (binary_format_version > 0),
  constraint campaigns_max_school_slots_range check (max_school_slots between 1 and 16),
  constraint campaigns_time_order check (ends_at is null or starts_at is null or ends_at > starts_at)
);

create table public.campaign_schools (
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete restrict,
  map_slot smallint not null,
  hq_x integer,
  hq_z integer,
  status text not null default 'active',
  joined_at timestamptz not null default now(),
  protection_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (campaign_id, school_id),
  constraint campaign_schools_slot_range check (map_slot between 0 and 15),
  constraint campaign_schools_status_check check (status in ('reserved','active','inactive','withdrawn')),
  constraint campaign_schools_hq_pair check (
    (hq_x is null and hq_z is null) or
    (hq_x is not null and hq_z is not null)
  ),
  unique (campaign_id, map_slot)
);

create table public.game_users (
  id uuid primary key default gen_random_uuid(),
  portal_user_id text,
  student_id text,
  display_name text not null,
  email text,
  school_id uuid not null references public.schools(id) on delete restrict,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint game_users_status_check check (status in ('active','disabled','blocked','left_campaign'))
);

create unique index game_users_campaign_portal_uidx
  on public.game_users (campaign_id, portal_user_id)
  where portal_user_id is not null;

create unique index game_users_campaign_school_student_uidx
  on public.game_users (campaign_id, school_id, student_id)
  where student_id is not null;

create index game_users_campaign_school_idx
  on public.game_users (campaign_id, school_id);

create table public.world_chunks (
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  chunk_x smallint not null,
  chunk_z smallint not null,
  knowledge_data bytea not null default ''::bytea,
  format_version smallint not null default 1,
  version bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (campaign_id, chunk_x, chunk_z),
  constraint world_chunks_x_nonnegative check (chunk_x >= 0),
  constraint world_chunks_z_nonnegative check (chunk_z >= 0),
  constraint world_chunks_format_positive check (format_version > 0),
  constraint world_chunks_version_nonnegative check (version >= 0)
);

create table public.school_fog_chunks (
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  chunk_x smallint not null,
  chunk_z smallint not null,
  fog_data bytea not null default ''::bytea,
  format_version smallint not null default 1,
  version bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (campaign_id, school_id, chunk_x, chunk_z),
  constraint school_fog_chunks_x_nonnegative check (chunk_x >= 0),
  constraint school_fog_chunks_z_nonnegative check (chunk_z >= 0),
  constraint school_fog_chunks_format_positive check (format_version > 0),
  constraint school_fog_chunks_version_nonnegative check (version >= 0)
);

create index school_fog_chunks_campaign_chunk_idx
  on public.school_fog_chunks (campaign_id, chunk_x, chunk_z);

create table public.tile_knowledge_state (
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  tile_index integer not null,
  school_id uuid not null references public.schools(id) on delete cascade,
  strength smallint not null,
  last_studied_at timestamptz not null,
  version bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (campaign_id, tile_index, school_id),
  constraint tile_knowledge_state_tile_index_range check (tile_index between 0 and 999999),
  constraint tile_knowledge_state_strength_positive check (strength > 0),
  constraint tile_knowledge_state_version_nonnegative check (version >= 0)
);

create index tile_knowledge_state_school_idx
  on public.tile_knowledge_state (campaign_id, school_id, tile_index);

create index tile_knowledge_state_decay_idx
  on public.tile_knowledge_state (campaign_id, last_studied_at);

create trigger schools_set_updated_at
before update on public.schools
for each row execute function public.set_updated_at();

create trigger campaigns_set_updated_at
before update on public.campaigns
for each row execute function public.set_updated_at();

create trigger campaign_schools_set_updated_at
before update on public.campaign_schools
for each row execute function public.set_updated_at();

create trigger game_users_set_updated_at
before update on public.game_users
for each row execute function public.set_updated_at();

-- Seed the confirmed school registry.
insert into public.schools (code, display_name, short_name, knowledge_bit)
values
  ('HCMUT',  'Trường Đại học Bách khoa – Đại học Quốc gia Thành phố Hồ Chí Minh', 'HCMUT',  0),
  ('HCMCOU', 'Trường Đại học Mở Thành phố Hồ Chí Minh',                           'HCMCOU', 1),
  ('DTU',    'Đại học Duy Tân',                                                    'DTU',    2),
  ('DHHP',   'Trường Đại học Hải Phòng',                                           'DHHP',   3),
  ('HSU',    'Trường Đại học Hoa Sen',                                             'HSU',    4),
  ('HUCE',   'Đại học Xây dựng Hà Nội',                                            'HUCE',   5),
  ('NTU',    'Đại học Nha Trang',                                                   'NTU',    6),
  ('HCMIU',  'Đại học Quốc tế - ĐHQG-HCM',                                         'HCMIU',  7);

-- Seed Road to Predator League 2027. Dates remain unset until campaign schedule is finalized.
insert into public.campaigns (
  code, name, short_name, status,
  map_width, map_height, chunk_size, binary_format_version, max_school_slots
)
values (
  'r2pl-2027',
  'Road to Predator League 2027',
  'R2PL 2027',
  'setup',
  1000, 1000, 64, 1, 16
);

-- Assign the 8 confirmed schools to stable campaign slots.
-- HQ coordinates intentionally remain NULL until the 8-school map layout is approved.
insert into public.campaign_schools (campaign_id, school_id, map_slot, status)
select
  c.id,
  s.id,
  s.knowledge_bit,
  'active'
from public.campaigns c
join public.schools s
  on s.code in ('HCMUT','HCMCOU','DTU','DHHP','HSU','HUCE','NTU','HCMIU')
where c.code = 'r2pl-2027';

-- The game client must not access persistence tables directly.
-- RLS is enabled with no public policies; the authoritative backend uses a server-side DB role.
alter table public.schools enable row level security;
alter table public.campaigns enable row level security;
alter table public.campaign_schools enable row level security;
alter table public.game_users enable row level security;
alter table public.world_chunks enable row level security;
alter table public.school_fog_chunks enable row level security;
alter table public.tile_knowledge_state enable row level security;
