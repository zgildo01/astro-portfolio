export const SCENE_IDS = [
  "waiting",
  "control",
  "botanical",
  "stairs",
  "hall",
  "reception",
  "arrival",
  "signal",
  "bloom",
  "reflection",
  "passage"
] as const;

export type SceneId = (typeof SCENE_IDS)[number];

export interface SceneImage {
  id: SceneId;
  number: string;
  name: string;
  location: string;
  label: string;
  description: string;
  alt: string;
  src: string;
  srcSet: string;
  width: number;
  height: number;
}

export interface NetworkReadout {
  clientIp: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  provider: string | null;
  source: string;
  locationBasis: string;
}
