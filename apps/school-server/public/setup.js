'use strict';

/** First-run setup wizard. Talks to `/api/v1/setup` (spec 6.3 step 8). */
(function () {
  const el = (id) => document.getElementById(id);

  function say(text, kind) {
    const message = el('message');
    message.textContent = text;
    message.className = 'message' + (kind ? ' ' + kind : '');
  }

  async function api(path, options) {
    const response = await fetch(path, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(
        (body && (body.detail || body.title)) || 'Request failed (HTTP ' + response.status + ')',
      );
    }
    return body;
  }

  const yesNo = (value) => (value ? 'Yes' : 'No');

  async function refresh() {
    const status = await api('/api/v1/setup/status');
    el('s-address').textContent = status.server.url;
    el('s-school').textContent = status.school
      ? status.school.name + (status.school.id ? ' (' + status.school.id + ')' : '')
      : 'not set';
    el('s-pin').textContent = yesNo(status.console_pin_set);
    el('s-backup').textContent = status.second_backup_path || 'not set';
    el('s-activated').textContent = yesNo(status.activated);
    el('s-complete').textContent = yesNo(status.setup_complete);
    el('form-pin').querySelector('button').disabled = status.console_pin_set;
    if (status.cloud_url) el('cloud-url').placeholder = status.cloud_url;
    return status;
  }

  async function run(action, success) {
    try {
      await action();
      await refresh();
      say(success, 'ok');
    } catch (error) {
      say(error.message, 'error');
    }
  }

  function onSubmit(formId, handler) {
    el(formId).addEventListener('submit', function (event) {
      event.preventDefault();
      handler();
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    onSubmit('form-school', function () {
      run(
        () =>
          api('/api/v1/setup/school', {
            method: 'POST',
            body: JSON.stringify({ name: el('school-name').value.trim() }),
          }),
        'School name saved.',
      );
    });

    onSubmit('form-pin', function () {
      const pin = el('pin').value.trim();
      if (pin !== el('pin-confirm').value.trim()) {
        say('The two PINs do not match.', 'error');
        return;
      }
      run(
        () =>
          api('/api/v1/setup/console-pin', { method: 'POST', body: JSON.stringify({ pin: pin }) }),
        'Console PIN set.',
      );
    });

    onSubmit('form-backup', function () {
      run(
        () =>
          api('/api/v1/setup/backup-path', {
            method: 'POST',
            body: JSON.stringify({ path: el('backup-path').value.trim() }),
          }),
        'Backup location saved.',
      );
    });

    onSubmit('form-activate', function () {
      const cloudUrl = el('cloud-url').value.trim();
      run(
        () =>
          api('/api/v1/setup/activate', {
            method: 'POST',
            body: JSON.stringify({
              activation_code: el('activation-code').value.trim(),
              ...(cloudUrl ? { cloud_url: cloudUrl } : {}),
            }),
          }),
        'Server activated.',
      );
    });

    refresh().catch(function (error) {
      say(error.message, 'error');
    });
  });
})();
