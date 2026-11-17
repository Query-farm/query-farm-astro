// Client side of the hosted Orchard console pages (static, noindex). Each page
// renders its chrome with Button/Card/Badge at build time, including
// <template> rows; this script fills them from /api/orchard/*. Text goes in
// through textContent only.

type Json = Record<string, any>;

const LOGIN = '/api/auth/login';

async function api(path: string, init: { method?: string; body?: unknown } = {}): Promise<{ status: number; body: Json }> {
  const response = await fetch(`/api/orchard/${path}`, {
    method: init.method ?? 'GET',
    headers: init.body !== undefined ? { 'Content-Type': 'application/json' } : {},
    credentials: 'same-origin',
    ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
  });
  let body: Json = {};
  try { body = await response.json(); } catch { /* non-JSON */ }
  return { status: response.status, body };
}

const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T | null;
const show = (el: Element | null, on = true) => el?.toggleAttribute('hidden', !on);
const setText = (root: ParentNode, sel: string, value: string) => { const el = $(sel, root); if (el) el.textContent = value; };

function signInUrl(extra: Record<string, string> = {}) {
  const params = new URLSearchParams({ return_to: location.pathname + location.search, ...extra });
  return `${LOGIN}?${params}`;
}

/** Show the signed-out panel (with a working sign-in link) or bounce through sign-in. */
function signedOut(extra: Record<string, string> = {}) {
  const panel = $('[data-state="signed-out"]');
  show($('[data-state="loading"]'), false);
  if (panel) {
    panel.querySelectorAll<HTMLElement>('[data-signin]').forEach(wrap => {
      const a = wrap.querySelector('a');
      if (a) a.href = signInUrl({ ...extra, ...(wrap.dataset.signin === 'signup' ? { signup: '1' } : {}) });
    });
    show(panel);
  } else location.href = signInUrl(extra);
}

function fail(message: string) {
  show($('[data-state="loading"]'), false);
  const box = $('[data-state="error"]');
  if (box) { setText(box, '[data-message]', message); show(box); }
}

/** Actions are Button components inside a `[data-action]` wrapper; this is the button itself. */
const inner = (wrap: Element | null) => (wrap?.querySelector('button, a') ?? wrap) as HTMLButtonElement | null;

function clone(id: string): DocumentFragment {
  return ($<HTMLTemplateElement>(`template#${id}`)!.content.cloneNode(true)) as DocumentFragment;
}

const STATUS_LABEL: Record<string, string> = {
  requested: 'Requested', provisioning: 'Provisioning', live: 'Live', stopped: 'Stopped', rejected: 'Not provisioned',
  new: 'New', in_progress: 'In progress', done: 'Done',
};
const usd = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

async function goToCheckout(returnTo: string, wrap?: Element | null) {
  const button = inner(wrap ?? null);
  if (button) button.disabled = true;
  const { body } = await api('billing/checkout', { method: 'POST', body: { return_to: returnTo } });
  if (body.url) location.href = body.url;
  else { if (button) button.disabled = false; alert(body.error ?? 'Billing could not be started.'); }
}

function wireBilling(me: Json) {
  const card = $('[data-billing]');
  if (!card) return;
  const active = me.billing.active as boolean;
  setText(card, '[data-billing-status]', active ? 'Active' : me.billing.status === 'none' ? 'Not set up' : String(me.billing.status).replace(/_/g, ' '));
  show($('[data-billing-badge-ok]', card), active);
  show($('[data-billing-badge-todo]', card), !active);
  const setup = $('[data-action="checkout"]', card);
  const portal = $('[data-action="portal"]', card);
  show(setup, !active && me.billing.configured);
  show(portal, Boolean(me.billing.customer));
  setup?.addEventListener('click', () => goToCheckout('/products/orchard/console/', setup));
  portal?.addEventListener('click', async () => {
    const button = inner(portal)!;
    button.disabled = true;
    const { body } = await api('billing/portal', { method: 'POST' });
    if (body.url) location.href = body.url; else { button.disabled = false; alert(body.error ?? 'The billing portal could not be opened.'); }
  });
  if (me.billing.payment === 'failed') show($('[data-payment-failed]', card));
}

function renderDeployment(d: Json, reload: () => void): DocumentFragment {
  const row = clone('tpl-deployment');
  const root = row.firstElementChild as HTMLElement;
  setText(root, '[data-name]', d.workerName);
  const link = $<HTMLAnchorElement>('[data-worker-link]', root);
  if (link) link.href = `/products/orchard/connectors/${d.worker}`;
  setText(root, '[data-status]', STATUS_LABEL[d.status] ?? d.status);
  setText(root, '[data-meta]', [d.size.toUpperCase(), d.region, d.version, d.paid ? 'paid worker' : null].filter(Boolean).join(' · '));
  setText(root, '[data-actual]', String(d.actualInstances));
  setText(root, '[data-desired]', String(d.desiredInstances));
  show($('[data-desired-wrap]', root), d.desiredInstances !== d.actualInstances);
  const pending = d.pendingRequests as Json[];
  setText(root, '[data-pending]', pending.length ? `Pending: ${pending.map(r => `${r.kind} → ${r.desiredInstances} (${STATUS_LABEL[r.status]})`).join(', ')}` : '');
  if (d.endpoint) setText(root, '[data-endpoint]', d.endpoint);
  show($('[data-endpoint-wrap]', root), Boolean(d.endpoint));
  if (d.attachSql) {
    setText(root, '[data-attach]', d.attachSql);
    show($('[data-attach-wrap]', root));
    const copy = $('[data-action="copy"]', root);
    copy?.addEventListener('click', () => {
      navigator.clipboard?.writeText(d.attachSql);
      inner(copy)!.textContent = 'Copied';
    });
  }
  const closed = d.status === 'stopped' || d.status === 'rejected';
  show($('[data-controls]', root), !closed);
  const act = async (path: string, body?: unknown, confirmText?: string) => {
    if (confirmText && !confirm(confirmText)) return;
    root.querySelectorAll('button').forEach(b => { (b as HTMLButtonElement).disabled = true; });
    const result = await api(`deployments/${d.id}/${path}`, { method: 'POST', body: body ?? {} });
    if (!result.body.ok) alert(result.body.error ?? 'That did not work. Please try again.');
    reload();
  };
  $('[data-action="minus"]', root)?.addEventListener('click', () => act('scale', { delta: -1 }));
  $('[data-action="plus"]', root)?.addEventListener('click', () => act('scale', { delta: 1 }));
  $('[data-action="stop"]', root)?.addEventListener('click', () => act('stop', {}, `Ask us to stop ${d.workerName}? Billing for its instances ends once it is stopped.`));
  return row;
}

export async function initConsole() {
  const me = await api('me');
  if (me.status === 401) return signedOut();
  if (!me.body.ok) return fail(me.body.error ?? 'The console is unavailable.');
  show($('[data-state="loading"]'), false);
  show($('[data-state="ready"]'));
  setText(document, '[data-org-name]', me.body.org?.name ?? '');
  setText(document, '[data-user-email]', me.body.user.email);
  show($('[data-admin-link]'), me.body.admin);
  if (new URLSearchParams(location.search).get('billing') === 'done') show($('[data-billing-done]'));
  wireBilling(me.body);

  const list = $('[data-deployments]')!;
  const load = async () => {
    const { body } = await api('deployments');
    if (!body.ok) return fail(body.error ?? 'Deployments could not be loaded.');
    list.replaceChildren(...(body.deployments as Json[]).map(d => renderDeployment(d, load)));
    show($('[data-empty]'), body.deployments.length === 0);
    const m = body.monthToDate;
    setText(document, '[data-mtd-usage]', usd(m.usageUsd));
    setText(document, '[data-mtd-hours]', `${(m.instanceHours.s + m.instanceHours.m + m.instanceHours.l).toFixed(1)} instance-hours`);
    setText(document, '[data-mtd-license]', m.licenseMonthlyUsd ? `plus ${usd(m.licenseMonthlyUsd)}/month in licenses` : 'no paid-worker licenses');
  };
  await load();
}

export async function initNew() {
  const params = new URLSearchParams(location.search);
  const form = $<HTMLFormElement>('form[data-new]')!;
  // Restore choices after a round trip through sign-in or Checkout.
  for (const name of ['worker', 'size', 'instances', 'region']) {
    const value = params.get(name);
    const field = form.elements.namedItem(name) as HTMLInputElement | RadioNodeList | null;
    if (value && field) field.value = value;
  }
  const me = await api('me');
  if (me.status === 401) return signedOut({ worker: params.get('worker') ?? '', source: location.pathname });
  if (!me.body.ok) return fail(me.body.error ?? 'The console is unavailable.');
  show($('[data-state="loading"]'), false);
  show($('[data-state="ready"]'));

  const select = form.elements.namedItem('worker') as HTMLSelectElement;
  try {
    const { workers } = await (await fetch('/products/orchard/hosted/workers.json')).json() as { workers: Json[] };
    const wanted = params.get('worker');
    select.replaceChildren(new Option('Choose a worker…', ''), ...workers
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(w => new Option(`${w.name}${w.pricing === 'paid' ? ' (paid)' : ''}`, w.slug, false, w.slug === wanted)));
  } catch { fail('The worker list could not be loaded.'); return; }

  const billingNote = $('[data-billing-required]');
  show(billingNote, !me.body.billing.active);
  if (params.get('billing') === 'done') show($('[data-billing-done]'));

  const update = () => {
    const instances = Number((form.elements.namedItem('instances') as HTMLInputElement).value) || 0;
    const monthly = Number($<HTMLInputElement>('input[name="size"]:checked', form)?.dataset.monthly ?? 0);
    setText(document, '[data-estimate]', monthly && instances ? `${usd(monthly * instances)}/month if it runs all month` : '—');
  };
  form.addEventListener('input', update);
  update();

  form.addEventListener('submit', async ev => {
    ev.preventDefault();
    const data = new FormData(form);
    const choice = { worker: String(data.get('worker')), size: String(data.get('size')), instances: Number(data.get('instances')), region: String(data.get('region')) };
    const button = $<HTMLButtonElement>('button[type="submit"]', form)!;
    button.disabled = true;
    form.querySelectorAll('[data-error-for]').forEach(el => { el.textContent = ''; });
    const { status, body } = await api('deployments', { method: 'POST', body: choice });
    if (status === 402) {
      const back = `${location.pathname}?${new URLSearchParams({ ...choice, instances: String(choice.instances) })}`;
      return goToCheckout(back, button);
    }
    button.disabled = false;
    if (!body.ok) {
      for (const [field, message] of Object.entries((body.errors ?? {}) as Record<string, string>)) setText(form, `[data-error-for="${field}"]`, message);
      setText(form, '[data-form-error]', body.error ?? 'That did not work. Please try again.');
      return;
    }
    location.href = '/products/orchard/console/?requested=1';
  });
}

export async function initAdmin() {
  const me = await api('me');
  if (me.status === 401) return signedOut();
  if (!me.body.admin) return fail('This page is for Query.Farm staff.');
  show($('[data-state="loading"]'), false);
  show($('[data-state="ready"]'));
  const list = $('[data-requests]')!;
  const load = async () => {
    const { body } = await api('admin/requests');
    if (!body.ok) return fail(body.error ?? 'Requests could not be loaded.');
    const rows = body.requests as Json[];
    show($('[data-empty]'), rows.length === 0);
    list.replaceChildren(...rows.map(r => {
      const row = clone('tpl-request');
      const root = row.firstElementChild as HTMLElement;
      setText(root, '[data-title]', `${r.kind} · ${r.worker_name} × ${r.desired_instances}`);
      setText(root, '[data-status]', STATUS_LABEL[r.status] ?? r.status);
      setText(root, '[data-meta]', `${r.org_name} (${r.org_id}) · ${r.requester_email ?? r.created_by} · billing ${r.billing_status}`);
      setText(root, '[data-detail]', `${r.worker} ${r.version ?? ''}${r.paid ? ' (paid)' : ''} · size ${String(r.size).toUpperCase()} · ${r.region} · running ${r.actual_instances} · deployment ${r.deployment_id}`);
      setText(root, '[data-created]', new Date(r.created_at).toLocaleString());
      setText(root, '[data-note]', r.note ?? '');
      const open = r.status === 'new' || r.status === 'in_progress';
      show($('[data-fulfil]', root), open);
      const endpoint = $<HTMLInputElement>('input[name="endpoint"]', root)!;
      const instances = $<HTMLInputElement>('input[name="instances"]', root)!;
      const note = $<HTMLInputElement>('input[name="note"]', root)!;
      endpoint.value = r.endpoint ?? '';
      instances.value = String(r.kind === 'stop' ? 0 : r.desired_instances);
      instances.disabled = r.kind === 'stop';
      const send = async (status: string) => {
        const body: Json = { status, note: note.value };
        if (status === 'done') { body.endpoint = endpoint.value; body.instances = Number(instances.value); }
        const result = await api(`admin/requests/${r.id}`, { method: 'POST', body });
        if (!result.body.ok) alert(result.body.error ?? 'That did not work.');
        else if (result.body.warning) alert(result.body.warning);
        load();
      };
      $('[data-action="progress"]', root)?.addEventListener('click', () => send('in_progress'));
      $('[data-action="done"]', root)?.addEventListener('click', () => send('done'));
      $('[data-action="reject"]', root)?.addEventListener('click', () => confirm('Reject this request?') && send('rejected'));
      return row;
    }));
  };
  await load();
}
