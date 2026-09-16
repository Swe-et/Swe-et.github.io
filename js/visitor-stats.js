(function () {
  'use strict';

  var config = window.VISITOR_STATS_CONFIG || {};
  if (!config.enable || !config.endpoint) return;

  var visitorKey = 'hongye-anonymous-visitor-v1';

  function createVisitorId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID().replace(/-/g, '');
    }
    var bytes = new Uint8Array(18);
    window.crypto.getRandomValues(bytes);
    return Array.prototype.map.call(bytes, function (byte) {
      return byte.toString(16).padStart(2, '0');
    }).join('');
  }

  function visitorId() {
    try {
      var saved = localStorage.getItem(visitorKey);
      if (saved && /^[a-zA-Z0-9_-]{16,64}$/.test(saved)) return saved;
      saved = createVisitorId();
      localStorage.setItem(visitorKey, saved);
      return saved;
    } catch (error) {
      return createVisitorId();
    }
  }

  function formatLatest(value) {
    if (!value) return '暂无记录';
    return new Intl.DateTimeFormat('zh-CN', {
      timeZone: 'Asia/Shanghai',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).format(new Date(value)).replace(/\//g, '-');
  }

  function render(data) {
    var counter = document.querySelector('.kira-visitor-counter');
    if (!counter) return;
    var visitors = document.getElementById('visitor-value-site-uv');
    var views = document.getElementById('visitor-value-site-pv');
    var latest = document.getElementById('visitor-value-latest');
    if (visitors) visitors.textContent = Number(data.uniqueVisitors || 0).toLocaleString('zh-CN');
    if (views) views.textContent = Number(data.pageViews || 0).toLocaleString('zh-CN');
    if (latest) {
      latest.textContent = formatLatest(data.latestVisitAt);
      latest.title = data.latestVisitAt ? new Date(data.latestVisitAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }) : '';
    }
    counter.classList.add('is-ready');
  }

  function renderError() {
    var counter = document.querySelector('.kira-visitor-counter');
    if (!counter) return;
    var visitors = document.getElementById('visitor-value-site-uv');
    var views = document.getElementById('visitor-value-site-pv');
    var latest = document.getElementById('visitor-value-latest');
    if (visitors) visitors.textContent = '—';
    if (views) views.textContent = '—';
    if (latest) latest.textContent = '暂不可用';
    counter.classList.add('is-ready');
  }

  async function reportVisit() {
    var controller = new AbortController();
    var timeout = window.setTimeout(function () { controller.abort(); }, 7000);
    try {
      var response = await fetch(config.endpoint, {
        method: 'POST',
        mode: 'cors',
        credentials: 'omit',
        cache: 'no-store',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          visitorId: visitorId(),
          path: location.pathname,
          title: document.title.split(' - ')[0],
          referrer: document.referrer
        })
      });
      if (!response.ok) throw new Error('Visitor service returned ' + response.status);
      render(await response.json());
    } catch (error) {
      console.warn('访客统计暂时不可用', error);
      renderError();
    } finally {
      window.clearTimeout(timeout);
    }
  }

  function schedule() {
    if ('requestIdleCallback' in window) requestIdleCallback(reportVisit, { timeout: 800 });
    else setTimeout(reportVisit, 250);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', schedule, { once: true });
  else schedule();
})();
