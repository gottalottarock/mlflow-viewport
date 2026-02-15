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

// Export viewport configuration
exportBtn.addEventListener('click', async () => {
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });

    // Check if we're on an MLflow page
    if (!tab.url.includes('mlflow') && !tab.url.includes('localhost') && !tab.url.includes('/experiments/')) {
      showStatus('Please open an MLflow experiment page', 'error');
      return;
    }

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

    if (!tab.url.includes('mlflow') && !tab.url.includes('localhost') && !tab.url.includes('/experiments/')) {
      showStatus('Please open an MLflow experiment page', 'error');
      return;
    }

    await browser.tabs.sendMessage(tab.id, { action: 'showImportOverlay' });
    // Close the popup — the overlay on the page handles the rest
    window.close();
  } catch (error) {
    console.error('Import error:', error);
    showStatus('Import failed: ' + error.message, 'error');
  }
});
