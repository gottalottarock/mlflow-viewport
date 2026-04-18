const exportBtn = document.getElementById('exportBtn');
const importBtn = document.getElementById('importBtn');
const exportMenu = document.getElementById('exportMenu');
const importMenu = document.getElementById('importMenu');
const exportFileBtn = document.getElementById('exportFileBtn');
const exportBrowserBtn = document.getElementById('exportBrowserBtn');
const importFileBtn = document.getElementById('importFileBtn');
const savedList = document.getElementById('savedList');
const backupBtn = document.getElementById('backupBtn');
const restoreBtn = document.getElementById('restoreBtn');
const exportName = document.getElementById('exportName');
const fullImportToggle = document.getElementById('fullImportToggle');
const status = document.getElementById('status');

let cachedViewport = null; // captured when Export is clicked

// --- Helpers ---

function showStatus(message, type) {
  status.textContent = message;
  status.className = type;
  status.style.display = 'block';
  setTimeout(() => { status.className = ''; status.style.display = 'none'; }, 3000);
}

function toggleSubmenu(menu) {
  const wasOpen = menu.classList.contains('open');
  // Close all submenus first
  document.querySelectorAll('.submenu').forEach(m => m.classList.remove('open'));
  if (!wasOpen) menu.classList.add('open');
}

function downloadJson(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// --- URL config ---

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

function isAllowedUrl(tabUrl, allowedUrls) {
  return allowedUrls.some(base => tabUrl.startsWith(base));
}

// --- Content script injection ---

async function ensureContentScript(tabId) {
  try {
    await browser.tabs.sendMessage(tabId, { action: 'ping' });
  } catch (e) {
    await browser.tabs.executeScript(tabId, { file: 'scripts/content.js' });
  }
}

// --- Saved viewports storage ---

async function getSavedViewports() {
  const data = await browser.storage.local.get('savedViewports');
  return data.savedViewports || [];
}

async function saveSavedViewports(list) {
  await browser.storage.local.set({ savedViewports: list });
}

// --- Validate active tab is MLflow ---

async function getValidTab() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url) {
    showStatus('Tab is loading. Please wait and try again.', 'error');
    return null;
  }
  const allowedUrls = await getAllowedUrls();
  if (allowedUrls.length === 0) {
    showStatus('No MLflow URLs configured. Open extension settings.', 'error');
    return null;
  }
  if (!isAllowedUrl(tab.url, allowedUrls)) {
    showStatus('This page is not a configured MLflow server.', 'error');
    return null;
  }
  return tab;
}

// --- Capture viewport from current tab ---

async function captureViewport() {
  const tab = await getValidTab();
  if (!tab) return null;
  await ensureContentScript(tab.id);
  const response = await browser.tabs.sendMessage(tab.id, { action: 'getViewport' });
  if (response.error) {
    showStatus(response.error, 'error');
    return null;
  }
  return response;
}

// --- Render saved list in Import submenu ---

async function renderSavedList() {
  const saved = await getSavedViewports();
  savedList.innerHTML = '';
  if (saved.length === 0) {
    savedList.innerHTML = '<li class="empty-msg">No saved configs yet</li>';
    return;
  }
  saved.forEach((item, i) => {
    const li = document.createElement('li');
    li.className = 'saved-item';

    const loadBtn = document.createElement('button');
    loadBtn.className = 'saved-item-load';
    loadBtn.textContent = item.name || 'unnamed';
    loadBtn.addEventListener('click', () => applySavedViewport(i));

    const dateSpan = document.createElement('span');
    dateSpan.className = 'saved-item-date';
    dateSpan.textContent = new Date(item.timestamp).toLocaleDateString();

    const delBtn = document.createElement('button');
    delBtn.className = 'btn-small';
    delBtn.textContent = '✕';
    delBtn.title = 'Delete';
    delBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      saved.splice(i, 1);
      await saveSavedViewports(saved);
      renderSavedList();
      showStatus('Deleted', 'success');
    });

    li.appendChild(loadBtn);
    li.appendChild(dateSpan);
    li.appendChild(delBtn);
    savedList.appendChild(li);
  });
}

// --- Apply a saved viewport to the current tab ---

async function applySavedViewport(index) {
  try {
    const tab = await getValidTab();
    if (!tab) return;
    const saved = await getSavedViewports();
    const item = saved[index];
    if (!item) return;

    const chartsOnly = !fullImportToggle.checked;

    // Check if confirmations are enabled
    const settings = await browser.storage.local.get('skipImportConfirm');
    if (!settings.skipImportConfirm) {
      const confirmMsg = chartsOnly
        ? `Apply chart layout from "${item.name}" to the current experiment?\n\nOnly charts will change. Runs and filters stay as they are.`
        : `Full import: "${item.name}"\n\nThis will navigate to the saved experiment and restore ALL settings (charts, runs, filters).`;
      if (!confirm(confirmMsg)) return;
    }

    await ensureContentScript(tab.id);
    const result = await browser.tabs.sendMessage(tab.id, {
      action: 'setViewport',
      viewport: item.viewport,
      chartsOnly: chartsOnly
    });
    if (result.error) {
      showStatus(result.error, 'error');
      return;
    }

    // Full import: navigate to the saved experiment's URL
    // Charts-only: stay on current page, just reload
    if (!chartsOnly && result.savedUrl) {
      await browser.tabs.update(tab.id, { url: result.savedUrl });
    } else {
      await browser.tabs.executeScript(tab.id, { code: 'window.location.reload();' });
    }

    showStatus(`Applied${chartsOnly ? ' charts' : ''}: ${item.name}`, 'success');
  } catch (error) {
    console.error('Apply error:', error);
    showStatus('Apply failed: ' + error.message, 'error');
  }
}

// --- Export: toggle submenu + capture viewport ---

exportBtn.addEventListener('click', async () => {
  const wasOpen = exportMenu.classList.contains('open');
  toggleSubmenu(exportMenu);
  if (!wasOpen) {
    exportName.value = '';
    exportName.placeholder = 'loading...';
    exportFileBtn.disabled = true;
    exportBrowserBtn.disabled = true;
    try {
      cachedViewport = await captureViewport();
      if (cachedViewport) {
        exportName.value = cachedViewport.experimentName;
        exportName.placeholder = 'Config name';
        exportFileBtn.disabled = false;
        exportBrowserBtn.disabled = false;
      } else {
        exportMenu.classList.remove('open');
      }
    } catch (error) {
      console.error('Export error:', error);
      showStatus('Export failed: ' + error.message, 'error');
      exportMenu.classList.remove('open');
    }
  }
});

// --- Export: save to file ---

exportFileBtn.addEventListener('click', async () => {
  if (!cachedViewport) return;
  try {
    const name = exportName.value.trim() || cachedViewport.experimentName;
    const safeName = name.replace(/^\/+/, '').replace(/[/\\:*?"<>|]/g, '_') || 'mlflow_experiment';
    downloadJson(cachedViewport.viewport, `${safeName}_viewport.json`);
    showStatus(`Exported: ${name}`, 'success');
  } catch (error) {
    console.error('Export error:', error);
    showStatus('Export failed: ' + error.message, 'error');
  }
});

// --- Export: save to browser ---

exportBrowserBtn.addEventListener('click', async () => {
  if (!cachedViewport) return;
  try {
    const name = exportName.value.trim() || cachedViewport.experimentName;
    const saved = await getSavedViewports();
    saved.push({
      name: name,
      timestamp: new Date().toISOString(),
      viewport: cachedViewport.viewport
    });
    await saveSavedViewports(saved);
    showStatus(`Saved: ${name}`, 'success');
    exportMenu.classList.remove('open');
  } catch (error) {
    console.error('Save error:', error);
    showStatus('Save failed: ' + error.message, 'error');
  }
});

// --- Import: toggle submenu + render list ---

importBtn.addEventListener('click', () => {
  toggleSubmenu(importMenu);
  if (importMenu.classList.contains('open')) {
    renderSavedList();
  }
});

// --- Import: from file (existing overlay flow) ---

importFileBtn.addEventListener('click', async () => {
  try {
    const tab = await getValidTab();
    if (!tab) return;
    await ensureContentScript(tab.id);
    const chartsOnly = !fullImportToggle.checked;
    const settings = await browser.storage.local.get('skipImportConfirm');
    await browser.tabs.sendMessage(tab.id, {
      action: 'showImportOverlay',
      chartsOnly: chartsOnly,
      skipConfirm: !!settings.skipImportConfirm
    });
    window.close();
  } catch (error) {
    console.error('Import error:', error);
    showStatus('Import failed: ' + error.message, 'error');
  }
});

// --- Backup: download all saved configs ---

backupBtn.addEventListener('click', async () => {
  try {
    const saved = await getSavedViewports();
    if (saved.length === 0) {
      showStatus('No saved configs to backup', 'warning');
      return;
    }
    downloadJson({ version: 1, savedViewports: saved }, 'mlflow_viewport_backup.json');
    showStatus(`Backed up ${saved.length} config(s)`, 'success');
  } catch (error) {
    showStatus('Backup failed: ' + error.message, 'error');
  }
});

// --- Restore: load backup file ---

restoreBtn.addEventListener('click', () => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      let toRestore;
      if (data.version && Array.isArray(data.savedViewports)) {
        toRestore = data.savedViewports;
      } else if (Array.isArray(data)) {
        toRestore = data;
      } else {
        showStatus('Invalid backup file format', 'error');
        return;
      }
      const existing = await getSavedViewports();
      // Merge: add configs that don't already exist (by name+timestamp)
      const existingKeys = new Set(existing.map(e => e.name + '|' + e.timestamp));
      let added = 0;
      for (const item of toRestore) {
        const key = item.name + '|' + item.timestamp;
        if (!existingKeys.has(key)) {
          existing.push(item);
          added++;
        }
      }
      await saveSavedViewports(existing);
      showStatus(`Restored ${added} new config(s) (${toRestore.length - added} duplicates skipped)`, 'success');
      if (importMenu.classList.contains('open')) renderSavedList();
    } catch (err) {
      showStatus('Invalid file: ' + err.message, 'error');
    }
  });
  input.click();
});
