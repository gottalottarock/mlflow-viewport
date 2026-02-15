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

function getViewportConfiguration() {
  // Extract viewport configuration from MLflow
  const viewport = {
    timestamp: new Date().toISOString(),
    url: window.location.href,
    experimentName: null,
    localStorage: {},
    sessionStorage: {},
    chartConfigs: []
  };

  // Capture localStorage items related to MLflow
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && (key.includes('mlflow') || key.includes('experiment') || key.includes('chart') || key.includes('metric'))) {
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
    if (key && (key.includes('mlflow') || key.includes('experiment') || key.includes('chart') || key.includes('metric'))) {
      try {
        viewport.sessionStorage[key] = sessionStorage.getItem(key);
      } catch (e) {
        console.warn('Could not read sessionStorage key:', key, e);
      }
    }
  }

  // Try to capture chart configurations from DOM
  const chartElements = document.querySelectorAll('[class*="chart"], [class*="plot"], [class*="visualization"]');
  chartElements.forEach((elem, index) => {
    try {
      const chartConfig = {
        index: index,
        type: elem.className,
        attributes: {}
      };

      // Capture data attributes
      Array.from(elem.attributes).forEach(attr => {
        if (attr.name.startsWith('data-')) {
          chartConfig.attributes[attr.name] = attr.value;
        }
      });

      viewport.chartConfigs.push(chartConfig);
    } catch (e) {
      console.warn('Could not capture chart config:', e);
    }
  });

  return viewport;
}

function setViewportConfiguration(viewport) {
  try {
    // Restore localStorage
    if (viewport.localStorage) {
      Object.entries(viewport.localStorage).forEach(([key, value]) => {
        try {
          localStorage.setItem(key, value);
        } catch (e) {
          console.warn('Could not set localStorage key:', key, e);
        }
      });
    }

    // Restore sessionStorage
    if (viewport.sessionStorage) {
      Object.entries(viewport.sessionStorage).forEach(([key, value]) => {
        try {
          sessionStorage.setItem(key, value);
        } catch (e) {
          console.warn('Could not set sessionStorage key:', key, e);
        }
      });
    }

    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
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
        sendResponse({ success: true });
      } else {
        sendResponse({ error: result.error });
      }
    } catch (error) {
      sendResponse({ error: error.message });
    }
  }

  return true; // Keep message channel open for async response
});

console.log('MLflow Viewport extension loaded');
