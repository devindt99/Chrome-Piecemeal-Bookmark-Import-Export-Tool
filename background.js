chrome.runtime.onInstalled.addListener(() => {
    console.log("Background script loaded!");
  });
  
  // Listen for messages (e.g., OAuth tokens)
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "storeToken") {
      chrome.storage.local.set({ googleAccessToken: request.token }, () => {
        console.log("Google Drive Access Token stored.");
        sendResponse({ success: true });
      });
    }
    return true; // Keep the service worker alive
  });
  