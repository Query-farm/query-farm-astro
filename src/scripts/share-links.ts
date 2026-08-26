function setupShareLinkButtons(root?: ParentNode) {
  const scope = root && root.querySelectorAll ? root : document;
  scope.querySelectorAll<HTMLButtonElement>('.share-link-btn').forEach(button => {
    if (button.dataset.setupComplete) return;
    button.dataset.setupComplete = 'true';

    button.addEventListener('click', async () => {
      const targetId = button.dataset.targetId;
      if (!targetId) return;

      const url = `${window.location.origin}${window.location.pathname}#${targetId}`;

      try {
        await navigator.clipboard.writeText(url);
        const linkIcon = button.querySelector('.link-icon');
        const checkIcon = button.querySelector('.check-icon');
        if (!linkIcon || !checkIcon) return;

        linkIcon.classList.add('hidden');
        checkIcon.classList.remove('hidden');
        window.setTimeout(() => {
          linkIcon.classList.remove('hidden');
          checkIcon.classList.add('hidden');
        }, 2000);
      } catch (error) {
        console.error('Failed to copy link:', error);
      }
    });
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => setupShareLinkButtons(document));
} else {
  setupShareLinkButtons(document);
}

document.addEventListener('qf:content-loaded', event => {
  const root = (event as CustomEvent<{ root?: ParentNode }>).detail?.root;
  setupShareLinkButtons(root);
});
