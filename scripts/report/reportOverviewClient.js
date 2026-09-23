const REPORT_OVERVIEW_CLIENT_SCRIPT = `    const search = document.querySelector('#search');
    const statusFilter = document.querySelector('#statusFilter');
    const laneFilter = document.querySelector('#laneFilter');
    const failedOnly = document.querySelector('#failedOnly');
    const slowOnly = document.querySelector('#slowOnly');
    const screenshotsOnly = document.querySelector('#screenshotsOnly');
    const cards = [...document.querySelectorAll('[data-test-card]')];

    function shouldShow(element) {
      const term = search.value.trim().toLowerCase();
      const status = statusFilter.value;
      const lane = laneFilter.value;
      const onlyFailures = failedOnly.checked;
      const onlySlow = slowOnly.checked;
      const onlyScreenshots = screenshotsOnly.checked;
      return (!term || element.dataset.name.includes(term)) &&
        (!status || element.dataset.status === status) &&
        (!lane || element.dataset.lane === lane) &&
        (!onlyFailures || element.dataset.status === 'FAIL') &&
        (!onlySlow || element.dataset.slow === '1') &&
        (!onlyScreenshots || element.dataset.screenshots === '1');
    }

    function applyFilters() {
      cards.forEach(card => { card.hidden = !shouldShow(card); });
    }

    async function copyText(value) {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(value);
        return;
      }

      const textarea = document.createElement('textarea');
      textarea.value = value;
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      document.execCommand('copy');
      textarea.remove();
    }

    [search, statusFilter, laneFilter, failedOnly, slowOnly, screenshotsOnly].forEach(input => input.addEventListener('input', applyFilters));
    document.querySelectorAll('[data-copy]').forEach(button => {
      button.addEventListener('click', async () => {
        await copyText(button.dataset.copy || '');
        const original = button.textContent;
        button.textContent = 'Copied';
        setTimeout(() => { button.textContent = original; }, 1200);
      });
    });
    document.querySelectorAll('[data-copy-link]').forEach(button => {
      button.addEventListener('click', async () => {
        const hash = button.dataset.copyLink || '';
        const url = new URL(window.location.href);
        url.hash = hash.replace(/^#/, '');
        await copyText(url.toString());
        const original = button.textContent;
        button.textContent = 'Copied';
        setTimeout(() => { button.textContent = original; }, 1200);
      });
    });`;

module.exports = { REPORT_OVERVIEW_CLIENT_SCRIPT };
