const urlList = document.getElementById('urlList');
const newUrlInput = document.getElementById('newUrl');
const addBtn = document.getElementById('addBtn');
const status = document.getElementById('status');

function showStatus(msg, type) {
  status.textContent = msg;
  status.className = type;
  setTimeout(() => { status.className = ''; }, 2000);
}

async function getUrls() {
  const data = await browser.storage.local.get(['mlflowUrls', 'configSeeded']);
  // On first run, seed from config.local.json if it exists
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
    } catch (e) {
      // config.local.json doesn't exist or is invalid — that's fine
    }
    await browser.storage.local.set({ configSeeded: true });
  }
  return data.mlflowUrls || [];
}

async function saveUrls(urls) {
  await browser.storage.local.set({ mlflowUrls: urls });
}

function renderUrls(urls) {
  urlList.innerHTML = '';
  if (urls.length === 0) {
    urlList.innerHTML = '<li style="color:#888;font-size:13px">No URLs configured. Add one below.</li>';
    return;
  }
  urls.forEach((url, i) => {
    const li = document.createElement('li');
    li.innerHTML = `<span>${url}</span>`;
    const btn = document.createElement('button');
    btn.className = 'btn-remove';
    btn.textContent = 'Remove';
    btn.addEventListener('click', async () => {
      urls.splice(i, 1);
      await saveUrls(urls);
      renderUrls(urls);
      showStatus('Removed', 'success');
    });
    li.appendChild(btn);
    urlList.appendChild(li);
  });
}

function normalizeUrl(raw) {
  let url = raw.trim().replace(/\/+$/, '');
  if (!url) return null;
  // Basic validation
  try {
    const parsed = new URL(url);
    return parsed.origin; // e.g. http://localhost:5000
  } catch {
    return null;
  }
}

addBtn.addEventListener('click', async () => {
  const url = normalizeUrl(newUrlInput.value);
  if (!url) {
    showStatus('Invalid URL', 'error');
    return;
  }
  const urls = await getUrls();
  if (urls.includes(url)) {
    showStatus('Already added', 'error');
    return;
  }
  urls.push(url);
  await saveUrls(urls);
  renderUrls(urls);
  newUrlInput.value = '';
  showStatus('Added!', 'success');
});

newUrlInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') addBtn.click();
});

// Initial load
getUrls().then(renderUrls);

// Skip confirmation toggle
const skipConfirmToggle = document.getElementById('skipConfirmToggle');
browser.storage.local.get('skipImportConfirm').then(data => {
  skipConfirmToggle.checked = !!data.skipImportConfirm;
});
skipConfirmToggle.addEventListener('change', async () => {
  await browser.storage.local.set({ skipImportConfirm: skipConfirmToggle.checked });
  showStatus(skipConfirmToggle.checked ? 'Confirmations disabled' : 'Confirmations enabled', 'success');
});
