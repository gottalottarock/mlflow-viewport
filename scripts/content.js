// MLflow Viewport Content Script
// This script runs on MLflow pages and interacts with the application state

async function getExperimentName() {
  const urlMatch = (window.location.pathname + window.location.hash).match(/experiments\/(\d+)/);
  const experimentId = urlMatch ? urlMatch[1] : null;

  // Method 1: Fetch from MLflow REST API (same origin, most reliable)
  if (experimentId) {
    try {
      const apiBase = window.location.origin;
      const res = await fetch(`${apiBase}/api/2.0/mlflow/experiments/get?experiment_id=${experimentId}`);
      if (res.ok) {
        const data = await res.json();
        const name = data.experiment && data.experiment.name;
        if (name) {
          return name;
        }
      }
    } catch (e) {
      console.log('Could not fetch experiment name from API:', e);
    }
  }

  // Method 2: Fallback to experiment ID
  if (experimentId) {
    return `experiment_${experimentId}`;
  }

  return 'mlflow_experiment';
}

function getExperimentId() {
  const match = (window.location.pathname + window.location.hash).match(/experiments\/(\d+)/);
  return match ? match[1] : null;
}

function getUrlParams() {
  // Extract query params from the hash (e.g., #/experiments/6/runs?searchFilter=&orderByKey=...)
  const hash = window.location.hash;
  const queryIndex = hash.indexOf('?');
  if (queryIndex === -1) return {};

  const params = {};
  const searchParams = new URLSearchParams(hash.substring(queryIndex + 1));
  for (const [key, value] of searchParams) {
    params[key] = value;
  }
  return params;
}

function getHashPath() {
  // Extract the path portion of the hash (e.g., "/experiments/6/runs")
  const hash = window.location.hash.replace(/^#/, '');
  const queryIndex = hash.indexOf('?');
  return queryIndex === -1 ? hash : hash.substring(0, queryIndex);
}

function getViewportConfiguration() {
  const experimentId = getExperimentId();

  const viewport = {
    timestamp: new Date().toISOString(),
    url: window.location.href,
    experimentId: experimentId,
    experimentName: null,
    urlParams: getUrlParams(),
    hashPath: getHashPath(),
    localStorage: {},
    sessionStorage: {}
  };

  // Capture localStorage items related to MLflow
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && (key.includes('mlflow') || key.includes('MLflow') || key.includes('experiment') || key.includes('chart') || key.includes('metric'))) {
      try {
        viewport.localStorage[key] = localStorage.getItem(key);
      } catch (e) {
        console.warn('Could not read localStorage key:', key, e);
      }
    }
  }

  // Capture sessionStorage items
  for (let i = 0; i < sessionStorage.length; i++) {
    const key = sessionStorage.key(i);
    if (key && (key.includes('mlflow') || key.includes('MLflow') || key.includes('experiment') || key.includes('chart') || key.includes('metric'))) {
      try {
        viewport.sessionStorage[key] = sessionStorage.getItem(key);
      } catch (e) {
        console.warn('Could not read sessionStorage key:', key, e);
      }
    }
  }

  return viewport;
}

function setViewportConfiguration(viewport) {
  try {
    const currentExperimentId = getExperimentId();
    const sourceExperimentId = viewport.experimentId;
    const isCrossExperiment = sourceExperimentId && currentExperimentId && sourceExperimentId !== currentExperimentId;

    // Clear existing MLflow localStorage only for the CURRENT experiment
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      // Only remove keys that belong to the current experiment
      if (currentExperimentId && key.includes(currentExperimentId)) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key));

    // Restore localStorage, remapping experiment IDs in keys if needed
    if (viewport.localStorage) {
      let imported = 0, skipped = 0;
      Object.entries(viewport.localStorage).forEach(([key, value]) => {
        // Skip per-run entries for cross-experiment imports (run IDs won't match)
        if (isCrossExperiment && key.match(/RunPage-[a-f0-9]{32}/)) {
          skipped++;
          return;
        }
        try {
          let targetKey = key;
          if (isCrossExperiment) {
            targetKey = key.replace(new RegExp(sourceExperimentId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), currentExperimentId);
          }
          localStorage.setItem(targetKey, value);
          imported++;
        } catch (e) {
          console.warn('Could not set localStorage key:', key, e);
        }
      });
    }

    // Restore sessionStorage, remapping experiment IDs in keys if needed
    if (viewport.sessionStorage) {
      Object.entries(viewport.sessionStorage).forEach(([key, value]) => {
        if (isCrossExperiment && key.match(/RunPage-[a-f0-9]{32}/)) return;
        try {
          let targetKey = key;
          if (isCrossExperiment) {
            targetKey = key.replace(new RegExp(sourceExperimentId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), currentExperimentId);
          }
          sessionStorage.setItem(targetKey, value);
        } catch (e) {
          console.warn('Could not set sessionStorage key:', key, e);
        }
      });
    }

    // Apply URL parameters to the current experiment
    if (viewport.urlParams && Object.keys(viewport.urlParams).length > 0) {
      const currentHashPath = getHashPath();
      const params = new URLSearchParams(viewport.urlParams);
      const newHash = `#${currentHashPath}?${params.toString()}`;
      return { success: true, newHash: newHash };
    }

    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Show an import overlay directly on the page (avoids popup-closing-on-file-dialog issue)
function showImportOverlay() {
  // Remove existing overlay if any
  const existing = document.getElementById('mlflow-viewport-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'mlflow-viewport-overlay';
  overlay.innerHTML = `
    <div style="position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:999999;display:flex;align-items:center;justify-content:center;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
      <div style="background:#fff;border-radius:8px;padding:24px;max-width:400px;width:90%;box-shadow:0 4px 24px rgba(0,0,0,0.3)">
        <h3 style="margin:0 0 16px;font-size:16px;color:#333">Import Viewport Configuration</h3>
        <input type="file" id="mlflow-viewport-file" accept=".json" style="margin-bottom:16px;display:block;width:100%;box-sizing:border-box">
        <div id="mlflow-viewport-msg" style="margin-bottom:12px;font-size:13px;color:#666"></div>
        <div style="display:flex;gap:8px;justify-content:flex-end">
          <button id="mlflow-viewport-cancel" style="padding:8px 16px;border:1px solid #ccc;border-radius:4px;background:#fff;cursor:pointer;font-size:13px">Cancel</button>
          <button id="mlflow-viewport-apply" disabled style="padding:8px 16px;border:none;border-radius:4px;background:#2196F3;color:#fff;cursor:pointer;font-size:13px;opacity:0.5">Apply</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const fileInput = document.getElementById('mlflow-viewport-file');
  const applyBtn = document.getElementById('mlflow-viewport-apply');
  const cancelBtn = document.getElementById('mlflow-viewport-cancel');
  const msg = document.getElementById('mlflow-viewport-msg');
  let parsedViewport = null;

  fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      parsedViewport = JSON.parse(text);
      const name = parsedViewport.experimentName || parsedViewport.experimentId || 'unknown';
      msg.textContent = `Loaded config from: "${name}" (${new Date(parsedViewport.timestamp).toLocaleString()})`;
      msg.style.color = '#333';
      applyBtn.disabled = false;
      applyBtn.style.opacity = '1';
    } catch (err) {
      msg.textContent = 'Invalid JSON file: ' + err.message;
      msg.style.color = '#d32f2f';
      parsedViewport = null;
      applyBtn.disabled = true;
      applyBtn.style.opacity = '0.5';
    }
  });

  cancelBtn.addEventListener('click', () => overlay.remove());
  overlay.querySelector('div[style*="fixed"]').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) overlay.remove();
  });

  applyBtn.addEventListener('click', async () => {
    if (!parsedViewport) return;
    try {
      const experimentName = await getExperimentName();
      const confirmed = window.confirm(
        `This will overwrite the viewport configuration for experiment:\n"${experimentName}"\n\nContinue?`
      );
      if (!confirmed) {
        overlay.remove();
        return;
      }

      const result = setViewportConfiguration(parsedViewport);

      // Show feedback before reload
      msg.textContent = 'Viewport imported! Reloading...';
      msg.style.color = '#4CAF50';
      applyBtn.disabled = true;

      overlay.remove();

      // Merge imported URL params with current ones (preserve params like compareRunsMode
      // that may be set on the current page but missing from the export)
      if (result.success && result.newHash) {
        const currentParams = getUrlParams();
        const importedParams = new URLSearchParams(result.newHash.split('?')[1] || '');
        // Keep current params that aren't in the import (e.g. compareRunsMode=CHART)
        for (const [key, value] of Object.entries(currentParams)) {
          if (!importedParams.has(key)) {
            importedParams.set(key, value);
          }
        }
        const mergedHash = '#' + getHashPath() + '?' + importedParams.toString();
        window.location.hash = mergedHash.replace(/^#/, '');
      }

      // Reload so MLflow re-reads localStorage (chart configs, column settings, etc.)
      window.location.reload();
    } catch (err) {
      console.error('MLflow Viewport: import error:', err);
      msg.textContent = 'Import failed: ' + err.message;
      msg.style.color = '#d32f2f';
    }
  });
}

// Listen for messages from popup
browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getViewport') {
    getExperimentName().then(experimentName => {
      const viewport = getViewportConfiguration();
      viewport.experimentName = experimentName;
      sendResponse({
        experimentName: experimentName,
        viewport: viewport
      });
    }).catch(error => {
      sendResponse({ error: error.message });
    });
  } else if (request.action === 'getExperimentName') {
    getExperimentName().then(experimentName => {
      sendResponse({ experimentName: experimentName });
    }).catch(error => {
      sendResponse({ error: error.message });
    });
  } else if (request.action === 'setViewport') {
    try {
      const result = setViewportConfiguration(request.viewport);
      if (result.success) {
        sendResponse({ success: true, newHash: result.newHash || null });
      } else {
        sendResponse({ error: result.error });
      }
    } catch (error) {
      sendResponse({ error: error.message });
    }
  } else if (request.action === 'showImportOverlay') {
    showImportOverlay();
    sendResponse({ success: true });
  }

  return true; // Keep message channel open for async response
});

console.log('MLflow Viewport extension loaded');
