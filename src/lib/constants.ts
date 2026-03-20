export const SHOW_TIMES = ["10:45", "13:00", "15:15", "17:30", "19:45"] as const;
export type ShowTime = (typeof SHOW_TIMES)[number];

export const SHOW_TIME_LABELS: Record<ShowTime, string> = {
  "10:45": "1회 10:45",
  "13:00": "2회 13:00",
  "15:15": "3회 15:15",
  "17:30": "4회 17:30",
  "19:45": "5회 19:45",
};

export const PERFORMANCE_PRICES = {
  weekday: 200000,
  weekend: 240000,
} as const;

export const MINIMUM_WAGE: Record<number, number> = {
  2024: 9860,
  2025: 10030,
  2026: 10030,
};

export const EXTRA_SHOW_RATE = 15000;
