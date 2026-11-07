import type {TutorialExperiment} from './tutorial-experiments';
export const practicalTutorialExperiments: Record<string,TutorialExperiment> = {
 'duckdb-event-sessions': {kind:'sessions',title:'When does Ada’s next visit begin?',question:'Change the inactivity rule. Exactly the threshold still belongs to the same session.',states:[
  {id:'30',label:'30-minute gap',value:'2',unit:'sessions on January 5',title:'A 30-minute gap stays; 35 minutes starts again',caption:'The first five events belong together. Only the 10:20 event starts another session. The elapsed time since arrival is not the inactivity gap.'},
  {id:'20',label:'20-minute gap',value:'3',unit:'sessions on January 5',title:'A tighter threshold splits two gaps',caption:'Both the 30-minute and 35-minute gaps exceed 20 minutes. The same six clicks now describe three sessions.'},
  {id:'45',label:'45-minute gap',value:'1',unit:'session on January 5',title:'All adjacent gaps fit inside the rule',caption:'The whole 80-minute span becomes one session because no gap between neighboring events exceeds 45 minutes.'},
 ]},
 'duckdb-conversion-funnel': {kind:'funnel',title:'Having the events is only half the story',question:'Inspect a visitor’s first session against view → run → enquiry, within 30 minutes of entry.',states:[
  {id:'ada',label:'Ada',value:'Yes',unit:'completed the ordered funnel',title:'Repeated runs still describe one conversion',caption:'Ada views at 09:00, runs at 09:05 and 09:06, and enquires at 09:15. Select the earliest valid run; count the session once.'},
  {id:'ben',label:'Ben',value:'No',unit:'run happened before the view',title:'Presence-only counting admits the wrong sequence',caption:'Ben runs at 10:00, views at 10:05, and enquires at 10:08. There is no qualifying run after his entry view.'},
  {id:'cy',label:'Cy',value:'No',unit:'enquiry belongs to a later session',title:'The right order is not sufficient either',caption:'Cy views at 09:00 and runs at 09:02. The 10:00 enquiry is beyond the 30-minute conversion window and follows a 58-minute inactivity gap.'},
  {id:'dee',label:'Dee',value:'Yes',unit:'completed the ordered funnel',title:'Three steps, in sequence, inside the window',caption:'Dee views at 11:00, runs at 11:04, and enquires at 11:12. This is the second qualifying session in the fixture.'},
 ]},
 'duckdb-seven-day-average': {kind:'calendar',title:'Three denominators. Three different answers.',question:'Compare the windows ending January 11. Outlined gaps have no source record.',states:[
  {id:'rows',label:'Last 7 rows',value:'42',unit:'294 orders ÷ 7 observations',title:'Seven observations reach all the way back to January 2',caption:'ROWS counts records. Missing dates do not occupy a place in the frame.'},
  {id:'range',label:'7-day range',value:'56',unit:'280 orders ÷ 5 observed dates',title:'The date interval is right, but the gaps remain absent',caption:'January 5–11 contains only five measurements. AVG divides by those five values, not by seven calendar days.'},
  {id:'filled',label:'Calendar + zeros',value:'40',unit:'280 orders ÷ 7 calendar dates',title:'A complete calendar changes the denominator',caption:'Only use these zeros if an absent row is known to mean no orders. An unknown measurement should stay unknown.'},
 ]},
 'duckdb-combine-changing-files': {kind:'schemas',title:'A new column meets an old file',question:'First align the fields. Then decide which values meet the analytical contract.',states:[
  {id:'aligned',label:'Align column names',value:'4',unit:'rows, with coupon preserved',title:'Older rows get a NULL coupon',caption:'union_by_name keeps the new field. It does not explain why a field is missing or validate the amount text.'},
  {id:'typed',label:'Convert amounts',value:'3 + 1',unit:'numeric amounts + review row',title:'Pending is not a numeric amount',caption:'TRY_CAST produces NULL for row 4. Keep its original text and review status so an aggregate cannot silently hide the problem.'},
 ]},
 'duckdb-pivot-unpivot': {kind:'reshape',title:'Follow the blank cell through the reshape',question:'North’s February value is unknown. South’s March value is a measured zero.',states:[
  {id:'wide',label:'Spreadsheet',value:'6',unit:'region–month cells',title:'Two regions, three month columns',caption:'The spreadsheet is easy to scan, but month is encoded in the column names.'},
  {id:'sparse',label:'Default UNPIVOT',value:'5',unit:'rows after dropping NULL',title:'The unknown February cell disappears',caption:'The default unpivot output contains only the five non-NULL values. Zero is retained.'},
  {id:'complete',label:'INCLUDE NULLS',value:'6',unit:'rows, including the unknown',title:'Every source cell gets a row',caption:'The long-form table preserves North February as NULL, making missing-measurement checks possible.'},
  {id:'report',label:'PIVOT report',value:'2',unit:'rows in the regional report',title:'Choose the report shape deliberately',caption:'The explicit month list fixes column order. SUM combines values at the region–month grain; it does not make unknown values zero.'},
 ]},
 'duckdb-retention-cohorts': {kind:'cohort',title:'A blank square is not zero retention',question:'Select a cohort cell to inspect the people and observation period behind it.',states:[
  {id:'return',label:'Jan 5 · week 1',value:'50%',unit:'1 returning person ÷ 2 signups',title:'Ada returns; Ben does not',caption:'The denominator remains both people who joined in the January 5 cohort, even though only Ada appears during January 12–18.'},
  {id:'zero',label:'Jan 12 · week 1',value:'0%',unit:'0 returning people ÷ 2 signups',title:'A complete observed week with no return events',caption:'January 19–25 is inside our observation window. Neither Cy nor Dee returned, so the recorded activity count is zero.'},
  {id:'future',label:'Jan 19 · week 1',value:'—',unit:'period is not yet observed',title:'Eli’s next week is beyond the cutoff',caption:'The dataset ends before January 26. We cannot say whether Eli returns during January 26–February 1.'},
 ]},
 'duckdb-overall-p95': {kind:'percentile',title:'Find the 95th request in the line',question:'Every dot represents one request, sorted by latency. Ninety-five take 100 ms; five take 1,000 ms.',states:[
  {id:'exact',label:'Pooled discrete p95',value:'100 ms',unit:'the 95th sorted observation',title:'The 95th request is still in the fast group',caption:'The cumulative share at 100 ms reaches 95%. The discrete percentile returns that observed value.'},
  {id:'mean',label:'Average regional p95',value:'550 ms',unit:'incorrect overall discrete p95',title:'Equal weighting gives the small region too much influence',caption:'(100 + 1,000) ÷ 2 averages two summaries. It does not locate a request in the pooled distribution.'},
  {id:'weighted',label:'Weight regional p95',value:'145 ms',unit:'still not the overall discrete p95',title:'Request counts cannot restore the missing distribution',caption:'(95 × 100 + 5 × 1,000) ÷ 100 is a weighted mean of percentiles. The actual discrete p95 remains 100 ms.'},
 ]},
 'duckdb-jsonata-api-responses': {kind:'transform',title:'Build the document your consumer expects',question:'Choose a transformation to see which parts of the supplied order documents it uses.',states:[
  {id:'rename',label:'Select + rename',value:'2',unit:'fields in the small summary',title:'A nested value becomes a direct field',caption:'id becomes order_id, and buyer.name becomes customer. Unselected input fields are left out.'},
  {id:'arrays',label:'Keep array shapes',value:'0 / 1 / 2',unit:'items; always a JSON array',title:'One match does not need a special scalar case',caption:'Explicit array construction gives Ben [], Cy ["MUG"], and Ada ["MUG","TEA"]. The receiver can iterate the same shape.'},
  {id:'total',label:'Calculate totals',value:'33',unit:'Ada’s order total in USD',title:'Compute line amounts within the document',caption:'Two mugs at 12.50 plus one tea at 8.00 total 33. The output carries currency alongside the amount.'},
 ]},
 'duckdb-repeatable-experiment-groups': {kind:'buckets',title:'The bucket stays. The rollout boundary moves.',question:'Keep xxh3_64, seed 42, and the onboarding-v1 prefix fixed while changing who receives treatment.',states:[
  {id:'20',label:'20% of buckets',value:'2 of 8',unit:'sample users in treatment',title:'Ben and Hao fall below bucket 20',caption:'A 20% share of bucket space does not guarantee exactly 20% of a tiny sample. No user needs to be reshuffled to force that proportion.'},
  {id:'50',label:'50% of buckets',value:'3 of 8',unit:'sample users in treatment',title:'Cy joins; Ben and Hao stay',caption:'Cy’s bucket is 45, inside the newly included interval [20, 50). The bucket calculation has not changed.'},
  {id:'ivy',label:'Add Ivy at 20%',value:'3 of 9',unit:'sample users in treatment',title:'A new ID does not renumber everyone else',caption:'Ivy hashes to bucket 11. All eight existing users keep their original buckets.'},
 ]},
 'duckdb-anti-join-null': {kind:'absence',title:'One unknown ID changes NOT IN',question:'Inspect the predicate, then ask whether a matching row actually exists.',states:[
  {id:'predicate',label:'NOT IN predicate',value:'NULL',unit:'predicate for Ben and Dee',title:'Unknown is not true',caption:'The subquery includes a NULL. Ben and Dee are not known matches, but NOT IN cannot establish that they differ from the unknown value. WHERE drops them.'},
  {id:'customers',label:'Customers ANTI orders',value:'2',unit:'customers without a matching order',title:'Ben and Dee have no matching right-hand row',caption:'Ordinary equality finds no order for either customer. The unknown order does not match them or disqualify them.'},
  {id:'orders',label:'Orders ANTI customers',value:'103',unit:'unmatched order ID',title:'Turn the audit around and preserve the unknown',caption:'With orders on the left, order 103 survives because its NULL customer ID matches no known customer under ordinary equality.'},
 ]},
};
