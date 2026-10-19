// Weekly adaptive calorie recalculation (docs/ARCHITECTURE.md "Habits, goals and preferences"): on Mondays the
// daily digest re-estimates each user's TDEE from 14 days of intake and 21 days of weigh-ins and moves the
// calorie target (goals.kcal, updated_by = 'engine'). Targets the user typed in themselves are left alone.
import { engineMayAdjust, isRecalcDay, weeklyRecalc } from './gen/features/goals/engine.ts';
import { addDays, istDay, istDayRange } from './gen/lib/day.ts';
import type { Admin } from './http.ts';

const PAGE = 200;
const ADAPTIVE_GOALS = ['fat_loss', 'muscle_gain', 'recomposition'];

export async function weeklyRecalcAll(admin: Admin, now: Date) {
  const day = istDay(now);
  if (!isRecalcDay(day)) return { recalculated: 0 };
  const { from } = istDayRange(addDays(day, -14));
  const { to } = istDayRange(day);
  const weightsFrom = addDays(day, -21);
  let recalculated = 0;

  for (let offset = 0; ; offset += PAGE) {
    const { data: profiles, error } = await admin
      .from('profiles')
      .select('id, goal, kcal_target, kcal_floor')
      .not('onboarded_at', 'is', null)
      .order('id')
      .range(offset, offset + PAGE - 1);
    if (error) throw error;
    if (!profiles?.length) break;
    const ids = profiles.map((p) => p.id);
    const [{ data: goals }, { data: meals }, { data: weights }] = await Promise.all([
      admin.from('goals').select('user_id, primary_goal, kcal, updated_by').in('user_id', ids),
      admin.from('meals').select('user_id, eaten_at, kcal').in('user_id', ids).gte('eaten_at', from).lt('eaten_at', to),
      admin.from('weights').select('user_id, date, weight_kg').in('user_id', ids).gte('date', weightsFrom),
    ]);
    const goalsBy = new Map((goals ?? []).map((g) => [g.user_id as string, g]));

    for (const p of profiles) {
      const g = goalsBy.get(p.id) ?? null;
      const goal = (g?.primary_goal as string | null) ?? (p.goal as string | null);
      if (!goal || !ADAPTIVE_GOALS.includes(goal) || !engineMayAdjust(g)) continue;
      const intakeByDay = new Map<string, number>();
      for (const m of meals ?? []) {
        if (m.user_id !== p.id) continue;
        const d = istDay(new Date(m.eaten_at));
        intakeByDay.set(d, (intakeByDay.get(d) ?? 0) + Number(m.kcal));
      }
      const currentKcal = Number(g?.kcal ?? p.kcal_target ?? 0);
      if (!currentKcal) continue;
      const r = weeklyRecalc({
        goal,
        currentKcal,
        floor: Number(p.kcal_floor ?? 1200),
        intake: [...intakeByDay].map(([date, kcal]) => ({ date, kcal })),
        weights: (weights ?? [])
          .filter((w) => w.user_id === p.id)
          .map((w) => ({ date: w.date as string, weight_kg: Number(w.weight_kg) })),
      });
      if (!r) continue;
      const { error: upsertError } = await admin
        .from('goals')
        .upsert({ user_id: p.id, kcal: r.kcal, updated_by: 'engine' }, { onConflict: 'user_id' });
      if (upsertError) console.error('recalc failed for user', p.id, upsertError);
      else recalculated++;
    }
  }
  return { recalculated };
}
