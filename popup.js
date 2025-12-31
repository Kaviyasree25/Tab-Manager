// Popup script for Tab Manager
document.addEventListener('DOMContentLoaded', async () => {
  const autoSuspendCheckbox = document.getElementById('auto-suspend');
  const suspendMinutesInput = document.getElementById('suspend-minutes');
  const suspendAllBtn = document.getElementById('suspend-all-btn');
  const sessionNameInput = document.getElementById('session-name');
  const saveSessionBtn = document.getElementById('save-session-btn');
  const sessionsList = document.getElementById('sessions-list');
  const activeTabsEl = document.getElementById('active-tabs');
  const suspendedTabsEl = document.getElementById('suspended-tabs');
  const savedMemoryEl = document.getElementById('saved-memory');
  const themeToggle = document.getElementById('theme-toggle');

  // Load and apply theme
  async function loadTheme() {
    try {
      const result = await chrome.storage.local.get('tabManagerTheme');
      const isDarkMode = result.tabManagerTheme === 'dark';
      themeToggle.checked = isDarkMode;
      applyTheme(isDarkMode);
    } catch (error) {
      console.error('Error loading theme:', error);
    }
  }

  function applyTheme(isDarkMode) {
    if (isDarkMode) {
      document.body.classList.add('dark-mode');
    } else {
      document.body.classList.remove('dark-mode');
    }
  }

  // Theme toggle handler
  themeToggle.addEventListener('change', async (e) => {
    const isDarkMode = e.target.checked;
    applyTheme(isDarkMode);
    await chrome.storage.local.set({ tabManagerTheme: isDarkMode ? 'dark' : 'light' });
  });

  // Collapsible sections functionality
  const sessionsHeader = document.getElementById('sessions-header');
  const sessionsContent = document.getElementById('sessions-content');
  const sessionsSection = sessionsHeader.closest('.collapsible-section');

  // Load collapsed/expanded state
  async function loadSectionStates() {
    try {
      const result = await chrome.storage.local.get(['sessionsExpanded']);
      if (result.sessionsExpanded !== undefined) {
        if (result.sessionsExpanded) {
          sessionsSection.classList.add('expanded');
        } else {
          sessionsSection.classList.remove('expanded');
        }
      } else {
        // Default: collapsed
        sessionsSection.classList.remove('expanded');
      }
    } catch (error) {
      console.error('Error loading section states:', error);
    }
  }

  // Toggle sessions section
  sessionsHeader.addEventListener('click', async () => {
    const isExpanded = sessionsSection.classList.contains('expanded');
    if (isExpanded) {
      sessionsSection.classList.remove('expanded');
      await chrome.storage.local.set({ sessionsExpanded: false });
    } else {
      sessionsSection.classList.add('expanded');
      await chrome.storage.local.set({ sessionsExpanded: true });
    }
  });

  // Load settings
  async function loadSettings() {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'getSettings' });
      const settings = response.settings || {};
      
      autoSuspendCheckbox.checked = settings.autoSuspend !== false;
      suspendMinutesInput.value = settings.suspendAfterMinutes || 15;
    } catch (error) {
      console.error('Error loading settings:', error);
    }
  }

  // Load memory stats
  async function loadMemoryStats() {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'getMemoryInfo' });
      const memoryInfo = response.memoryInfo || {};
      
      activeTabsEl.textContent = memoryInfo.activeTabs || 0;
      suspendedTabsEl.textContent = memoryInfo.suspendedTabs || 0;
      savedMemoryEl.textContent = memoryInfo.savedMemoryMB ? `${memoryInfo.savedMemoryMB} MB` : '0 MB';
    } catch (error) {
      console.error('Error loading memory stats:', error);
    }
  }

  // Load sessions
  async function loadSessions() {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'getSessions' });
      const sessions = response.sessions || [];

      if (sessions.length === 0) {
        sessionsList.innerHTML = '<div class="empty-state">No saved sessions</div>';
        return;
      }

      sessionsList.innerHTML = sessions.map(session => {
        const date = new Date(session.createdAt);
        return `
          <div class="session-item">
            <div class="session-info">
              <div class="session-name">${escapeHtml(session.name)}</div>
              <div class="session-meta">
                ${session.tabs.length} tabs • ${date.toLocaleDateString()} ${date.toLocaleTimeString()}
              </div>
            </div>
            <div class="session-actions">
              <button class="btn btn-primary restore-session-btn" data-session-id="${session.id}" style="width: auto; padding: 5px 10px; font-size: 12px;">
                Restore
              </button>
              <button class="btn btn-danger delete-session-btn" data-session-id="${session.id}">
                Delete
              </button>
            </div>
          </div>
        `;
      }).join('');

      // Attach event listeners
      document.querySelectorAll('.restore-session-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const sessionId = btn.dataset.sessionId;
          await chrome.runtime.sendMessage({
            action: 'restoreSession',
            sessionId
          });
          loadSessions();
        });
      });

      document.querySelectorAll('.delete-session-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const sessionId = btn.dataset.sessionId;
          if (confirm('Delete this session?')) {
            await chrome.runtime.sendMessage({
              action: 'deleteSession',
              sessionId
            });
            loadSessions();
          }
        });
      });
    } catch (error) {
      console.error('Error loading sessions:', error);
    }
  }

  // Save settings
  autoSuspendCheckbox.addEventListener('change', async () => {
    await chrome.runtime.sendMessage({
      action: 'updateSettings',
      settings: {
        autoSuspend: autoSuspendCheckbox.checked
      }
    });
  });

  suspendMinutesInput.addEventListener('change', async () => {
    await chrome.runtime.sendMessage({
      action: 'updateSettings',
      settings: {
        suspendAfterMinutes: parseInt(suspendMinutesInput.value)
      }
    });
  });

  // Suspend all inactive tabs
  suspendAllBtn.addEventListener('click', async () => {
    const tabs = await chrome.tabs.query({ currentWindow: true });
    const activeTab = tabs.find(t => t.active);
    
    for (const tab of tabs) {
      if (tab.id !== activeTab.id && !tab.pinned) {
        await chrome.runtime.sendMessage({
          action: 'suspendTab',
          tabId: tab.id
        });
      }
    }
    
    setTimeout(loadMemoryStats, 500);
  });

  // Save session
  saveSessionBtn.addEventListener('click', async () => {
    const name = sessionNameInput.value.trim();
    await chrome.runtime.sendMessage({
      action: 'saveSession',
      name: name || undefined
    });
    
    sessionNameInput.value = '';
    loadSessions();
  });

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Initial load
  await loadTheme();
  await loadSectionStates();
  loadSettings();
  loadMemoryStats();
  loadSessions();

  // Refresh stats every 5 seconds
  setInterval(loadMemoryStats, 5000);
});
