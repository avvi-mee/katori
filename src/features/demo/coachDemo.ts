// Demo-mode trainer data: two made-up clients so the trainer dashboard has something to show, plus the
// trainer-mode RPCs. Plain data, no Supabase; used only by the demo backend.
import { addDays, istDay, istDayRange } from '@/lib/day';

type Row = Record<string, unknown>;

export const DEMO_COACH = { id: 'dddddddd-0000-4000-8000-00000000c0ac', name: 'Coach Vikram (demo)' };
const ASHA = 'dddddddd-0000-4000-8000-00000000a5a1';
const ROHAN = 'dddddddd-0000-4000-8000-00000000b0a1';

export type CoachDemo = {
  links: Row[];
  profiles: Row[];
  meals: Row[];
  workouts: Row[];
  templates: Row[];
  activity: Row[];
  habits: Row[];
  weights: Row[];
  goals: Row[];
};

const meal = (
  user: string,
  day: string,
  hour: number,
  type: string,
  items: [string, string, number][],
  kcal: number,
  protein: number,
): Row => ({
  id: crypto.randomUUID(),
  user_id: user,
  eaten_at: new Date(Date.parse(istDayRange(day).from) + hour * 3600_000).toISOString(),
  meal_type: type,
  photo_path: null,
  input_mode: 'photo',
  source: 'home',
  kcal,
  kcal_low: Math.round(kcal * 0.85),
  kcal_high: Math.round(kcal * 1.15),
  protein_g: protein,
  carbs_g: Math.round((kcal * 0.5) / 4),
  fat_g: Math.round((kcal * 0.3) / 9),
  meal_items: items.map(([dish, unit, qty]) => ({
    id: crypto.randomUUID(),
    dish,
    unit,
    qty,
    kcal: Math.round(kcal / items.length),
    protein_g: Math.round(protein / items.length),
  })),
});

/** Asha logs every day and hits protein; Rohan stopped logging two days ago after a protein-short streak. */
export function seedClients(now = new Date()): CoachDemo {
  const today = istDay(now);
  const day = (n: number) => addDays(today, -n);
  const meals: Row[] = [];
  for (let n = 0; n < 7; n++) {
    meals.push(
      meal(
        ASHA,
        day(n),
        9,
        'breakfast',
        [
          ['Poha', 'katori', 1.5],
          ['Chai', 'cup', 1],
        ],
        380,
        14,
      ),
    );
    if (n > 0 || now.getUTCHours() > 8)
      meals.push(
        meal(
          ASHA,
          day(n),
          13.5,
          'lunch',
          [
            ['Dal tadka', 'katori', 1],
            ['Roti', 'piece', 2],
            ['Paneer bhurji', 'katori', 1],
          ],
          720,
          38,
        ),
      );
    if (n > 0)
      meals.push(
        meal(
          ASHA,
          day(n),
          20.5,
          'dinner',
          [
            ['Rajma', 'katori', 1],
            ['Rice', 'katori', 1],
            ['Curd', 'katori', 1],
          ],
          640,
          28,
        ),
      );
  }
  for (let n = 2; n < 7; n++) {
    meals.push(
      meal(
        ROHAN,
        day(n),
        10,
        'breakfast',
        [
          ['Aloo paratha', 'piece', 2],
          ['Chai', 'cup', 1],
        ],
        620,
        12,
      ),
    );
    meals.push(
      meal(
        ROHAN,
        day(n),
        14,
        'lunch',
        [
          ['Chole', 'katori', 1],
          ['Bhature', 'piece', 2],
        ],
        900,
        22,
      ),
    );
  }
  const mondayOffset = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7;
  const workouts = [
    {
      id: crypto.randomUUID(),
      user_id: ASHA,
      name: 'Push',
      started_at: istDayRange(day(Math.min(mondayOffset, 6))).from,
      duration_s: 3300,
      volume_kg: 6200,
      template_id: null,
    },
    {
      id: crypto.randomUUID(),
      user_id: ASHA,
      name: 'Legs',
      started_at: istDayRange(day(1)).from,
      duration_s: 3900,
      volume_kg: 8400,
      template_id: null,
    },
  ];
  return {
    links: [
      {
        id: crypto.randomUUID(),
        coach_id: DEMO_COACH.id,
        client_id: ASHA,
        status: 'active',
        started_at: istDayRange(day(30)).from,
      },
      {
        id: crypto.randomUUID(),
        coach_id: DEMO_COACH.id,
        client_id: ROHAN,
        status: 'active',
        started_at: istDayRange(day(12)).from,
      },
    ],
    profiles: [
      {
        id: ASHA,
        role: 'user',
        name: 'Asha Verma',
        goal: 'fat_loss',
        diet_type: 'veg',
        kcal_target: 1750,
        protein_target: 95,
        kcal_floor: 1200,
        weight_kg: 64,
      },
      {
        id: ROHAN,
        role: 'user',
        name: 'Rohan Mehta',
        goal: 'muscle_gain',
        diet_type: 'nonveg',
        kcal_target: 2700,
        protein_target: 140,
        kcal_floor: 1500,
        weight_kg: 71,
      },
    ],
    meals,
    workouts,
    templates: [
      {
        id: crypto.randomUUID(),
        owner_id: ASHA,
        name: 'Push',
        plan_weekdays: [1, 4],
        assigned_by_coach_id: DEMO_COACH.id,
        template_exercises: [],
      },
      {
        id: crypto.randomUUID(),
        owner_id: ROHAN,
        name: 'Full body',
        plan_weekdays: [1, 3, 5],
        assigned_by_coach_id: DEMO_COACH.id,
        template_exercises: [],
      },
    ],
    activity: [0, 1, 2, 3, 4, 5, 6].map((n) => ({ user_id: ASHA, date: day(n), steps: 7000 + n * 450 })),
    habits: [
      {
        id: crypto.randomUUID(),
        user_id: ASHA,
        kind: 'water',
        name: 'Water',
        unit: 'ml',
        daily_target: 2500,
        created_at: istDayRange(day(20)).from,
        active: true,
        habit_logs: [1, 2, 3, 4].map((n) => ({ logged_at: istDayRange(day(n)).from, value: 2500 })),
      },
    ],
    weights: [28, 21, 14, 7, 0].map((n, i) => ({ user_id: ASHA, date: day(n), weight_kg: 66.2 - i * 0.45 })),
    goals: [],
  };
}

const ids = (v: string | null) =>
  (v ?? '')
    .replace(/^(eq|in)\./, '')
    .replace(/[()]/g, '')
    .split(',')
    .filter(Boolean);

/** The client ids a request filters on (user_id / owner_id / id), when they are demo clients. */
export function clientFilter(c: CoachDemo | undefined, params: URLSearchParams, col: string): string[] {
  if (!c) return [];
  const wanted = ids(params.get(col));
  const known = new Set(c.profiles.map((p) => p.id as string));
  return wanted.filter((w) => known.has(w));
}
