/**
 * Muscle / training type labels — locale → English fallback (never Danish-as-default).
 */

import {MuscleGroup} from '@/types/workout.types';

export const MUSCLE_GROUP_LABELS_EN: Record<MuscleGroup, string> = {
  bryst: 'Chest',
  triceps: 'Triceps',
  skulder: 'Shoulder',
  ben: 'Legs',
  biceps: 'Biceps',
  mave: 'Abs',
  ryg: 'Back',
  cardio: 'Cardio',
  reformer: 'Reformer',
  pilates: 'Pilates',
};

/** @deprecated Prefer MUSCLE_GROUP_LABELS_BY_LOCALE.da */
export const MUSCLE_GROUP_LABELS_DK: Record<MuscleGroup, string> = {
  bryst: 'Bryst',
  triceps: 'Triceps',
  skulder: 'Skulder',
  ben: 'Ben',
  biceps: 'Biceps',
  mave: 'Mave',
  ryg: 'Ryg',
  cardio: 'Cardio',
  reformer: 'Reformer',
  pilates: 'Pilates',
};

const MUSCLE_GROUP_LABELS_BY_LOCALE: Record<string, Record<MuscleGroup, string>> = {
  en: MUSCLE_GROUP_LABELS_EN,
  da: MUSCLE_GROUP_LABELS_DK,
  sv: {
    bryst: 'Bröst',
    triceps: 'Triceps',
    skulder: 'Axlar',
    ben: 'Ben',
    biceps: 'Biceps',
    mave: 'Mage',
    ryg: 'Rygg',
    cardio: 'Cardio',
    reformer: 'Reformer',
    pilates: 'Pilates',
  },
  nb: {
    bryst: 'Bryst',
    triceps: 'Triceps',
    skulder: 'Skulder',
    ben: 'Ben',
    biceps: 'Biceps',
    mave: 'Mage',
    ryg: 'Rygg',
    cardio: 'Cardio',
    reformer: 'Reformer',
    pilates: 'Pilates',
  },
  de: {
    bryst: 'Brust',
    triceps: 'Trizeps',
    skulder: 'Schultern',
    ben: 'Beine',
    biceps: 'Bizeps',
    mave: 'Bauch',
    ryg: 'Rücken',
    cardio: 'Cardio',
    reformer: 'Reformer',
    pilates: 'Pilates',
  },
  fr: {
    bryst: 'Pectoraux',
    triceps: 'Triceps',
    skulder: 'Épaules',
    ben: 'Jambes',
    biceps: 'Biceps',
    mave: 'Abdos',
    ryg: 'Dos',
    cardio: 'Cardio',
    reformer: 'Reformer',
    pilates: 'Pilates',
  },
  es: {
    bryst: 'Pecho',
    triceps: 'Tríceps',
    skulder: 'Hombros',
    ben: 'Piernas',
    biceps: 'Bíceps',
    mave: 'Abdomen',
    ryg: 'Espalda',
    cardio: 'Cardio',
    reformer: 'Reformer',
    pilates: 'Pilates',
  },
  nl: {
    bryst: 'Borst',
    triceps: 'Triceps',
    skulder: 'Schouders',
    ben: 'Benen',
    biceps: 'Biceps',
    mave: 'Buik',
    ryg: 'Rug',
    cardio: 'Cardio',
    reformer: 'Reformer',
    pilates: 'Pilates',
  },
  it: {
    bryst: 'Petto',
    triceps: 'Tricipiti',
    skulder: 'Spalle',
    ben: 'Gambe',
    biceps: 'Bicipiti',
    mave: 'Addome',
    ryg: 'Schiena',
    cardio: 'Cardio',
    reformer: 'Reformer',
    pilates: 'Pilates',
  },
  pl: {
    bryst: 'Klatka',
    triceps: 'Triceps',
    skulder: 'Bark',
    ben: 'Nogi',
    biceps: 'Biceps',
    mave: 'Brzuch',
    ryg: 'Plecy',
    cardio: 'Cardio',
    reformer: 'Reformer',
    pilates: 'Pilates',
  },
  pt: {
    bryst: 'Peito',
    triceps: 'Tríceps',
    skulder: 'Ombros',
    ben: 'Pernas',
    biceps: 'Bíceps',
    mave: 'Abdômen',
    ryg: 'Costas',
    cardio: 'Cardio',
    reformer: 'Reformer',
    pilates: 'Pilates',
  },
  fi: {
    bryst: 'Rinta',
    triceps: 'Triceps',
    skulder: 'Olkapäät',
    ben: 'Jalat',
    biceps: 'Biceps',
    mave: 'Vatsa',
    ryg: 'Selkä',
    cardio: 'Cardio',
    reformer: 'Reformer',
    pilates: 'Pilates',
  },
  cs: {
    bryst: 'Hruď',
    triceps: 'Triceps',
    skulder: 'Ramena',
    ben: 'Nohy',
    biceps: 'Biceps',
    mave: 'Břicho',
    ryg: 'Záda',
    cardio: 'Cardio',
    reformer: 'Reformer',
    pilates: 'Pilates',
  },
  ro: {
    bryst: 'Piept',
    triceps: 'Triceps',
    skulder: 'Umeri',
    ben: 'Picioare',
    biceps: 'Biceps',
    mave: 'Abdomen',
    ryg: 'Spate',
    cardio: 'Cardio',
    reformer: 'Reformer',
    pilates: 'Pilates',
  },
  hu: {
    bryst: 'Mell',
    triceps: 'Tricepsz',
    skulder: 'Váll',
    ben: 'Láb',
    biceps: 'Bicepsz',
    mave: 'Has',
    ryg: 'Hát',
    cardio: 'Cardio',
    reformer: 'Reformer',
    pilates: 'Pilates',
  },
  el: {
    bryst: 'Στήθος',
    triceps: 'Τρικέφαλοι',
    skulder: 'Ώμοι',
    ben: 'Πόδια',
    biceps: 'Δικέφαλοι',
    mave: 'Κοιλιακοί',
    ryg: 'Πλάτη',
    cardio: 'Cardio',
    reformer: 'Reformer',
    pilates: 'Pilates',
  },
  tr: {
    bryst: 'Göğüs',
    triceps: 'Triceps',
    skulder: 'Omuz',
    ben: 'Bacak',
    biceps: 'Biceps',
    mave: 'Karın',
    ryg: 'Sırt',
    cardio: 'Cardio',
    reformer: 'Reformer',
    pilates: 'Pilates',
  },
  uk: {
    bryst: 'Груди',
    triceps: 'Трицепс',
    skulder: 'Плечі',
    ben: 'Ноги',
    biceps: 'Біцепс',
    mave: 'Прес',
    ryg: 'Спина',
    cardio: 'Cardio',
    reformer: 'Reformer',
    pilates: 'Pilates',
  },
  ja: {
    bryst: '胸',
    triceps: '上腕三頭筋',
    skulder: '肩',
    ben: '脚',
    biceps: '上腕二頭筋',
    mave: '腹筋',
    ryg: '背中',
    cardio: '有酸素',
    reformer: 'リフォーマー',
    pilates: 'ピラティス',
  },
  ko: {
    bryst: '가슴',
    triceps: '삼두',
    skulder: '어깨',
    ben: '하체',
    biceps: '이두',
    mave: '복근',
    ryg: '등',
    cardio: '유산소',
    reformer: '리포머',
    pilates: '필라테스',
  },
  'zh-Hans': {
    bryst: '胸部',
    triceps: '肱三头肌',
    skulder: '肩部',
    ben: '腿部',
    biceps: '肱二头肌',
    mave: '腹肌',
    ryg: '背部',
    cardio: '有氧',
    reformer: '器械床',
    pilates: '普拉提',
  },
  'zh-Hant': {
    bryst: '胸部',
    triceps: '肱三頭肌',
    skulder: '肩部',
    ben: '腿部',
    biceps: '肱二頭肌',
    mave: '腹肌',
    ryg: '背部',
    cardio: '有氧',
    reformer: '器械床',
    pilates: '皮拉提斯',
  },
  hi: {
    bryst: 'छाती',
    triceps: 'ट्राइसेप्स',
    skulder: 'कंधे',
    ben: 'पैर',
    biceps: 'बाइसेप्स',
    mave: 'एब्स',
    ryg: 'पीठ',
    cardio: 'कार्डियो',
    reformer: 'रिफॉर्मर',
    pilates: 'पाइलेट्स',
  },
  id: {
    bryst: 'Dada',
    triceps: 'Triceps',
    skulder: 'Bahu',
    ben: 'Kaki',
    biceps: 'Biceps',
    mave: 'Perut',
    ryg: 'Punggung',
    cardio: 'Kardio',
    reformer: 'Reformer',
    pilates: 'Pilates',
  },
  ms: {
    bryst: 'Dada',
    triceps: 'Triceps',
    skulder: 'Bahu',
    ben: 'Kaki',
    biceps: 'Biceps',
    mave: 'Perut',
    ryg: 'Belakang',
    cardio: 'Kardio',
    reformer: 'Reformer',
    pilates: 'Pilates',
  },
  vi: {
    bryst: 'Ngực',
    triceps: 'Tay sau',
    skulder: 'Vai',
    ben: 'Chân',
    biceps: 'Tay trước',
    mave: 'Bụng',
    ryg: 'Lưng',
    cardio: 'Cardio',
    reformer: 'Reformer',
    pilates: 'Pilates',
  },
  th: {
    bryst: 'อก',
    triceps: 'หลังแขน',
    skulder: 'ไหล่',
    ben: 'ขา',
    biceps: 'หน้าแขน',
    mave: 'หน้าท้อง',
    ryg: 'หลัง',
    cardio: 'คาร์ดิโอ',
    reformer: 'รีฟอร์มเมอร์',
    pilates: 'พิลาทิส',
  },
  ar: {
    bryst: 'صدر',
    triceps: 'ترايسبس',
    skulder: 'أكتاف',
    ben: 'أرجل',
    biceps: 'بايسبس',
    mave: 'بطن',
    ryg: 'ظهر',
    cardio: 'كارديو',
    reformer: 'ريфорمر',
    pilates: 'بيلاتس',
  },
  he: {
    bryst: 'חזה',
    triceps: 'תלת־ראשי',
    skulder: 'כתפיים',
    ben: 'רגליים',
    biceps: 'דו־ראשי',
    mave: 'בטן',
    ryg: 'גב',
    cardio: 'קרדיו',
    reformer: 'רפורמר',
    pilates: 'פילאטיס',
  },
};

const OPEN_WORKOUT_BY_LOCALE: Record<string, string> = {
  en: 'Open workout',
  da: 'Fri træning',
  sv: 'Fri träning',
  nb: 'Fri trening',
  de: 'Freies Training',
  fr: 'Séance libre',
  es: 'Entrenamiento libre',
  nl: 'Vrije training',
  it: 'Allenamento libero',
  pl: 'Trening otwarty',
  pt: 'Treino livre',
  fi: 'Vapaa treeni',
  cs: 'Volný trénink',
  ro: 'Antrenament liber',
  hu: 'Szabad edzés',
  el: 'Ελεύθερη προπόνηση',
  tr: 'Serbest antrenman',
  uk: 'Вільне тренування',
  ja: 'フリーワークアウト',
  ko: '자유 운동',
  'zh-Hans': '自由训练',
  'zh-Hant': '自由訓練',
  hi: 'फ्री वर्कआउट',
  id: 'Latihan bebas',
  ms: 'Latihan bebas',
  vi: 'Tập tự do',
  th: 'ออกกำลังกายอิสระ',
  ar: 'تمرين حر',
  he: 'אימון חופשי',
};

const WORKOUT_WORD_BY_LOCALE: Record<string, string> = {
  en: 'Workout',
  da: 'Træning',
  sv: 'Träning',
  nb: 'Trening',
  de: 'Training',
  fr: 'Séance',
  es: 'Entrenamiento',
  nl: 'Training',
  it: 'Allenamento',
  pl: 'Trening',
  pt: 'Treino',
  fi: 'Treeni',
  cs: 'Trénink',
  ro: 'Antrenament',
  hu: 'Edzés',
  el: 'Προπόνηση',
  tr: 'Antrenman',
  uk: 'Тренування',
  ja: 'ワークアウト',
  ko: '운동',
  'zh-Hans': '训练',
  'zh-Hant': '訓練',
  hi: 'वर्कआउट',
  id: 'Latihan',
  ms: 'Latihan',
  vi: 'Buổi tập',
  th: 'ออกกำลังกาย',
  ar: 'تمرين',
  he: 'אימון',
};

const ALL_KEYS = new Set<string>(Object.keys(MUSCLE_GROUP_LABELS_EN));

function pickLocaleMap<T>(
  language: string,
  table: Record<string, T>,
  fallback: T,
): T {
  return table[language] ?? fallback;
}

export function getMuscleGroupLabel(
  key: MuscleGroup,
  language: string,
): string {
  const pack = pickLocaleMap(
    language,
    MUSCLE_GROUP_LABELS_BY_LOCALE,
    MUSCLE_GROUP_LABELS_EN,
  );
  return pack[key] ?? MUSCLE_GROUP_LABELS_EN[key];
}

export function labelForMuscleToken(raw: string, language: string): string {
  const k = normalizeLegacyMuscleKey(raw.trim());
  if (k && ALL_KEYS.has(k)) {
    return getMuscleGroupLabel(k as MuscleGroup, language);
  }
  const u = raw.trim();
  if (u.toLowerCase() === 'fri') {
    return pickLocaleMap(language, OPEN_WORKOUT_BY_LOCALE, OPEN_WORKOUT_BY_LOCALE.en);
  }
  return (
    u ||
    pickLocaleMap(language, WORKOUT_WORD_BY_LOCALE, WORKOUT_WORD_BY_LOCALE.en)
  );
}

/** Map a display label or key back to a stable MuscleGroup key when possible. */
export function resolveMuscleTokenToKey(raw: string): MuscleGroup | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  const asKey = normalizeLegacyMuscleKey(trimmed);
  if (ALL_KEYS.has(asKey)) {
    return asKey as MuscleGroup;
  }
  const lower = trimmed.toLowerCase();
  for (const pack of Object.values(MUSCLE_GROUP_LABELS_BY_LOCALE)) {
    for (const [key, label] of Object.entries(pack)) {
      if (label.toLowerCase() === lower) {
        return key as MuscleGroup;
      }
    }
  }
  return null;
}

export function normalizeLegacyMuscleKey(part: string): string {
  const p = part.trim().toLowerCase().replace(/\s+/g, '_');
  if (p === 'hele_kroppen') {
    return 'cardio';
  }
  return p;
}

export function coerceMuscleGroup(raw: string): MuscleGroup {
  const k = normalizeLegacyMuscleKey(raw);
  return ALL_KEYS.has(k) ? (k as MuscleGroup) : 'cardio';
}

export function encodeMuscleGroupsForSession(groups: MuscleGroup[]): string {
  const sorted = [...new Set(groups)].sort();
  return sorted.join(',');
}

export function workoutTypeForFirestoreCheckIn(
  encoded: string,
): string | undefined {
  const t = encoded.trim();
  return t.length > 0 ? t : undefined;
}

export function formatWorkoutTypeDisplay(
  workoutType: string | undefined | null,
  language: string = 'en',
): string {
  if (!workoutType?.trim()) {
    return getMuscleGroupLabel('cardio', language);
  }
  const parts = workoutType.split(',').map(s => s.trim()).filter(Boolean);
  if (parts.length === 0) {
    return getMuscleGroupLabel('cardio', language);
  }
  return parts.map(p => labelForMuscleToken(p, language)).join(', ');
}

export function parseMuscleGroupsFromSession(workoutType: string): MuscleGroup[] {
  if (!workoutType?.trim()) {
    return ['cardio'];
  }
  const parts = workoutType
    .split(',')
    .map(s => normalizeLegacyMuscleKey(s.trim()))
    .filter(Boolean);
  const valid = parts.filter(p => ALL_KEYS.has(p)) as MuscleGroup[];
  return valid.length > 0 ? valid : ['cardio'];
}

export function toggleCheckInMuscleGroup(
  prev: MuscleGroup[],
  key: MuscleGroup,
): MuscleGroup[] {
  if (prev.includes(key)) {
    return prev.filter(k => k !== key);
  }
  return [...prev, key];
}
