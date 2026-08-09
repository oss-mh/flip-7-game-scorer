# supabase/

SQL migrations for the remote side of `GameRepository` (M10, see
docs/adr/0004-remote-backend-supabase.md). No project is provisioned yet —
these files are the schema, checked in ahead of `HttpGameRepository` (#88)
so the schema itself has a review trail independent of any adapter code.

`migrations/` follows the Supabase CLI's own layout
(`<timestamp>_<description>.sql`), so once a project exists this directory
can be linked and applied with the CLI directly:

```bash
supabase link --project-ref <ref>
supabase db push
```

Tables and RLS policies here map directly onto
`packages/engine/src/ports/gameRepository.ts` — see the comments in
`migrations/20260808120000_event_log_schema.sql` for how each method maps
to a table, policy, or function.
