import financeQueries from '../../public/crossfield/examples/finance/queries.json';
import fulfillmentQueries from '../../public/crossfield/examples/fulfillment/queries.json';
import financeCapture from '../../public/crossfield/examples/finance/explain-semantic.json';
import fulfillmentCapture from '../../public/crossfield/examples/fulfillment/explain-semantic.json';
import { portfolioAttachSQL, portfolioStrictSQL } from './crossfield';

export interface Scenario {
  id: 'fulfillment' | 'investment'; label: string; choiceDescription: string; heading: string;
  paragraphs: string[]; sourceNote: string; guide: string; bundle: string;
  comparisonCaption: string;
  interpretations: { label: string; meaning: string; result: string }[];
  outcomeRule: string; outcomeValue: string; outcomeLabel: string; outcomeImpact: string;
  attach: string; strict: string; attachment: string; model: string;
  explanation: string; explainQuery: string; expanded: string;
  revision: {
    source: string; sourceDetail: string;
    current: { rule: string; detail: string; result: string; resultDetail: string };
    proposed: { catalog: string; rule: string; detail: string; result: string; resultDetail: string };
    change: string; changeUnit: string; impact: string;
  };
}
export const crossfieldScenarios: Scenario[] = [
  {
    id: 'fulfillment', label: 'Order fulfillment',
    choiceDescription: 'Measure whether customers receive complete orders on time.',
    heading: 'Three reports use the same “on-time delivery” label for different measures.',
    paragraphs: [
      'The warehouse reports on individual shipments. Customer service looks at complete orders. Another report uses delivery promises that were revised after the order was placed. Each measure can serve a legitimate reporting purpose. Using the same label for all three obscures which question each report answers.',
      'Before deciding whether service is improving, the team has to establish what each number means: which deliveries count, whether incomplete orders are included, and which promise date applies.',
    ],
    comparisonCaption: 'The same synthetic source snapshot, interpreted three ways. Five of six delivered shipments were on time. Of four eligible orders, two were complete by the original promise and three by revised promises.',
    interpretations: [
      { label: 'Shipment dashboard', meaning: 'Delivered shipments that arrived by the original promise. Items still undelivered are absent.', result: '83.3%' },
      { label: 'Customer service report', meaning: 'Complete orders delivered by the original promise. Incomplete orders stay in the denominator.', result: '50%' },
      { label: 'Revised-promise report', meaning: 'The same orders, evaluated against revised delivery promises.', result: '75%' },
    ],
    outcomeRule: 'The business chooses complete orders delivered by the original promise as its customer-service measure. The model excludes canceled orders and keeps incomplete orders in the eligible population.',
    outcomeValue: '50%', outcomeLabel: 'Complete orders delivered by the original promise',
    outcomeImpact: 'Analysts and AI agents can query that named metric by region or overall without reconstructing its rules. A proposed change to revised promises is reviewed separately, so a change in the definition is visible before it changes reporting.',
    sourceNote: 'Synthetic orders originally due January 31, observed through February 3. The setup prepares one stored fact per order from its shipments. The model owns eligibility and the complete, on-time calculation.',
    guide: '/products/crossfield/docs/fulfillment', bundle: 'fulfillment',
    attach: `ATTACH 'fulfillment-current.package.json' AS operations (\n    TYPE crossfield,\n    BINDINGS '{"warehouse":"warehouse"}'\n);`,
    strict: "USE operations.semantic;\nSET crossfield_mode = 'strict';", attachment:'operations',model:'fulfillment',
    explanation: 'The generated SQL shows the original January 31 promise date and cancellation filter, then checks that every unit arrived by the promised date. Incomplete orders contribute to the eligible count, without contributing to the on-time count.',
    explainQuery:fulfillmentQueries.region,expanded:fulfillmentCapture.expanded_sql,
    revision: {
      source: 'The same four eligible orders and shipment records',
      sourceDetail: 'Originally due January 31 · Observed through February 3',
      current: { rule: 'Original delivery promise', detail: 'An order is on time only if every unit arrived by the original promised date.', result: '50%', resultDetail: '2 of 4 orders complete and on time' },
      proposed: { catalog: 'revised', rule: 'Revised delivery promise', detail: 'Evaluate the same orders against their revised promised dates.', result: '75%', resultDetail: '3 of 4 orders complete and on time' },
      change: '+25', changeUnit: 'percentage points',
      impact: 'The reported rate rises because the delivery standard changed. No additional orders were delivered. Reviewers can measure that effect before adopting the new definition.',
    },
  },
  {
    id:'investment',label:'Investment reporting',
    choiceDescription: 'Keep portfolio exposure consistent across reports and AI-generated analysis.',
    heading:'Three reports use the same “exposure” label for different calculations and portfolio scopes.',
    paragraphs:[
      'One portfolio report adds the absolute values of long and short positions. Another lets them offset. A third includes an additional trading book. Labeling all three “exposure” hides decisions that materially change the answer.',
      'The team must reconcile the calculation, included positions and valuation date before using the numbers. An AI agent querying the same position records also needs those decisions made explicit.',
    ],
    comparisonCaption:'The same synthetic January 31 USD position records. Book A and Book B contain Atlas positions of +$12m and −$8m, plus a $3m Boreal position. The Expansion book adds $5m.',
    interpretations:[
      {label:'Gross exposure, current books',meaning:'Add absolute position values in Book A and Book B at the January 31 close.',result:'$23m'},
      {label:'Net exposure, current books',meaning:'Add signed values, allowing the long and short positions to offset.',result:'$7m'},
      {label:'Gross exposure, broader scope',meaning:'Use the gross calculation and also include the Expansion book.',result:'$28m'},
    ],
    outcomeRule:'For this report, the business chooses gross exposure for Book A and Book B at the January 31 close. The model names gross and net separately and makes the included books and date explicit.',
    outcomeValue:'$23m',outcomeLabel:'Gross exposure for the approved reporting scope',
    outcomeImpact:'Reporting teams and AI agents reuse the same measure by issuer, by book or overall. Net exposure remains a distinct valid metric. A proposed scope expansion can be compared with the current model before it reaches reporting.',
    sourceNote:'Synthetic cash equities already valued in USD. This example covers reporting definitions, not pricing, FX conversion, derivatives netting, or a complete risk calculation.',
    guide:'/products/crossfield/docs/trading',bundle:'finance',
    attach:portfolioAttachSQL,strict:portfolioStrictSQL,attachment:'portfolio',model:'exposure',
    explanation:'The expanded SQL shows the January 31 valuation date and the included trading books. It sums absolute position values for gross exposure and signed values for net exposure, grouped by issuer.',
    explainQuery:financeQueries.issuer,expanded:financeCapture.expanded_sql,
    revision: {
      source: 'The same position records at the January 31 close',
      sourceDetail: 'Cash equities valued in USD · No trades or valuations changed',
      current: { rule: 'Current reporting scope', detail: 'Gross exposure includes Book A and Book B.', result: '$23m', resultDetail: 'Gross exposure in the current scope' },
      proposed: { catalog: 'proposed', rule: 'Expanded reporting scope', detail: 'Keep the gross calculation and add the Expansion book.', result: '$28m', resultDetail: 'Gross exposure in the proposed scope' },
      change: '+$5m', changeUnit: 'reported exposure',
      impact: 'The additional exposure comes from including another book. The positions did not change. Reviewers can distinguish a scope change from a change in holdings.',
    },
  },
];
