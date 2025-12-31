// Tab Manager Background Service Worker
class TabManager {
  constructor() {
    this.suspendedTabs = new Set();
    this.sessions = [];
    this.settings = {
      suspendAfterMinutes: 15,
      autoSuspend: true,
      maxTabsBeforeWarning: 20
    };
    this.init();
  }

  async init() {
    await this.loadSettings();
    await this.loadSessions();
    this.setupTabListeners();
    this.setupAutoSuspend();
  }

  async loadSettings() {
    const data = await chrome.storage.sync.get('tabManagerSettings');
    if (data.tabManagerSettings) {
      this.settings = { ...this.settings, ...data.tabManagerSettings };
    }
  }

  async loadSessions() {
    const data = await chrome.storage.local.get('savedSessions');
    if (data.savedSessions) {
      this.sessions = data.savedSessions;
    }
  }

  async saveSettings() {
    await chrome.storage.sync.set({ tabManagerSettings: this.settings });
  }

  async saveSessions() {
    await chrome.storage.local.set({ savedSessions: this.sessions });
  }

  setupTabListeners() {
    // Track tab activity
    chrome.tabs.onActivated.addListener((activeInfo) => {
      this.updateTabActivity(activeInfo.tabId);
    });

    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (changeInfo.status === 'complete' && tab.active) {
        this.updateTabActivity(tabId);
      }
    });

    // Restore suspended tabs when accessed
    chrome.tabs.onActivated.addListener(async (activeInfo) => {
      if (this.suspendedTabs.has(activeInfo.tabId)) {
        await this.restoreTab(activeInfo.tabId);
      }
    });

    // Monitor tab count
    chrome.tabs.onCreated.addListener(() => this.checkTabCount());
    chrome.tabs.onRemoved.addListener(() => this.checkTabCount());
  }

  setupAutoSuspend() {
    if (!this.settings.autoSuspend) return;

    // Check for inactive tabs every minute
    chrome.alarms.create('checkInactiveTabs', { periodInMinutes: 1 });
    
    chrome.alarms.onAlarm.addListener(async (alarm) => {
      if (alarm.name === 'checkInactiveTabs') {
        await this.suspendInactiveTabs();
      }
    });

    // Initial check
    this.suspendInactiveTabs();
  }

  tabActivity = new Map();

  updateTabActivity(tabId) {
    this.tabActivity.set(tabId, Date.now());
  }

  async suspendInactiveTabs() {
    if (!this.settings.autoSuspend) return;

    const now = Date.now();
    const suspendThreshold = this.settings.suspendAfterMinutes * 60 * 1000;

    const tabs = await chrome.tabs.query({});
    
    for (const tab of tabs) {
      // Skip if already suspended
      if (this.suspendedTabs.has(tab.id)) continue;
      
      // Skip if tab is active
      if (tab.active) continue;
      
      // Skip pinned tabs (optional - can be made configurable)
      if (tab.pinned) continue;
      
      // Skip chrome:// and extension:// pages
      if (tab.url && (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://'))) {
        continue;
      }

      const lastActive = this.tabActivity.get(tab.id) || tab.lastAccessed || 0;
      const inactiveTime = now - lastActive;

      if (inactiveTime > suspendThreshold) {
        await this.suspendTab(tab.id);
      }
    }
  }

  async suspendTab(tabId) {
    try {
      const tab = await chrome.tabs.get(tabId);
      if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
        return;
      }

      // Store tab data
      const tabData = {
        id: tabId,
        url: tab.url,
        title: tab.title,
        favIconUrl: tab.favIconUrl,
        suspendedAt: Date.now()
      };

      // Replace tab with suspended placeholder
      await chrome.tabs.update(tabId, {
        url: chrome.runtime.getURL('suspended.html') + '?url=' + encodeURIComponent(tab.url) + '&title=' + encodeURIComponent(tab.title || '')
      });

      this.suspendedTabs.add(tabId);
      await this.saveTabData(tabId, tabData);

      // Update activity tracking
      this.tabActivity.delete(tabId);
    } catch (error) {
      console.error('Error suspending tab:', error);
    }
  }

  async restoreTab(tabIdOrUrl) {
    try {
      let tabId = tabIdOrUrl;
      let tabData = null;

      // If it's a URL string, find the suspended tab with that URL
      if (typeof tabIdOrUrl === 'string' && tabIdOrUrl.startsWith('http')) {
        const tabs = await chrome.tabs.query({});
        const suspendedUrl = chrome.runtime.getURL('suspended.html');
        
        // Find the tab that shows suspended.html with matching URL parameter
        for (const tab of tabs) {
          if (tab.url && tab.url.startsWith(suspendedUrl)) {
            try {
              const urlParams = new URL(tab.url).searchParams;
              const originalUrl = urlParams.get('url');
              if (originalUrl === tabIdOrUrl) {
                tabId = tab.id;
                tabData = await this.getTabData(tab.id);
                break;
              }
            } catch (e) {
              // Continue searching
            }
          }
        }
      } else {
        // It's a tabId
        tabData = await this.getTabData(tabId);
      }

      if (!tabData) {
        // Fallback: try to find any suspended tab and restore it
        const tabs = await chrome.tabs.query({});
        const suspendedUrl = chrome.runtime.getURL('suspended.html');
        for (const tab of tabs) {
          if (tab.url && tab.url.startsWith(suspendedUrl)) {
            tabId = tab.id;
            tabData = await this.getTabData(tab.id);
            if (tabData) break;
          }
        }
      }

      if (!tabData) return;

      await chrome.tabs.update(tabId, {
        url: tabData.url
      });

      this.suspendedTabs.delete(tabId);
      await this.clearTabData(tabId);
      this.updateTabActivity(tabId);
    } catch (error) {
      console.error('Error restoring tab:', error);
    }
  }

  async saveTabData(tabId, data) {
    await chrome.storage.local.set({ [`suspendedTab_${tabId}`]: data });
  }

  async getTabData(tabId) {
    const result = await chrome.storage.local.get(`suspendedTab_${tabId}`);
    return result[`suspendedTab_${tabId}`];
  }

  async clearTabData(tabId) {
    await chrome.storage.local.remove(`suspendedTab_${tabId}`);
  }

  async saveCurrentSession(name) {
    const tabs = await chrome.tabs.query({ currentWindow: true });
    const session = {
      id: Date.now().toString(),
      name: name || `Session ${new Date().toLocaleString()}`,
      createdAt: Date.now(),
      tabs: tabs.map(tab => ({
        url: tab.url,
        title: tab.title,
        favIconUrl: tab.favIconUrl
      })).filter(tab => tab.url && !tab.url.startsWith('chrome://'))
    };

    this.sessions.unshift(session);
    // Keep only last 50 sessions
    if (this.sessions.length > 50) {
      this.sessions = this.sessions.slice(0, 50);
    }

    await this.saveSessions();
    return session;
  }

  async restoreSession(sessionId) {
    const session = this.sessions.find(s => s.id === sessionId);
    if (!session) return false;

    const tabIds = [];
    for (const tab of session.tabs) {
      try {
        const newTab = await chrome.tabs.create({ url: tab.url });
        tabIds.push(newTab.id);
      } catch (error) {
        console.error('Error restoring tab:', error);
      }
    }

    return true;
  }

  async deleteSession(sessionId) {
    this.sessions = this.sessions.filter(s => s.id !== sessionId);
    await this.saveSessions();
  }

  async getMemoryInfo() {
    try {
      // Chrome doesn't provide direct memory API, so we estimate
      const tabs = await chrome.tabs.query({});
      const suspendedCount = this.suspendedTabs.size;
      const activeCount = tabs.length - suspendedCount;
      
      // Rough estimate: ~50MB per active tab, ~1MB per suspended tab
      const estimatedMemory = {
        activeTabs: activeCount,
        suspendedTabs: suspendedCount,
        totalTabs: tabs.length,
        estimatedMemoryMB: Math.round((activeCount * 50) + (suspendedCount * 1)),
        savedMemoryMB: Math.round(suspendedCount * 49)
      };

      return estimatedMemory;
    } catch (error) {
      console.error('Error getting memory info:', error);
      return null;
    }
  }

  async checkTabCount() {
    const tabs = await chrome.tabs.query({});
    if (tabs.length > this.settings.maxTabsBeforeWarning) {
      chrome.action.setBadgeText({ text: tabs.length.toString() });
      chrome.action.setBadgeBackgroundColor({ color: '#e74c3c' });
    } else {
      chrome.action.setBadgeText({ text: '' });
    }
  }

  getSessions() {
    return this.sessions;
  }

  getSettings() {
    return this.settings;
  }

  async updateSettings(newSettings) {
    this.settings = { ...this.settings, ...newSettings };
    await this.saveSettings();
    
    if (newSettings.autoSuspend !== undefined) {
      this.setupAutoSuspend();
    }
  }
}

// Initialize tab manager
const tabManager = new TabManager();

// Message handling
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    switch (message.action) {
      case 'suspendTab':
        await tabManager.suspendTab(message.tabId);
        sendResponse({ success: true });
        break;
      
      case 'restoreTab':
        await tabManager.restoreTab(message.tabId || message.url);
        sendResponse({ success: true });
        break;
      
      case 'saveSession':
        const session = await tabManager.saveCurrentSession(message.name);
        sendResponse({ success: true, session });
        break;
      
      case 'restoreSession':
        const restored = await tabManager.restoreSession(message.sessionId);
        sendResponse({ success: restored });
        break;
      
      case 'deleteSession':
        await tabManager.deleteSession(message.sessionId);
        sendResponse({ success: true });
        break;
      
      case 'getSessions':
        sendResponse({ sessions: tabManager.getSessions() });
        break;
      
      case 'getMemoryInfo':
        const memoryInfo = await tabManager.getMemoryInfo();
        sendResponse({ memoryInfo });
        break;
      
      case 'getSettings':
        sendResponse({ settings: tabManager.getSettings() });
        break;
      
      case 'updateSettings':
        await tabManager.updateSettings(message.settings);
        sendResponse({ success: true });
        break;
      
      default:
        sendResponse({ error: 'Unknown action' });
    }
  })();
  return true;
});
