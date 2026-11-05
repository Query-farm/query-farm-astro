const treatments = {
  green: { label: 'A / Clear green', description: 'Keep the brand green; use medium weight and a solid underline.', detail: 'medium links · solid underline', color: '#45632f' },
  blue: { label: 'B / Editorial blue', description: 'Give article links their own blue accent, separate from the warm palette.', detail: 'blue links · solid underline', color: '#245ca2' },
  highlight: { label: 'C / Soft highlight', description: 'Add a quiet green tint behind each link. Most visible, but busier in dense passages.', detail: 'green links · pale highlight', color: '#45632f' },
};
const original = document.querySelector('#original');
const proposal = document.querySelector('#proposal');
const frames = [original, proposal];
const buttons = [...document.querySelectorAll('[data-treatment]')];
const ink = document.querySelector('#uniform-ink');
const compare = document.querySelector('#compare');
const section = document.querySelector('#section');
const params = new URLSearchParams(location.search);
let selected = Object.hasOwn(treatments, params.get('treatment')) ? params.get('treatment') : 'green';
ink.checked = params.get('ink') !== 'false';
compare.checked = params.get('compare') !== 'false';
if ([...section.options].some(option => option.value === params.get('section'))) section.value = params.get('section');
let ready = 0;

function remember() {
  const query = new URLSearchParams({ treatment: selected, ink: String(ink.checked), compare: String(compare.checked), section: section.value });
  history.replaceState(null, '', `?${query}`);
}

function apply() {
  const treatment = treatments[selected];
  buttons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.treatment === selected)));
  document.querySelector('#treatment-description').textContent = treatment.description;
  document.querySelector('#proposal-label').textContent = treatment.label;
  document.querySelector('#proposal-detail').textContent = `${ink.checked ? 'Consistent ink' : 'Original body colors'} · ${treatment.detail}`;
  document.querySelector('#proposal-dot').style.backgroundColor = treatment.color;
  document.querySelector('#comparison').classList.toggle('single', !compare.checked);
  if (proposal.contentDocument?.querySelector('.qf-prose')) {
    proposal.contentDocument.documentElement.dataset.treatment = selected;
    proposal.contentDocument.documentElement.dataset.ink = String(ink.checked);
  }
  remember();
}

function jump(frame) {
  const document = frame.contentDocument;
  const window = frame.contentWindow;
  if (!document?.querySelector('.qf-prose')) return;
  if (section.value === 'top') return window.scrollTo(0, 0);
  const element = section.value === 'intro' ? document.querySelector('.qf-prose > :first-child') : document.getElementById(section.value);
  if (element) window.scrollTo(0, element.getBoundingClientRect().top + window.scrollY - readingTop(frame));
}

function readingTop(frame) {
  const bars = [...frame.contentDocument.querySelectorAll('header, .blog-subnav')].filter(element => ['sticky', 'fixed'].includes(frame.contentWindow.getComputedStyle(element).position));
  return bars.reduce((height, bar) => height + bar.getBoundingClientRect().height, 24);
}

function jumpBoth() {
  syncing = true;
  frames.forEach(jump);
  requestAnimationFrame(() => requestAnimationFrame(() => { syncing = false; }));
}

/* Synchronize by paragraph position, so line wrapping does not accumulate drift. */
let syncing = false;
function sync(source, target) {
  if (syncing || !compare.checked || matchMedia('(max-width: 700px)').matches) return;
  const from = source.contentWindow;
  const to = target.contentWindow;
  if (!from || !to || !target.contentDocument?.querySelector('.qf-prose')) return;
  const elements = [...source.contentDocument.querySelectorAll('.qf-prose > *')];
  const matching = [...target.contentDocument.querySelectorAll('.qf-prose > *')];
  const sourceTop = readingTop(source);
  const targetTop = readingTop(target);
  const index = elements.findIndex(element => element.getBoundingClientRect().bottom > sourceTop);
  syncing = true;
  if (index >= 0 && matching[index] && from.scrollY > elements[0].getBoundingClientRect().top + from.scrollY - 80) {
    const position = elements[index].getBoundingClientRect();
    const targetPosition = matching[index].getBoundingClientRect();
    const progress = (sourceTop - position.top) / Math.max(1, position.height);
    to.scrollTo(0, targetPosition.top + to.scrollY + progress * targetPosition.height - targetTop);
  } else {
    to.scrollTo(0, from.scrollY);
  }
  requestAnimationFrame(() => requestAnimationFrame(() => { syncing = false; }));
}

for (const frame of frames) {
  frame.addEventListener('load', async () => {
    try {
      await frame.contentDocument.fonts.ready;
      apply();
      jump(frame);
      frame.contentWindow.addEventListener('scroll', () => sync(frame, frame === original ? proposal : original), { passive: true });
      ready += 1;
      if (ready === 2) {
        jumpBoth();
        document.querySelector('#status').textContent = 'Live article snapshot · 19 Oct 2026';
      }
    } catch {
      document.querySelector('#status').textContent = 'Reload to restore the article preview.';
    }
  });
}
buttons.forEach(button => button.addEventListener('click', () => { selected = button.dataset.treatment; apply(); }));
ink.addEventListener('change', apply);
compare.addEventListener('change', () => { apply(); requestAnimationFrame(jumpBoth); });
section.addEventListener('change', () => { jumpBoth(); remember(); });
apply();
