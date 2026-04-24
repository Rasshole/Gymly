/**
 * Master center record — single source of truth (see src/data/centers.json)
 */
export type GymCenter = {
  id: string;
  name: string;
  brand: string;
  address: string;
  postal_code: string;
  city: string;
  country: string;
  lat: number | null;
  lng: number | null;
  is_active: boolean;
  is_coming_soon?: boolean;
};
