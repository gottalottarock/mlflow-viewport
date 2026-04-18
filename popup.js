const exportBtn = document.getElementById('exportBtn');
const importBtn = document.getElementById('importBtn');
const status = document.getElementById('status');

function showStatus(message, type) {
  status.textContent = message;
  status.className = type;
  status.style.display = 'block';
  setTimeout(() => {
    status.className = '';
    status.style.display = 'none';
  }, 3000);
}

// Load allowed MLflow URLs from storage (auto-seeds from config.local.json on first run)
async function getAllowedUrls() {
  const data = await browser.storage.local.get(['mlflowUrls', 'configSeeded']);
  if (!data.configSeeded) {
    try {
      const res = await fetch(browser.runtime.getURL('config.local.json'));
      if (res.ok) {
        const config = await res.json();
        if (Array.isArray(config.mlflowUrls) && config.mlflowUrls.length > 0) {
          const existing = data.mlflowUrls || [];
          const merged = [...new Set([...existing, ...config.mlflowUrls])];
          await browser.storage.local.set({ mlflowUrls: merged, configSeeded: true });
          return merged;
        }
      }
    } catch (e) { /* config.local.json missing — fine */ }
    await browser.storage.local.set({ configSeeded: true });
  }
  return data.mlflowUrls || [];
}

// Check if the tab URL matches any configured MLflow server
function isAllowedUrl(tabUrl, allowedUrls) {
  return allowedUrls.some(base => tabUrl.startsWith(base));
}

// Ensure the content script is injected into the tab.
// Needed when the page was already open before the extension was installed/reloaded.
async function ensureContentScript(tabId) {
  try {
    await browser.tabs.sendMessage(tabId, { action: 'ping' });
  } catch (e) {
    // Content script not loaded — inject it now
    await browser.tabs.executeScript(tabId, { file: 'scripts/content.js' });
  }
}

// Export viewport configuration
exportBtn.addEventListener('click', async () => {
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    const allowedUrls = await getAllowedUrls();

    if (allowedUrls.length === 0) {
      showStatus('No MLflow URLs configured. Open extension settings to add one.', 'error');
      return;
    }

    if (!isAllowedUrl(tab.url, allowedUrls)) {
      showStatus('This page is not a configured MLflow server.', 'error');
      return;
    }

    await ensureContentScript(tab.id);
    const response = await browser.tabs.sendMessage(tab.id, { action: 'getViewport' });

    if (response.error) {
      showStatus(response.error, 'error');
      return;
    }

    const { experimentName, viewport } = response;

    // Sanitize experiment name for use as filename
    const safeName = experimentName.replace(/^\/+/, '').replace(/[/\\:*?"<>|]/g, '_') || 'mlflow_experiment';

    // Trigger download via anchor element (avoids downloads API restrictions)
    const jsonStr = JSON.stringify(viewport, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const filename = `${safeName}_viewport.json`;

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showStatus(`Exported: ${experimentName}`, 'success');
  } catch (error) {
    console.error('Export error:', error);
    showStatus('Export failed: ' + error.message, 'error');
  }
});

// Import viewport configuration — open overlay on the page itself
// (popup closes when file dialog opens in Zen, so file picking must happen on-page)
importBtn.addEventListener('click', async () => {
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    const allowedUrls = await getAllowedUrls();

    if (allowedUrls.length === 0) {
      showStatus('No MLflow URLs configured. Open extension settings to add one.', 'error');
      return;
    }

    if (!isAllowedUrl(tab.url, allowedUrls)) {
      showStatus('This page is not a configured MLflow server.', 'error');
      return;
    }

    await ensureContentScript(tab.id);
    await browser.tabs.sendMessage(tab.id, { action: 'showImportOverlay' });
    // Close the popup — the overlay on the page handles the rest
    window.close();
  } catch (error) {
    console.error('Import error:', error);
    showStatus('Import failed: ' + error.message, 'error');
  }
});
