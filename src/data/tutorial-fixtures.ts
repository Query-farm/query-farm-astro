export type TutorialCell = string | number | boolean | null;
export interface ChallengeDefinition {
  id: string; title: string; prompt: string; hint: string;
  starter: string; solution: string; success: string;
  columns: string[]; rows: TutorialCell[][];
}
export interface TutorialFixture {
  slug: string; extension: string; setup: string; batch?: string;
  examples: {id: string; title: string; sql: string; browser?: boolean;
    expectedColumns?: string[]; expectedRows?: TutorialCell[][];
    planExcerpt?: string; planLabel?: string; planNote?: string}[];
  challenge?: ChallengeDefinition;
}
/** Keep registration automatic as the tutorial library grows. */
export const tutorialFixtures = Object.values(import.meta.glob<TutorialFixture>(
  './tutorials/*.json', {eager: true, import: 'default'},
));
