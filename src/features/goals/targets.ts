// server-shared: daily calorie/protein targets. Formula approved in docs/ARCHITECTURE.md Build decisions.
export type Sex = 'male' | 'female' | 'other';
export type Activity = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';
export type Goal = 'fat_loss' | 'muscle_gain' | 'recomposition' | 'strength' | 'endurance' | 'quit_smoking';

export type TargetsInput = {
  sex: Sex;
  birthYear: number;
  heightCm: number;
  weightKg: number;
  activity: Activity;
  goal: Goal;
  /** Defaults to the current year; injectable for tests. */
  year?: number;
};

export type Targets = { bmr: number; tdee: number; kcal: number; protein: number; floor: number };

const ACTIVITY: Record<Activity, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};
const GOAL_ADJUST: Record<Goal, number> = {
  fat_loss: -0.2,
  muscle_gain: 0.1,
  recomposition: 0,
  strength: 0,
  endurance: 0,
  quit_smoking: 0,
};
const PROTEIN_G_PER_KG: Record<Goal, number> = {
  fat_loss: 2.0,
  muscle_gain: 1.8,
  recomposition: 2.0,
  strength: 1.8,
  endurance: 1.6,
  quit_smoking: 1.6,
};
const SEX_FLOOR: Record<Sex, number> = { male: 1500, female: 1200, other: 1350 };
const SEX_OFFSET: Record<Sex, number> = { male: 5, female: -161, other: -78 };

const round = (n: number, step: number) => Math.round(n / step) * step;

/** Mifflin-St Jeor BMR × activity, goal-adjusted, never below the safe floor. */
export function computeTargets(i: TargetsInput): Targets {
  const age = (i.year ?? new Date().getFullYear()) - i.birthYear;
  const bmr = 10 * i.weightKg + 6.25 * i.heightCm - 5 * age + SEX_OFFSET[i.sex];
  const tdee = bmr * ACTIVITY[i.activity];
  const floor = round(Math.max(SEX_FLOOR[i.sex], bmr * 0.9), 10);
  const kcal = Math.max(round(tdee * (1 + GOAL_ADJUST[i.goal]), 10), floor);
  const protein = Math.min(Math.max(round(i.weightKg * PROTEIN_G_PER_KG[i.goal], 5), 50), 220);
  return { bmr: Math.round(bmr), tdee: Math.round(tdee), kcal, protein, floor };
}
