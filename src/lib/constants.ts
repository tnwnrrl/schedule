export const SHOW_TIMES = ["10:45", "13:00", "15:15", "17:30", "19:45"] as const;
export type ShowTime = (typeof SHOW_TIMES)[number];

export const SHOW_TIME_LABELS: Record<ShowTime, string> = {
  "10:45": "1회 10:45",
  "13:00": "2회 13:00",
  "15:15": "3회 15:15",
  "17:30": "4회 17:30",
  "19:45": "5회 19:45",
};
