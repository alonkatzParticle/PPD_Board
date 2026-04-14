/**
 * Marketing team members available for task assignment on the Planning page.
 * Edit this array to add or remove people — changes take effect immediately.
 */
export const TEAM_MEMBERS = [
  "Anton Shpakovskiy",
  "Lilian Krumholz",
  "Tom Tabaritzi",
  "Alon Katz",
] as const;

export type TeamMember = (typeof TEAM_MEMBERS)[number];
