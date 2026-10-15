// Coach messages: template first (free), AI rewrite for Pro, safety-checked either way, saved to coach_messages.
import { generateText, providerFromEnv } from './ai.ts';
import { buildCoachMessage, chooseText, rewritePrompt } from './gen/features/personas/coach.ts';
import { groupByDay, type DayTotal, type FactsProfile } from './gen/features/personas/facts.ts';
import type { PersonaId } from './gen/features/personas/personas.ts';
import type { CoachFacts } from './gen/features/personas/safety.ts';
import { addDays, istDay, istDayRange } from './gen/lib/day.ts';
import type { Admin } from './http.ts';

export type CoachProfileRow = FactsProfile & {
  id: string;
  persona: PersonaId;
  savage_mode: boolean;
  adult_confirmed: boolean;
  nudges_muted: boolean;
};

export const COACH_PROFILE_COLUMNS =
  'id, persona, savage_mode, adult_confirmed, kcal_target, protein_target, kcal_floor, diet_type, nudges_muted';

export type CoachReply = { text: string; persona: PersonaId; gentle: boolean };

/** Per-day totals for one user over the last 3 IST days (today + the two before, for the low-days rule). */
export async function recentTotals(admin: Admin, uid: string, at: Date): Promise<Map<string, DayTotal>> {
  const today = istDay(at);
  const { data } = await admin
    .from('meals')
    .select('eaten_at, kcal, protein_g')
    .eq('user_id', uid)
    .gte('eaten_at', istDayRange(addDays(today, -2)).from)
    .lt('eaten_at', istDayRange(today).to);
  return groupByDay(data ?? []);
}

const withTimeout = <T>(p: Promise<T>, ms: number) =>
  Promise.race([p, new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))]);

const dayOfYear = (day: string) =>
  Math.floor((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${day.slice(0, 4)}-01-01T00:00:00Z`)) / 86_400_000);

/** Build (template → optional AI rewrite → safety check), save and return the coach line. */
export async function writeCoach(
  admin: Admin,
  p: CoachProfileRow,
  facts: CoachFacts,
  o: { isPro: boolean; day: string; deliveredVia: 'in_app' | 'push'; aiTimeoutMs: number },
): Promise<CoachReply> {
  const m = buildCoachMessage(facts, p, dayOfYear(o.day) + facts.meals);
  let aiText: string | null = null;
  // AI-written coach replies are a Pro feature; free users get the template (docs: Free vs Pro).
  if (o.isPro) {
    try {
      aiText = (await withTimeout(generateText(providerFromEnv(), rewritePrompt(m)), o.aiTimeoutMs)).text;
    } catch (e) {
      console.warn('coach rewrite skipped:', (e as Error).message);
    }
  }
  const { text, usedAi } = chooseText(m, aiText);
  await admin.from('coach_messages').insert({
    user_id: p.id,
    day: o.day,
    persona: p.persona,
    trigger: facts.trigger,
    text,
    facts: { ...facts, situation: m.situation, tone: m.tone, ai: usedAi },
    delivered_via: o.deliveredVia,
  });
  if (usedAi) await admin.rpc('bump_usage', { p_user: p.id, p_day: o.day, p_coach_messages: 1 });
  return { text, persona: p.persona, gentle: m.tone === 'gentle' };
}
