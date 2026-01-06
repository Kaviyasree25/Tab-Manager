#  Tab Manager - Chrome Extension

A lightweight and efficient Chrome extension designed to help users organize, manage, and declutter their browser tabs. This tool is perfect for power users who often find themselves overwhelmed by too many open windows. 

---

##  Key Features

* ** Search Tabs:** Quickly find the specific tab you need using a real-time search bar.
* ** Grouping:** Organize your tabs into logical groups to keep your workspace clean.
* ** One-Click Actions:** Close, pin, or jump to any tab instantly from the extension popup.
* ** Memory Optimization:** Helps reduce browser lag by identifying and managing idle tabs.
* ** Dark Mode Support:** Easy on the eyes with a sleek, modern interface.

---

##  Tech Stack

* **Frontend:** HTML5, CSS3, JavaScript
* **APIs:** Chrome Extension API (`chrome.tabs`, `chrome.storage`, `chrome.runtime`)
* **Manifest Version:** V3 (The latest and most secure standard for Chrome Extensions)

---

##  Installation

To run this extension locally for development or personal use, follow these steps:

1.  **Clone the Repository:**
    ```bash
    git clone [https://github.com/Kaviyasree25/Tab-Manager.git](https://github.com/Kaviyasree25/Tab-Manager.git)
    ```
2.  **Open Chrome Extensions Page:**
    * Open Google Chrome.
    * Navigate to `chrome://extensions/`.
3.  **Enable Developer Mode:**
    * Toggle the **Developer mode** switch in the top right corner.
4.  **Load the Extension:**
    * Click the **Load unpacked** button.
    * Select the folder where you cloned/downloaded the repository.
5.  **Start Managing:**
    * The **Tab Manager** icon should now appear in your extension toolbar! 

---

##  File Structure

```text
Tab-Manager/
├── manifest.json    # Extension configuration and permissions
├── popup.html       # The main UI of the extension
├── popup.js         # Logic for tab management and searching
├── styles.css       # Custom styling for the popup
└── assets/          # Icons and images


