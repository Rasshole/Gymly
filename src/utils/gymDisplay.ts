import danishGyms, {DanishGym} from '@/data/danishGyms';

const titleCase = (value: string) =>
  value
    .split(' ')
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

export const formatGymDisplayName = (gym?: DanishGym | null) => {
  if (!gym) {
    return 'Ubekendt center';
  }

  const base = gym.name?.trim() || 'Ubekendt center';
  const location = gym.city || gym.brand || '';

  if (!location) {
    return base;
  }

  if (base.toLowerCase().includes(location.trim().toLowerCase())) {
    return base;
  }

  return `${base} ${titleCase(location.trim())}`;
};

export const findGymById = (id?: number | null): DanishGym | null => {
  if (!id) {
    return null;
  }
  return danishGyms.find(gym => gym.id === id) || null;
};


