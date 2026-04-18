// MLflow Viewport Content Script
// This script runs on MLflow pages and interacts with the application state

// Guard against double-injection (e.g. content_scripts + executeScript fallback)
if (window.__mlflowViewportLoaded) {
  // Already loaded — skip re-initialization
} else {
window.__mlflowViewportLoaded = true;

async function getExperimentName() {
  // Single experiment: /experiments/(\d+)/
  const urlMatch = (window.location.pathname + window.location.hash).match(/experiments\/(\d+)/);
  const singleExperimentId = urlMatch ? urlMatch[1] : null;

  // Method 1: Fetch from MLflow REST API (single experiment)
  if (singleExperimentId) {
    try {
      const apiBase = window.location.origin;
      const res = await fetch(`${apiBase}/api/2.0/mlflow/experiments/get?experiment_id=${singleExperimentId}`);
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
    return `experiment_${singleExperimentId}`;
  }

  // Method 2: Multi-experiment page — try to get names via API
  const hash = window.location.hash;
  const queryIndex = hash.indexOf('?');
  if (queryIndex !== -1) {
    const params = new URLSearchParams(hash.substring(queryIndex + 1));
    const experiments = params.get('experiments');
    if (experiments) {
      try {
        const ids = JSON.parse(experiments);
        if (Array.isArray(ids) && ids.length > 0) {
          const names = [];
          const apiBase = window.location.origin;
          for (const id of ids) {
            try {
              const res = await fetch(`${apiBase}/api/2.0/mlflow/experiments/get?experiment_id=${encodeURIComponent(id)}`);
              if (res.ok) {
                const data = await res.json();
                names.push(data.experiment?.name || `exp_${id}`);
              } else {
                names.push(`exp_${id}`);
              }
            } catch (e) {
              names.push(`exp_${id}`);
            }
          }
          return names.join('+');
        }
      } catch (e) { /* not valid JSON */ }
    }
  }

  return 'mlflow_experiment';
}

// Returns experiment identifier used in localStorage keys.
// Single experiment: "7" (from /experiments/7/)
// Multi-experiment: '["1","7"]' (from ?experiments=["1","7"])
function getExperimentId() {
  // Method 1: Single experiment page — /experiments/(\d+)/
  const match = (window.location.pathname + window.location.hash).match(/experiments\/(\d+)/);
  if (match) return match[1];

  // Method 2: Multi-experiment page — experiments param in URL hash
  const hash = window.location.hash;
  const queryIndex = hash.indexOf('?');
  if (queryIndex !== -1) {
    const params = new URLSearchParams(hash.substring(queryIndex + 1));
    const experiments = params.get('experiments');
    if (experiments) {
      try {
        const parsed = JSON.parse(experiments);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Return the JSON array string exactly as used in localStorage keys
          return JSON.stringify(parsed);
        }
      } catch (e) { /* not valid JSON */ }
    }
  }

  return null;
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
  const keyFragment = experimentIdToKeyFragment(experimentId);

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

  if (!keyFragment) {
    console.warn('[MLflow Viewport] Cannot determine experiment ID, export will be empty');
    return viewport;
  }

  // Clean up double-escaped keys (e.g., ExperimentPage-["["1","7"]"]-... from old bugs)
  const doubleEscaped = `["${keyFragment}"]`;
  const keysToClean = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.includes(doubleEscaped)) keysToClean.push(key);
  }
  if (keysToClean.length > 0) {
    console.log('[MLflow Viewport] Cleaning up', keysToClean.length, 'double-escaped localStorage keys');
    keysToClean.forEach(key => localStorage.removeItem(key));
  }

  // Match keys by exact fragment with dash boundaries to avoid double-escaped keys
  const fragmentPattern = `-${keyFragment}-`;
  const fragmentSuffix = `-${keyFragment}`; // for keys where fragment is at end

  // Capture only localStorage keys belonging to the current experiment
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && (key.includes(fragmentPattern) || key.endsWith(fragmentSuffix))) {
      try {
        viewport.localStorage[key] = localStorage.getItem(key);
      } catch (e) {
        console.warn('Could not read localStorage key:', key, e);
      }
    }
  }

  // Capture only sessionStorage keys belonging to the current experiment
  for (let i = 0; i < sessionStorage.length; i++) {
    const key = sessionStorage.key(i);
    if (key && (key.includes(fragmentPattern) || key.endsWith(fragmentSuffix))) {
      try {
        viewport.sessionStorage[key] = sessionStorage.getItem(key);
      } catch (e) {
        console.warn('Could not read sessionStorage key:', key, e);
      }
    }
  }

  console.log('[MLflow Viewport] Exported', Object.keys(viewport.localStorage).length,
    'localStorage keys for experiment', keyFragment);
  return viewport;
}

function setViewportConfiguration(viewport) {
  try {
    const sourceKeyFragment = experimentIdToKeyFragment(viewport.experimentId);

    // Clear existing localStorage keys for the saved experiment (exact match with dash boundaries)
    if (sourceKeyFragment) {
      const fragPattern = `-${sourceKeyFragment}-`;
      const fragSuffix = `-${sourceKeyFragment}`;
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.includes(fragPattern) || key.endsWith(fragSuffix))) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(key => localStorage.removeItem(key));
    }

    // Write all imported localStorage keys directly (no remapping needed —
    // we'll navigate to the saved experiment's page)
    if (viewport.localStorage) {
      const stateKeys = [];
      Object.entries(viewport.localStorage).forEach(([key, value]) => {
        try {
          localStorage.setItem(key, value);
          if (key.includes('ReactComponentState')) stateKeys.push(key);
        } catch (e) {
          console.warn('Could not set localStorage key:', key, e);
        }
      });
      // Block MLflow from overwriting our imported state during page unload
      if (stateKeys.length > 0) {
        blockStorageOverwrite(stateKeys);
      }
    }

    // Write all imported sessionStorage keys directly
    if (viewport.sessionStorage) {
      Object.entries(viewport.sessionStorage).forEach(([key, value]) => {
        try {
          sessionStorage.setItem(key, value);
        } catch (e) {
          console.warn('Could not set sessionStorage key:', key, e);
        }
      });
    }

    // Return the saved URL so the caller can navigate to it
    return { success: true, savedUrl: viewport.url || null };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Convert experiment ID to the exact fragment used in localStorage keys.
// Single "7" → '["7"]', multi '["1","7"]' → '["1","7"]' (already in array format)
function experimentIdToKeyFragment(expId) {
  if (!expId) return null;
  if (expId.startsWith('[')) return expId;
  return '["' + expId + '"]';
}

// Inject a script into the PAGE context to block MLflow from overwriting
// specific localStorage keys during beforeunload (React state save on unload).
function blockStorageOverwrite(keysToBlock) {
  const script = document.createElement('script');
  script.textContent = `(function(){
    var _blocked = ${JSON.stringify(Array.isArray(keysToBlock) ? keysToBlock : [keysToBlock])};
    var _orig = Storage.prototype.setItem;
    Storage.prototype.setItem = function(k, v) {
      if (_blocked.indexOf(k) !== -1) {
        console.log('[MLflow Viewport] Blocked state overwrite during unload:', k);
        return;
      }
      return _orig.call(this, k, v);
    };
  })();`;
  (document.head || document.documentElement).appendChild(script);
  script.remove();
}

// Apply only chart configurations from imported viewport to current experiment
function setChartsOnlyConfiguration(viewport) {
  try {
    const currentExperimentId = getExperimentId();
    if (!currentExperimentId) {
      return { success: false, error: 'Cannot determine current experiment ID' };
    }

    const currentKeyFragment = experimentIdToKeyFragment(currentExperimentId);
    const sourceKeyFragment = experimentIdToKeyFragment(viewport.experimentId);

    console.log('[MLflow Viewport] Charts-only import:');
    console.log('  source:', sourceKeyFragment, '→ current:', currentKeyFragment);

    // Find the ReactComponentState in imported data (should be exactly one)
    let importedState = null;
    if (viewport.localStorage) {
      for (const [key, value] of Object.entries(viewport.localStorage)) {
        if (key.includes('ExperimentPage') && key.includes('ReactComponentState')) {
          try { importedState = JSON.parse(value); } catch (e) { /* ignore */ }
          console.log('  Found imported state key:', key);
          break;
        }
      }
    }

    if (!importedState) {
      return { success: false, error: 'No chart configuration found in imported data' };
    }

    // Use exact key construction (not search) to avoid matching double-escaped keys
    const currentStateKey = `MLflowLocalStorage-1.1-ExperimentPage-${currentKeyFragment}-ReactComponentState`;
    let currentState = {};
    try {
      const raw = localStorage.getItem(currentStateKey);
      if (raw) currentState = JSON.parse(raw);
      else console.log('  No existing state, creating key:', currentStateKey);
    } catch (e) { /* ignore */ }

    // Merge only chart-related fields
    const chartFields = [
      'compareRunCharts', 'compareRunSections', 'globalLineChartConfig',
      'isAccordionReordered', 'useGroupedValuesInCharts', 'hideEmptyCharts',
      'chartsSearchFilter', 'viewMaximized'
    ];

    const mergedFields = [];
    for (const field of chartFields) {
      if (importedState[field] !== undefined) {
        currentState[field] = importedState[field];
        mergedFields.push(field);
      }
    }
    console.log('  Merged fields:', mergedFields);

    const serialized = JSON.stringify(currentState);
    localStorage.setItem(currentStateKey, serialized);

    // Block MLflow from overwriting during page unload
    blockStorageOverwrite(currentStateKey);

    return { success: true };
  } catch (error) {
    console.error('[MLflow Viewport] Charts-only error:', error);
    return { success: false, error: error.message };
  }
}

// Show an import overlay directly on the page (avoids popup-closing-on-file-dialog issue)
function showImportOverlay(chartsOnly = false, skipConfirm = false) {
  // Remove existing overlay if any
  const existing = document.getElementById('mlflow-viewport-overlay');
  if (existing) existing.remove();

  const modeLabel = chartsOnly ? 'Charts Only' : 'Full Import';
  const modeHint = chartsOnly
    ? 'Only chart layout will be applied to the current experiment.'
    : 'All settings will be restored and page will navigate to the saved experiment.';

  const overlay = document.createElement('div');
  overlay.id = 'mlflow-viewport-overlay';
  overlay.innerHTML = `
    <div style="position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:999999;display:flex;align-items:center;justify-content:center;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
      <div style="background:#fff;border-radius:8px;padding:24px;max-width:400px;width:90%;box-shadow:0 4px 24px rgba(0,0,0,0.3)">
        <h3 style="margin:0 0 6px;font-size:16px;color:#333">Import Viewport — ${modeLabel}</h3>
        <div style="margin:0 0 14px;font-size:12px;color:#888">${modeHint}</div>
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
      if (!skipConfirm) {
        const confirmMsg = chartsOnly
          ? `Apply chart layout from "${parsedViewport.experimentName || 'saved'}" to the current experiment?\n\nOnly charts will change. Runs and filters stay as they are.`
          : `Full import: "${parsedViewport.experimentName || 'saved'}"\n\nThis will navigate to the saved experiment and restore ALL settings (charts, runs, filters).`;
        if (!window.confirm(confirmMsg)) {
          overlay.remove();
          return;
        }
      }

      const result = chartsOnly
        ? setChartsOnlyConfiguration(parsedViewport)
        : setViewportConfiguration(parsedViewport);

      msg.textContent = (chartsOnly ? 'Charts' : 'Viewport') + ' imported! Reloading...';
      msg.style.color = '#4CAF50';
      applyBtn.disabled = true;
      overlay.remove();

      // Full import: navigate to the saved experiment's URL
      // Charts-only: stay on current page, just reload
      if (!chartsOnly && result.success && result.savedUrl) {
        window.location.href = result.savedUrl;
      } else {
        window.location.reload();
      }
    } catch (err) {
      console.error('MLflow Viewport: import error:', err);
      msg.textContent = 'Import failed: ' + err.message;
      msg.style.color = '#d32f2f';
    }
  });
}

// Listen for messages from popup
browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'ping') {
    sendResponse({ pong: true });
    return;
  }
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
      const result = request.chartsOnly
        ? setChartsOnlyConfiguration(request.viewport)
        : setViewportConfiguration(request.viewport);
      if (result.success) {
        sendResponse({ success: true, savedUrl: result.savedUrl || null });
      } else {
        sendResponse({ error: result.error });
      }
    } catch (error) {
      sendResponse({ error: error.message });
    }
  } else if (request.action === 'showImportOverlay') {
    showImportOverlay(request.chartsOnly, request.skipConfirm);
    sendResponse({ success: true });
  }

  return true; // Keep message channel open for async response
});

console.log('MLflow Viewport extension loaded');

} // end of double-load guard
