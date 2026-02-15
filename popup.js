const exportBtn = document.getElementById('exportBtn');
const importBtn = document.getElementById('importBtn');
const fileInput = document.getElementById('fileInput');
const status = document.getElementById('status');

function showStatus(message, type) {
  status.textContent = message;
  status.className = type;
  setTimeout(() => {
    status.className = '';
    status.style.display = 'none';
  }, 3000);
}

// Export viewport configuration
exportBtn.addEventListener('click', async () => {
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });

    // Check if we're on an MLflow page
    if (!tab.url.includes('mlflow') && !tab.url.includes('localhost') && !tab.url.includes('/experiments/')) {
      showStatus('Please open an MLflow experiment page', 'error');
      return;
    }

    // Request viewport data from content script
    console.log('Sending getViewport message to tab:', tab.id, tab.url);
    const response = await browser.tabs.sendMessage(tab.id, { action: 'getViewport' });
    console.log('Got response:', response);

    if (response.error) {
      showStatus(response.error, 'error');
      return;
    }

    const { experimentName, viewport } = response;

    // Sanitize experiment name for use as filename
    const safeName = experimentName.replace(/^\/+/, '').replace(/[/\\:*?"<>|]/g, '_') || 'mlflow_experiment';
    console.log('Experiment name:', experimentName, '-> filename:', safeName);

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

// Import viewport configuration
importBtn.addEventListener('click', () => {
  fileInput.click();
});

fileInput.addEventListener('change', async (event) => {
  const file = event.target.files[0];
  if (!file) return;

  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });

    // Check if we're on an MLflow page
    if (!tab.url.includes('mlflow') && !tab.url.includes('localhost') && !tab.url.includes('/experiments/')) {
      showStatus('Please open an MLflow experiment page', 'error');
      return;
    }

    // Read file content
    const text = await file.text();
    const viewport = JSON.parse(text);

    // Get current experiment name for confirmation
    const currentExp = await browser.tabs.sendMessage(tab.id, { action: 'getExperimentName' });

    // Show warning
    const confirmed = confirm(
      `This will overwrite the viewport configuration for experiment:\n"${currentExp.experimentName}"\n\nContinue?`
    );

    if (!confirmed) {
      showStatus('Import cancelled', 'warning');
      fileInput.value = '';
      return;
    }

    // Send viewport data to content script
    const response = await browser.tabs.sendMessage(tab.id, {
      action: 'setViewport',
      viewport: viewport
    });

    if (response.error) {
      showStatus(response.error, 'error');
    } else {
      showStatus('Viewport imported successfully!', 'success');
      // Reload the page after a short delay
      setTimeout(() => {
        browser.tabs.reload(tab.id);
      }, 1000);
    }
  } catch (error) {
    console.error('Import error:', error);
    showStatus('Import failed: ' + error.message, 'error');
  } finally {
    fileInput.value = '';
  }
});
