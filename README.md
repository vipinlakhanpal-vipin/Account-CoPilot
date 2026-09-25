# Account CoPilot

B2B procurement-intelligence agent for the Middle East (UAE first). It researches listed companies and their procurement, finance, IT and transformation decision makers. It detects Coupa, SAP Ariba and other Source-to-Pay signals, maps the ERP landscape and third-party apps, keeps every source as evidence, and exports a formatted Master Book workbook.

## How it works

| Role | Where |
|---|---|
| Researcher (Claude Opus 5 + web search / web fetch) | `lib/research/engine.ts` → `researchNotes` |
| Extractor / Verifier (structured output) | `lib/research/engine.ts` → `extract`, schema in `lib/research/schema.ts` |
| Reconciler / Historian (never overwrites; logs conflicts and observations) | `lib/research/reconcile.ts` |
| Reporter (dashboard + Excel) | `components/CoPilotApp.tsx`, `lib/export/workbook.ts` |
| Pitch planner | `app/api/pitch` |

Stack: Next.js 15 on Vercel, Supabase (Postgres + Auth), Anthropic API.

## Setup

1. **Supabase.** Open SQL Editor, paste `supabase/migrations/0001_init.sql` and run it.
   - Authentication → URL Configuration: set **Site URL** to your Vercel URL and add `https://<your-app>.vercel.app/auth/callback` under Redirect URLs.
2. **Vercel.** Import this repo with the Next.js preset and add these environment variables:

   | Name | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API → Project URL |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase → API Keys → **Publishable key** |
   | `SUPABASE_SECRET_KEY` | Supabase → API Keys → **Secret key** (server only) |
   | `ANTHROPIC_API_KEY` | console.anthropic.com → API Keys |
   | `ALLOWED_EMAIL_DOMAINS` | e.g. `scp-worldwide.com`. Only these domains can sign in. |

3. **Load the researched data (optional).** On your machine, with `.env.local` filled in (copy `.env.example`):
   ```bash
   python3 scripts/export_seed.py
   npm run seed
   ```

Contact data never goes into Git (see `.gitignore`); it lives only in Supabase.

## Research limits

Vercel Hobby caps a function at 300 seconds. Quick and Standard research fit inside that; Deep research may need Vercel Pro. Each run costs Anthropic API usage (web search is billed per search).

## Local research pipeline

`scripts/` also holds the Python pipeline used for the first UAE run: research JSON, Seamless.ai enrichment, reference-workbook merge, and the Master Book builder. See `.claude/skills/account-copilot/SKILL.md`.
