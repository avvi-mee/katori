import { View } from 'react-native';

import { ChipRow } from '@/components/ChipRow';
import { PressableScale } from '@/components/PressableScale';
import { Stepper } from '@/components/Stepper';
import { Text } from '@/components/Text';
import { titleCase } from '@/features/workouts/format';
import { t } from '@/lib/i18n';
import { Equipment, type Preferences } from '@/types/preferences';

export type TrainingPrefs = Pick<Preferences, 'training_place' | 'equipment' | 'training_days' | 'training_weekdays'>;

const GYM: Preferences['equipment'] = ['barbell', 'dumbbell', 'machine', 'cable', 'ez_bar', 'body_only'];
const HOME: Preferences['equipment'] = ['dumbbell', 'bands', 'body_only'];
const WEEKDAYS = [1, 2, 3, 4, 5, 6, 0];

/** Toggle chips (multi-select), 44px tall. */
function MultiChips<T extends string | number>({
  options,
  value,
  onChange,
  label,
}: {
  options: { id: T; label: string }[];
  value: T[];
  onChange: (v: T[]) => void;
  label: string;
}) {
  return (
    <View accessibilityLabel={label} className="flex-row flex-wrap gap-2">
      {options.map((o) => {
        const on = value.includes(o.id);
        return (
          <PressableScale
            key={String(o.id)}
            accessibilityRole="checkbox"
            aria-checked={on}
            accessibilityLabel={o.label}
            onPress={() => onChange(on ? value.filter((v) => v !== o.id) : [...value, o.id])}
            pressedScale={0.94}
            className={`min-h-touch min-w-touch items-center justify-center rounded-full px-4 ${on ? 'bg-accent' : 'border border-line bg-surface-2'}`}
          >
            <Text variant="label" className={on ? 'text-on-accent' : 'text-ink'}>
              {o.label}
            </Text>
          </PressableScale>
        );
      })}
    </View>
  );
}

/** Where, with what and how often the user trains (onboarding step and Goals screen). */
export function TrainingSetup({
  value,
  onChange,
  showWeekdays = false,
}: {
  value: TrainingPrefs;
  onChange: (patch: Partial<TrainingPrefs>) => void;
  showWeekdays?: boolean;
}) {
  return (
    <View className="gap-5">
      <View className="gap-2">
        <Text variant="label">{t('setup.place')}</Text>
        <ChipRow
          accessibilityLabel={t('setup.place')}
          options={(['gym', 'home', 'both'] as const).map((p) => ({ id: p, label: t(`setup.place.${p}`) }))}
          value={value.training_place}
          onChange={(p) => {
            const place = p as TrainingPrefs['training_place'];
            onChange({
              training_place: place,
              ...(value.equipment.length ? {} : { equipment: place === 'home' ? HOME : GYM }),
            });
          }}
        />
      </View>
      <View className="gap-2">
        <Text variant="label">{t('setup.equipment')}</Text>
        <MultiChips
          label={t('setup.equipment')}
          options={Equipment.options
            .filter((e) => !['foam_roll', 'exercise_ball', 'medicine_ball', 'other'].includes(e))
            .map((e) => ({ id: e, label: titleCase(e) }))}
          value={value.equipment}
          onChange={(equipment) => onChange({ equipment })}
        />
      </View>
      <View className="gap-2">
        <Text variant="label">{t('setup.days')}</Text>
        <Stepper
          label={t('setup.days')}
          value={value.training_days}
          step={1}
          min={0}
          max={7}
          format={(v) => t('setup.daysValue', { n: v })}
          onChange={(training_days) =>
            onChange({ training_days, training_weekdays: value.training_weekdays.slice(0, training_days) })
          }
        />
      </View>
      {showWeekdays ? (
        <View className="gap-2">
          <Text variant="label">{t('setup.weekdays')}</Text>
          <MultiChips
            label={t('setup.weekdays')}
            options={WEEKDAYS.map((d) => ({
              id: d,
              label: new Date(Date.UTC(2026, 9, 18 + d)).toLocaleDateString('en-IN', {
                weekday: 'short',
                timeZone: 'UTC',
              }),
            }))}
            value={value.training_weekdays}
            onChange={(training_weekdays) =>
              onChange({ training_weekdays, training_days: training_weekdays.length || value.training_days })
            }
          />
          <Text variant="caption">{t('setup.weekdaysHint')}</Text>
        </View>
      ) : null}
    </View>
  );
}
