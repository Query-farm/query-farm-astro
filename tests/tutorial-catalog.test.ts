import test from 'node:test';
import assert from 'node:assert/strict';
import {PAGE_SIZE, defaultCatalogState, selectTutorials, catalogFacetCounts, parseCatalogState, catalogQuery, type CatalogItem} from '../src/lib/tutorial-catalog';
const items: CatalogItem[] = Array.from({length:125}, (_,i)=>({
  id:`lesson-${i}`,title:`Lesson ${String(i).padStart(3,'0')}`,outcome:i<60?'Compare Parquet exports':'Match customer names',
  category:i<60?'files-formats':'clean-match',technologies:i<60?['duckdb','parquet']:['duckdb','rapidfuzz'],keywords:[],
}));
test('125 tutorials paginate completely without duplicates or omissions',()=>{
 const ids:string[]=[];
 for(let page=1;page<=11;page++){
  const result=selectTutorials(items,{...defaultCatalogState,page});
  assert.equal(result.total,125);assert.equal(result.pages,11);
  assert.equal(result.items.length,page===11?5:PAGE_SIZE);ids.push(...result.items.map(item=>item.id));
 }
 assert.deepEqual(ids,items.map(item=>item.id));assert.equal(new Set(ids).size,125);
});
test('OR within a facet, AND across facets, without duplicate results',()=>{
 const both={...defaultCatalogState,categories:['files-formats','clean-match']};
 assert.equal(selectTutorials(items,both).total,125);
 assert.equal(selectTutorials(items,{...both,tools:['parquet']}).total,60);
 assert.equal(selectTutorials(items,{...both,tools:['parquet','rapidfuzz','duckdb']}).total,125);
 assert.equal(selectTutorials(items,{...defaultCatalogState,q:'PARQUET exports',categories:['files-formats'],tools:['parquet']}).total,60);
 assert.equal(selectTutorials(items,{...defaultCatalogState,categories:['files-formats'],tools:['rapidfuzz']}).total,0);
});
test('facet counts retain alternatives and respect the other facet and query',()=>{
 assert.deepEqual(catalogFacetCounts(items,{...defaultCatalogState,categories:['files-formats']}),{
  categories:{'files-formats':60,'clean-match':65},tools:{duckdb:60,parquet:60},
 });
 assert.deepEqual(catalogFacetCounts(items,{...defaultCatalogState,tools:['rapidfuzz']}),{
  categories:{'clean-match':65},tools:{duckdb:125,parquet:60,rapidfuzz:65},
 });
 assert.deepEqual(catalogFacetCounts(items,{...defaultCatalogState,q:'customer'}),{
  categories:{'clean-match':65},tools:{duckdb:65,rapidfuzz:65},
 });
});
test('bookmarks round-trip multiple choices, clamp pages and discard removed filters',()=>{
 const state=parseCatalogState(new URLSearchParams('category=clean-match&category=files-formats&category=clean-match&tool=rapidfuzz&tool=parquet&page=999'));
 assert.equal(state.categories.length,2);assert.equal(selectTutorials(items,state).page,11);
 assert.deepEqual(parseCatalogState(new URLSearchParams(catalogQuery(state))),state);
 assert.deepEqual(parseCatalogState(new URLSearchParams('category=invalid&tool=invalid&level=beginner&runtime=native&sort=updated&page=-1')),defaultCatalogState);
 assert.equal(selectTutorials(items,{...defaultCatalogState,q:'does not exist',page:99}).page,1);
});
test('editorial priority is optional, with a stable alphabetical fallback',()=>{
 const sample=[...items,{...items[0],id:'featured',title:'Z featured',order:1}];
 assert.equal(selectTutorials(sample,defaultCatalogState).items[0].id,'featured');
 assert.equal(selectTutorials(items,defaultCatalogState).items[0].id,'lesson-0');
});
