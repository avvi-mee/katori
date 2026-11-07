# Katori

A fitness app for Indian gym-goers. Snap a photo of your thali, confirm the dishes and portions in two or three taps, and Katori works out the calories and macros. It also logs workouts, steps, habits and body measurements, and rolls everything into one daily score.

I built it because the popular calorie apps don't know what a katori of rajma or two rotis with ghee actually is. Katori is made for Indian food and speaks Hinglish.

## What it does

- **Photo food logging.** The AI only names the dishes and portions. The calories come from a reviewed Indian food table (`supabase/seed/food_items.csv`), so the numbers don't depend on a model guessing.
- **Text logging** ("2 roti, dal, 1 bowl rice") for when you don't want to take a photo.
- **Workout logger** with sets, reps, estimated 1RM and progression hints. Works offline.
- **Habits**: water, sleep, smoking (tracked gently, never shamed).
- **Goals and daily score**, streaks, weekly report card.
- **Coach personas** with safety rules: they never comment on your body or praise skipping meals.
- **Challenges and referrals** you can share with friends.
- **Trainer mode**: coaches link clients (with consent), review their meals and bill per active client.
- **Pro plan** through Razorpay subscriptions. All manual tracking stays free.
- Telegram bot for logging meals from chat.

## Stack

- **App:** Expo + Expo Router, TypeScript (strict), react-native-web (ships as a PWA first), NativeWind, Reanimated/Moti, TanStack Query, React Hook Form + Zod
- **Backend:** Supabase (Postgres with row-level security on every table, Auth, Storage, Edge Functions on Deno, pg_cron)
- **AI:** provider adapter, Gemini by default, Claude Haiku/Sonnet switchable with one env var
- **Payments:** Razorpay or Dodo through a billing adapter
- **Other:** PostHog, Sentry, GitHub Actions, Cloudflare Pages

## Project layout

```
app/                  routes (auth, onboarding, tabs, scan, meal, workout, coach, challenges)
src/components/       design-system components (Ring, Sheet, PortionSheet, MacroBar...)
src/features/         feature logic; files marked `// server-shared` also run in Edge Functions
src/lib/              supabase client, api, analytics, offline outbox
supabase/migrations/  SQL migrations (RLS lives in the same migration as its table)
supabase/functions/   Edge Functions: analyze-meal, confirm-meal, log-text, coach, payments...
supabase/seed/        Indian food table
tests/                vitest, including RLS tests that run migrations in PGlite
```

## Running it locally

```bash
npm install
cp .env.example .env        # fill in your Supabase URL and anon key
npm run web                 # opens the PWA in the browser
```

Set `EXPO_PUBLIC_DEMO=1` in `.env` to try the app with an in-browser demo backend, no account needed.

```bash
npm test                    # unit + database tests
npm run typecheck           # app + edge functions
```

## Secrets and deployment

Only `EXPO_PUBLIC_*` values go into the app. AI keys, payment keys, the cron secret and the Telegram token are Supabase function secrets (`npx supabase secrets set ...`) and never touch the client.

CI uses two GitHub environments, `preview` and `production`, with the same variable names: `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` and the public `EXPO_PUBLIC_*` values. Deploys stay off until you set the repository variable `DEPLOY_ENABLED` to `true`. After that, pushing to `main` runs the tests, applies migrations, deploys the Edge Functions and publishes the PWA to Cloudflare Pages. Pull requests get their own preview deploy.

The daily digest cron reads the project URL and a shared secret from Supabase Vault. Set them once in the SQL editor:

```sql
select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
select vault.create_secret('<same value as CRON_SECRET>', 'cron_secret');
```

## Status

Phases 1 to 3 are done: food logging, workouts, habits, coach personas, trainer mode, challenges, payments and the Telegram bot. Native Android/iOS builds through EAS are next.
