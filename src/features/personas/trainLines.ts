// server-shared: persona lines for the workout finish screen and the smoking habit (docs/ARCHITECTURE.md
// "Workout tracker" step 5 and "Smoking tone"). Smoking is always supportive: Savage mode never applies, no
// line shames a slip, and smoke-free days are celebrated. Placeholders: {prs}, {minutes}, {volume}, {days},
// {avoided}, {saved}.
import type { PersonaId } from './personas.ts';
import type { CoachProfile } from './safety.ts';

type WorkoutSituation = 'pr' | 'done' | 'short';
type SmokeSituation = 'free_streak' | 'free_today' | 'below_baseline' | 'slipped';

const WORKOUT: Record<PersonaId, Record<WorkoutSituation, string>> = {
  gym_bro: {
    pr: 'Bhai {prs} naye PR! {minutes} min mein {volume} kg uthaya. Beast mode on.',
    done: 'Workout done bhai — {minutes} min, {volume} kg volume. Protein time!',
    short: 'Chhota session bhi session hai bhai. Kal full energy ke saath.',
  },
  desi_mummy: {
    pr: 'Wah beta, {prs} naye record! Ab achha khana kha aur aaram kar.',
    done: 'Shabash beta, {minutes} minute mehnat ki. Ab paani pi aur dal-roti kha.',
    short: 'Thoda hi sahi, gaya toh! Kal phir chalna beta.',
  },
  strict_coach: {
    pr: '{prs} PRs. {volume} kg total volume in {minutes} min. Log protein within 2 hours.',
    done: 'Session complete: {minutes} min, {volume} kg volume. Recover and repeat.',
    short: 'Short session logged. Consistency beats intensity. Next session as planned.',
  },
  hype_friend: {
    pr: '{prs} new PRs?! You are literally getting stronger every week!',
    done: '{minutes} minutes, {volume} kg moved. That is a W, no debate!',
    short: 'Showing up is the hardest part, and you did it!',
  },
};

const WORKOUT_SAVAGE: Record<WorkoutSituation, string> = {
  pr: '{prs} PRs. Finally the weights know who is boss. Don’t get comfortable.',
  done: '{minutes} min, {volume} kg. Decent. Next time, less phone between sets.',
  short: 'That was a warm-up, not a workout. Come back and finish the job.',
};

const SMOKING: Record<PersonaId, Record<SmokeSituation, string>> = {
  gym_bro: {
    free_streak:
      '{days} din smoke-free bhai! {avoided} cigarettes bachayi, ₹{saved} bache. Lungs bhi gains kar rahe hain.',
    free_today: 'Aaj abhi tak ek bhi nahi bhai. Bas aaj ka din jeet, kal ki kal dekhenge.',
    below_baseline: 'Pehle se kam hai bhai, yeh progress hai. Ek-ek karke kam karte hain.',
    slipped: 'Koi baat nahi bhai, ek slip se kuch khatam nahi hota. Paani pi, 5 min walk kar, phir se shuru.',
  },
  desi_mummy: {
    free_streak: '{days} din bina cigarette ke! Beta, mujhe tum par garv hai. ₹{saved} bhi bach gaye.',
    free_today: 'Aaj ek bhi nahi, bahut achha beta. Craving aaye toh saunf kha lo.',
    below_baseline: 'Pehle se kam ho rahi hai beta. Dheere-dheere, hum saath hain.',
    slipped: 'Koi baat nahi beta, gussa mat karo khud pe. Kal phir koshish karenge.',
  },
  strict_coach: {
    free_streak: '{days} smoke-free days. {avoided} cigarettes avoided, ₹{saved} saved. Keep the streak.',
    free_today: 'Zero today so far. Delay the next craving by 10 minutes; it passes.',
    below_baseline: 'Below your old baseline. That counts. Cut one more tomorrow.',
    slipped: 'One slip is data, not failure. Note the trigger and plan around it tomorrow.',
  },
  hype_friend: {
    free_streak: '{days} days smoke-free! {avoided} cigarettes not smoked and ₹{saved} saved. Huge!',
    free_today: 'Zero so far today, that is a win in progress!',
    below_baseline: 'Fewer than before, that is real progress. Proud of you!',
    slipped: 'Slips happen, it does not erase your progress. Fresh start right now!',
  },
};

const fill = (s: string, v: Record<string, string | number>) =>
  s.replace(/\{(\w+)\}/g, (m, k: string) => (k in v ? String(v[k]) : m));

export function workoutLine(p: CoachProfile, f: { prs: number; minutes: number; volume: number }): string {
  const situation: WorkoutSituation = f.prs > 0 ? 'pr' : f.minutes < 15 ? 'short' : 'done';
  const savage = p.savage_mode && p.adult_confirmed;
  const line = savage ? WORKOUT_SAVAGE[situation] : WORKOUT[p.persona][situation];
  return fill(line, { prs: f.prs, minutes: f.minutes, volume: Math.round(f.volume).toLocaleString('en-IN') });
}

/** Supportive in every persona, whatever the Savage setting. */
export function smokingLine(
  persona: PersonaId,
  f: { smokeFreeDays: number; today: number; baseline: number | null; avoided: number; saved: number },
): string {
  const situation: SmokeSituation =
    f.today === 0
      ? f.smokeFreeDays >= 1
        ? 'free_streak'
        : 'free_today'
      : f.baseline && f.today < f.baseline
        ? 'below_baseline'
        : 'slipped';
  return fill(SMOKING[persona][situation], {
    days: f.smokeFreeDays,
    avoided: f.avoided,
    saved: f.saved.toLocaleString('en-IN'),
  });
}

/** Every smoking line, for tests and review. */
export const ALL_SMOKING_LINES = Object.values(SMOKING).flatMap((s) => Object.values(s));
