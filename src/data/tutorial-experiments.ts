import {practicalTutorialExperiments} from './practical-tutorial-experiments';
export interface ExperimentState { id:string; label:string; title:string; value:string; unit:string; caption:string }
export interface TutorialExperiment {kind:string;title:string;question:string;states:ExperimentState[]}
export const tutorialExperiments:Record<string,TutorialExperiment>={
 ...practicalTutorialExperiments,
 'duckdb-nested-json':{kind:'json',title:'Where did Ben’s order go?',question:'Switch between an item report and an order-preserving report.',states:[
  {id:'expand',label:'Expand items',title:'An empty array contributes no item rows',value:'2 of 3',unit:'order IDs remain',caption:'Ada produces two item rows and Cy produces one. Ben’s empty list produces none. Three output rows still represent only two orders.'},
  {id:'preserve',label:'Keep every order',title:'Keep a place for the empty order',value:'3 of 3',unit:'order IDs remain',caption:'A left join keeps Ben with NULL item fields. There are four output rows, including one placeholder that is not an item.'},
 ]},
 'duckdb-join-double-counting':{kind:'join',title:'Watch the total grow without a new sale',question:'The same three orders take two different routes through the join.',states:[
  {id:'expanded',label:'Join item rows',title:'Each matching item repeats its order total',value:'420',unit:'incorrect order revenue',caption:'100 appears twice, 60 once, and 80 twice. The join has five rows because it describes order–item pairs.'},
  {id:'grouped',label:'Group items first',title:'One item summary meets one order',value:'240',unit:'correct order revenue',caption:'The item side now has one row per order ID. Each order total contributes once: 100 + 60 + 80.'},
 ]},
 'duckdb-latest-row-per-group':{kind:'latest',title:'Two records. One timestamp. Which wins?',question:'Give Ada’s updates an explicit tie-break instead of trusting row order.',states:[
  {id:'tie',label:'Timestamp only',title:'The newest timestamp is not unique',value:'2',unit:'records tied at 10:00',caption:'Ada’s Team and Pro updates share a timestamp. Time alone cannot choose a deterministic winner.'},
  {id:'resolved',label:'Break ties by ID',title:'Our ingestion-sequence rule chooses ID 3',value:'Pro',unit:'Ada’s selected current plan',caption:'Order by updated_at descending, then the unique ingestion ID descending. ID 3 wins this declared tie-break.'},
 ]},
 'duckdb-clean-messy-csv':{kind:'csv',title:'A number can parse and still be wrong',question:'Choose how much of the invoice contract to check.',states:[
  {id:'numeric',label:'Check amounts only',title:'Five amounts can become numbers',value:'5',unit:'rows pass the numeric check',caption:'That still admits an impossible invoice date and a negative amount. Parsing answers only part of the question.'},
  {id:'contract',label:'Check the full row',title:'Three invoices satisfy every rule',value:'3 + 4',unit:'accepted + review = 7 inputs',caption:'Keep three accepted invoices. Retain the four review records with their original fields and the first failed rule.'},
 ]},
 'duckdb-json-schema-validation':{kind:'schema',title:'Same field name. Different contract result.',question:'Our contract requires a nonnegative number for total.',states:[
  {id:'string',label:'"40"',title:'Text is not a numeric total',value:'Fails',unit:'wrong JSON value type',caption:'A quoted number remains a JSON string. Valid JSON syntax does not mean the document follows the contract.'},
  {id:'number',label:'40',title:'A nonnegative number satisfies this field rule',value:'Passes',unit:'numeric total, within range',caption:'The sample document also has the required integer order_id and an allowed status. All its declared checks pass.'},
  {id:'negative',label:'−5',title:'A number can still violate the minimum',value:'Fails',unit:'below the minimum of zero',caption:'The type is correct, but the value is outside this invoice contract. A parsing check alone would miss it.'},
 ]},
 'duckdb-merge-distinct-counts':{kind:'sketch',title:'Returning visitors do not become new people',question:'Add another day and follow which IDs are actually new to the period.',states:[
  {id:'two-days',label:'First two days',title:'Six daily memberships belong to four IDs',value:'6 ≠ 4',unit:'daily counts versus period distinct IDs',caption:'Ben and Cy appear on both days. The union contains Ada, Ben, Cy, and Dee.'},
  {id:'three-days',label:'Add day three',title:'Ada returns; Eli is the new ID',value:'8 ≠ 5',unit:'daily counts versus period distinct IDs',caption:'Adding two daily visitors increases the period’s distinct count by only one. The diagram shows exact sets; the SQL below introduces approximate sketches.'},
 ]},
 'duckdb-asof-join':{kind:'asof',title:'Move an order along the price history',question:'Each WREN price applies from its timestamp until the next update.',states:[
  {id:'before',label:'08:55',title:'Before the first known price',value:'NULL',unit:'order 101 has no applicable price',caption:'The 09:00 price is in the future. An ASOF LEFT JOIN preserves the order without inventing a price.'},
  {id:'exact',label:'09:00',title:'An exact-time update counts',value:'10.00',unit:'price for order 102',caption:'Our >= condition includes a price published at exactly the order’s timestamp.'},
  {id:'between',label:'09:15',title:'Use the latest price already in effect',value:'12.00',unit:'price for order 103',caption:'The 09:10 update is the nearest earlier one. The next update at 09:25 must not leak into this order.'},
  {id:'after',label:'09:30',title:'Move forward when a new price takes effect',value:'11.50',unit:'price for order 104',caption:'All three prices are earlier, but only the most recent one is applicable.'},
 ]},
 'duckdb-parquet-metadata':{kind:'parquet',title:'Which row groups could hold this day?',question:'Same 8,192 records. Four groups. Change the layout or the filter.',states:[
  {id:'sorted-two',label:'Sorted · Jan 2',title:'One group’s range overlaps the filter',value:'1 of 4',unit:'candidate row groups',caption:'Group 1 holds January 2. The other date ranges rule out a match in this fixture.'},
  {id:'mixed-two',label:'Mixed · Jan 2',title:'Every range overlaps the filter',value:'4 of 4',unit:'candidate row groups',caption:'Each mixed group spans January 1–4. Min/max statistics alone cannot exclude any of them.'},
  {id:'sorted-three',label:'Sorted · Jan 3',title:'The candidate moves with the date',value:'1 of 4',unit:'candidate row groups',caption:'Now group 2 is the candidate. These are opportunities to skip groups, not a measurement of bytes read.'},
 ]},
 'duckdb-explain':{kind:'explain',title:'Follow the plan from the input upward',question:'Select an operator to read its role and its captured estimate.',states:[
  {id:'scan',label:'1. Scan',title:'Keep paid orders at the scan',value:'~4',unit:'estimated scan output rows',caption:'The captured planner estimate is four. The fixture actually contains six paid orders; EXPLAIN has not measured execution.'},
  {id:'group',label:'2. Aggregate',title:'Sum amounts within each region',value:'~2',unit:'estimated result groups',caption:'The aggregate consumes the filtered values and produces one sum per region. The #0 and #1 references are internal column positions.'},
  {id:'sort',label:'3. Sort',title:'Order the regional totals',value:'~2',unit:'estimated rows to order',caption:'Sort the aggregate’s output by total descending, then region. This is a simplified view of the captured plan, with projection operators omitted.'},
 ]},
 'duckdb-explain-analyze':{kind:'profile',title:'One output row can hide a lot of intermediate work',question:'Inspect the measured counts before and after the eligibility repair.',states:[
  {id:'scan',label:'Paid orders',title:'The filtered orders scan produces 8,000 rows',value:'8,000',unit:'actual scan output rows',caption:'There are 10,000 stored orders. The paid filter passes 8,000 to the next operator.'},
  {id:'inner',label:'Inner join',title:'Two campaigns turn each order into two pairs',value:'16,000',unit:'actual inner-join output rows',caption:'The final COUNT returns one row containing 16,000. It counted order–campaign pairs, not eligible orders.'},
  {id:'semi',label:'EXISTS / semi join',title:'Eligibility retains each order once',value:'8,000',unit:'actual semi-join output rows',caption:'In the captured build, EXISTS becomes a semi join. Its output count matches the intended one-record-per-order question.'},
 ]},
};
