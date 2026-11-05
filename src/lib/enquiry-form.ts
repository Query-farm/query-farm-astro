import { ENQUIRY_ID, enquiryReason, trackEnquiry } from './enquiry-tracking';

type EnquiryWindow = Window & {
  gtag?: (...args: unknown[]) => void;
  turnstile?: { reset: (el?: Element) => void };
};

export function initEnquiryForms(root: ParentNode = document, runtime: EnquiryWindow = window) {
  for (const form of root.querySelectorAll<HTMLFormElement>('[data-enquiry-form]')) {
    if (form.dataset.enquiryInitialized) continue;
    form.dataset.enquiryInitialized = 'true';
    const status = form.querySelector<HTMLElement>('[data-enquiry-status]')!;
    const sent = form.nextElementSibling as HTMLElement;
    const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    const retry = form.querySelector<HTMLButtonElement>('[data-enquiry-retry]')!;
    let started = false;
    let busy = false;
    let lastWidgetState = '';
    let statusOwner: 'widget' | 'submission' = 'submission';
    const track = (event: Parameters<typeof trackEnquiry>[0], details: Parameters<typeof trackEnquiry>[1] = {}) => trackEnquiry(event, details, runtime);
    const start = () => { if (!started) { started = true; track('enquiry_start'); } };
    form.addEventListener('input', start);
    form.addEventListener('change', start);

    const showErrors = (errors: Record<string, unknown> = {}) => {
      let first: HTMLElement | null = null;
      for (const p of form.querySelectorAll<HTMLElement>('[data-error-for]')) {
        const field = p.dataset.errorFor!;
        const input = form.elements.namedItem(field) as HTMLElement | null;
        const error = typeof errors[field] === 'string' ? errors[field] as string : '';
        p.textContent = error;
        p.hidden = !error;
        input?.setAttribute('aria-invalid', error ? 'true' : 'false');
        if (error && !first) first = input;
      }
      first?.focus();
    };
    const resetSecurity = () => {
      try {
        if (!runtime.turnstile) throw new Error('Widget unavailable');
        runtime.turnstile.reset(form.querySelector('.cf-turnstile') ?? undefined);
        form.dataset.turnstileStatus = 'waiting';
        lastWidgetState = '';
        retry.hidden = true;
        return true;
      } catch {
        retry.hidden = false;
        return false;
      }
    };
    retry.addEventListener('click', () => {
      statusOwner = 'widget';
      status.textContent = resetSecurity()
        ? 'Complete the security check, then send your message again. Your message is still here.'
        : 'The security check could not load. Please email hello@query.farm, or reload the page after copying your message.';
    });
    const widgetState = () => {
      const state = form.dataset.turnstileStatus;
      if (busy || form.hidden || !state || state === lastWidgetState) return;
      lastWidgetState = state;
      if (state === 'expired' || state === 'error') {
        if (statusOwner === 'widget' || !status.textContent) {
          statusOwner = 'widget';
          status.textContent = 'The security check needs another try. Your message is still here.';
        }
        retry.hidden = false;
        if (started) track('enquiry_error', { reason: state === 'expired' ? 'turnstile_expired' : 'turnstile_widget' });
      } else if (state === 'ready') {
        retry.hidden = true;
        if (statusOwner === 'widget') status.textContent = '';
      }
    };
    form.addEventListener('enquiry:turnstile', widgetState);
    widgetState();

    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (busy || form.hidden) return;
      start();
      track('enquiry_submit');
      const data = Object.fromEntries(new FormData(form)) as Record<string, string>;
      const payload = { ...data, turnstileToken: data['cf-turnstile-response'] ?? '', page: runtime.location.pathname };
      busy = true;
      submit.disabled = true;
      retry.hidden = true;
      status.textContent = 'Sending…';
      statusOwner = 'submission';
      showErrors();
      let reset = false;
      let receivedResponse = false;
      try {
        const response = await runtime.fetch('/api/enquiry', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
        });
        receivedResponse = true;
        const result = await response.json() as Record<string, unknown> | null;
        if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error('Unexpected response');
        if (response.ok && result.ok === true && (result.accepted === false
          || (result.accepted === true && typeof result.enquiry_id === 'string' && ENQUIRY_ID.test(result.enquiry_id)))) {
          form.hidden = true;
          sent.hidden = false;
          sent.focus();
          if (result.accepted === true) {
            track('enquiry_accepted', { enquiry_id: result.enquiry_id, topic: data.topic });
            track('generate_lead', { enquiry_id: result.enquiry_id, topic: data.topic });
          }
          return;
        }
        const reason = enquiryReason(result.reason);
        statusOwner = reason.startsWith('turnstile_') ? 'widget' : 'submission';
        track('enquiry_error', { reason, enquiry_id: result.enquiry_id });
        status.textContent = typeof result.error === 'string' ? result.error : 'We could not confirm your message was sent. Please email hello@query.farm.';
        if (result.errors && typeof result.errors === 'object' && !Array.isArray(result.errors)) showErrors(result.errors as Record<string, unknown>);
        // Validation runs before Turnstile, so a 400 leaves its token usable.
        reset = response.status !== 400;
        retry.hidden = !reason.startsWith('turnstile_');
      } catch {
        track('enquiry_error', { reason: receivedResponse ? 'unexpected_response' : 'network' });
        status.textContent = 'We could not confirm your message was sent. Please email hello@query.farm instead.';
        reset = true;
      } finally {
        busy = false;
        submit.disabled = false;
        if (reset) {
          const showRetry = !retry.hidden;
          resetSecurity();
          if (showRetry) retry.hidden = false;
        }
      }
    });
  }
}
