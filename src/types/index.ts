export const ROLE = {
  ADMIN: "ADMIN",
  ACTOR: "ACTOR",
} as const;

export const ROLE_TYPE = {
  MALE_LEAD: "MALE_LEAD",
  FEMALE_LEAD: "FEMALE_LEAD",
} as const;

export type Role = (typeof ROLE)[keyof typeof ROLE];
export type RoleType = (typeof ROLE_TYPE)[keyof typeof ROLE_TYPE];

export const ROLE_TYPE_LABEL: Record<RoleType, string> = {
  MALE_LEAD: "남1",
  FEMALE_LEAD: "여1",
};
