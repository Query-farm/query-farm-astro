import type { TutorialChallenge } from '../data/tutorial-challenges';
import type { Session } from '../lib/repl/duckdb-boot';
import { challengeCell, checkChallengeResult } from '../lib/tutorial-challenge';
import {safeGetArrowValue} from '../lib/repl/format';

for (const root of document.querySelectorAll<HTMLElement>('[data-tutorial-challenge]')) {
  const challenge: TutorialChallenge = JSON.parse(root.querySelector('[data-challenge-config]')!.textContent!);
  const editor = root.querySelector<HTMLTextAreaElement>('[data-challenge-editor]')!;
  const check = root.querySelector<HTMLButtonElement>('[data-challenge-check]')!;
  const reset = root.querySelector<HTMLButtonElement>('[data-challenge-reset]')!;
  const useSolution = root.querySelector<HTMLButtonElement>('[data-challenge-load-solution]')!;
  const status = root.querySelector<HTMLElement>('[data-challenge-status]')!;
  const output = root.querySelector<HTMLElement>('[data-challenge-output]')!;
  const tableHost = root.querySelector<HTMLElement>('[data-challenge-table]')!;
  let session: Session | undefined, busy = false, attempts = 0, completed = false, assisted = false;
  const emit = (event: string, values: Record<string,string|number|boolean> = {}) => (window as Window & {gtag?: (...args: unknown[])=>void}).gtag?.('event',event,{post:challenge.post,content_type:'tutorial',challenge_id:challenge.id,...values});
  const feedback = (state: string, message: string) => {root.dataset.state=state;status.textContent=message;};
  const changed = () => {if(!busy){output.hidden=true;feedback('ready','Query changed. Run it to check your answer.');}};
  editor.addEventListener('input',changed);
  reset.addEventListener('click',()=>{editor.value=challenge.starter;changed();editor.focus();});
  useSolution.addEventListener('click',()=>{editor.value=challenge.solution;assisted=true;changed();editor.focus();});
  for(const kind of ['hint','solution']) root.querySelector<HTMLDetailsElement>(`[data-challenge-${kind}]`)!.addEventListener('toggle',event=>{
    if((event.target as HTMLDetailsElement).open){if(kind==='solution')assisted=true;emit(`tutorial_challenge_${kind}`);}
  });
  check.addEventListener('click',async()=>{
    if(busy)return;
    const sql=editor.value.trim();
    if(!sql){feedback('ready','Write a SELECT query first.');editor.focus();return;}
    busy=true;attempts++;check.disabled=true;reset.disabled=true;useSolution.disabled=true;editor.readOnly=true;output.hidden=true;root.setAttribute('aria-busy','true');
    if(attempts===1)emit('tutorial_challenge_start');
    let loading = true;
    try {
      feedback('loading',session ? 'Restoring the sample data…' : 'Loading DuckDB for your first check…');
      const [engine,arrow] = await Promise.all([import('../lib/repl/duckdb-boot'),import('apache-arrow')]);
      const extension = await engine.ensureExtension(challenge.extension,challenge.extension==='DuckDB'?'builtin':'community');
      if(!extension.ok)throw new Error('The browser extension could not load. Reload the page and try again.');
      session ??= await engine.createSession();
      for(const statement of engine.splitStatements(challenge.setup)){
        const result=await engine.runFixtureStatement(session,statement);
        if(!result.ok)throw new Error('The sample data could not load. Reload the page and try again.');
      }
      loading=false;feedback('running','Running your query and checking the result…');
      const statements=engine.splitStatements(sql).filter(statement=>!engine.isCommentOnly(statement));
      if(statements.length!==1)throw new Error('Use one SELECT query (a WITH clause is fine).');
      // A subquery accepts equivalent SELECT/CTE solutions, while keeping the
      // result bounded. It also rejects table edits and multi-statement input.
      const result=await session.runQuery(`SELECT * FROM (\n${statements[0]}\n) AS challenge_answer LIMIT 101`);
      if(!result.ok || !result.buffer)throw new Error(result.error || 'No query result was returned.');
      const table=arrow.tableFromIPC(new Uint8Array(result.buffer));
      const columns=table.schema.fields.map(field=>field.name);
      const rows=Array.from({length:table.numRows},(_,row)=>table.schema.fields.map((field,column)=>challengeCell(safeGetArrowValue(table.getChildAt(column),row,field),field)));
      tableHost.replaceChildren();
      const resultTable=document.createElement('table');
      const head=resultTable.createTHead().insertRow();
      for(const name of columns){const cell=document.createElement('th');cell.scope='col';cell.textContent=name;head.append(cell);}
      const body=resultTable.createTBody();
      for(const row of rows.slice(0,50)){const tr=body.insertRow();for(const value of row){const cell=tr.insertCell();cell.textContent=value==null?'NULL':String(value);}}
      tableHost.append(resultTable);
      if(rows.length===0 || rows.length>50){const note=document.createElement('p');note.textContent=rows.length===0?'No rows returned.':'Showing the first 50 rows. Narrow your result to the requested records.';tableHost.append(note);}
      output.hidden=false;
      const verdict=checkChallengeResult(columns,rows,challenge.columns,challenge.rows);
      feedback(verdict.passed?'passed':'mismatch',verdict.passed?`✓ ${challenge.success}`:verdict.message);
      emit('tutorial_challenge_attempt',{attempt:attempts,outcome:verdict.passed?'passed':'mismatch',assisted});
      if(verdict.passed && !completed){completed=true;emit('tutorial_challenge_complete',{attempts,assisted});}
    } catch(error) {
      feedback('error',loading?'The browser engine or sample data could not load. Reload the page and try again.':`That query did not run. ${error instanceof Error?error.message:String(error)}`);
      emit('tutorial_challenge_attempt',{attempt:attempts,outcome:loading?'load_error':'query_error',assisted});
    } finally {
      busy=false;check.disabled=false;reset.disabled=false;useSolution.disabled=false;editor.readOnly=false;root.removeAttribute('aria-busy');
    }
  });
  check.disabled=false;reset.disabled=false;useSolution.hidden=false;feedback('ready','Edit the query, then run it to check your answer.');root.dataset.challengeReady='true';
}
