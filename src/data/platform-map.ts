export type PlatformMapFlow = 'curve' | 'orthogonal' | 'straight' | 'sweep' | 'stepped';

export interface PlatformMapDefinition {
  slug: string;
  name: string;
  flow: PlatformMapFlow;
  treatment:
    | 'furrows'
    | 'terraces'
    | 'metro'
    | 'loom'
    | 'circuit'
    | 'irrigation'
    | 'cutaway'
    | 'constellation'
    | 'conveyor'
    | 'blueprint';
  centers: number[][];
}

export const platformMap: PlatformMapDefinition = {
  slug: 'query-farm-product-map',
  name: 'Query.Farm product map',
  flow: 'orthogonal',
  treatment: 'circuit',
  centers: [[430, 790, 350, 870], [410, 810], [360, 840], [610], [360, 840], [610]],
};
