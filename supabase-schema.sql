-- =============================================
-- EJECUTA ESTO EN EL SQL EDITOR DE SUPABASE
-- Dashboard > SQL Editor > New query
-- =============================================

-- 1. Tabla de perfiles de usuario
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null,
  email text,
  created_at timestamptz default now()
);

-- 2. Tabla de conversaciones
create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now()
);

-- 3. Miembros de cada conversación
create table if not exists conversation_members (
  conversation_id uuid references conversations(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  primary key (conversation_id, user_id)
);

-- 4. Mensajes
create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references conversations(id) on delete cascade,
  sender_id uuid references profiles(id) on delete cascade,
  content text not null,
  created_at timestamptz default now()
);

-- 5. Función para buscar conversación entre dos usuarios
create or replace function find_conversation(user_a uuid, user_b uuid)
returns uuid language sql as $$
  select cm1.conversation_id
  from conversation_members cm1
  join conversation_members cm2 on cm1.conversation_id = cm2.conversation_id
  where cm1.user_id = user_a and cm2.user_id = user_b
  limit 1;
$$;

-- 6. Row Level Security (RLS)
alter table profiles enable row level security;
alter table conversations enable row level security;
alter table conversation_members enable row level security;
alter table messages enable row level security;

-- Profiles: cualquier usuario autenticado puede leer perfiles
create policy "profiles_select" on profiles for select to authenticated using (true);
create policy "profiles_insert" on profiles for insert to authenticated with check (auth.uid() = id);
create policy "profiles_update" on profiles for update to authenticated using (auth.uid() = id);

-- Conversations: solo los miembros pueden ver
create policy "conversations_select" on conversations for select to authenticated
  using (id in (select conversation_id from conversation_members where user_id = auth.uid()));

create policy "conversations_insert" on conversations for insert to authenticated with check (true);

-- Conversation members
create policy "members_select" on conversation_members for select to authenticated using (true);
create policy "members_insert" on conversation_members for insert to authenticated with check (true);

-- Messages: solo si eres miembro de la conversación
create policy "messages_select" on messages for select to authenticated
  using (conversation_id in (
    select conversation_id from conversation_members where user_id = auth.uid()
  ));

create policy "messages_insert" on messages for insert to authenticated
  with check (
    sender_id = auth.uid() and
    conversation_id in (
      select conversation_id from conversation_members where user_id = auth.uid()
    )
  );

-- 7. Habilitar Realtime para mensajes
alter publication supabase_realtime add table messages;
