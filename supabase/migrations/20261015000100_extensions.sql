-- Extensions live in the `extensions` schema (Supabase convention).
create schema if not exists extensions;
create extension if not exists pg_trgm with schema extensions;
