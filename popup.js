// === Google Drive OAuth ===
const CLIENT_ID = "178471512667-4bcecdeg0u3rr82f1j5beg4fapojekq8.apps.googleusercontent.com";
const SCOPES = ["https://www.googleapis.com/auth/drive.readonly"];
const REDIRECT_URI = chrome.identity.getRedirectURL();


//TODO: preserve Google Drive logged in UI across sessions
function handleAuthClick() {
  const authUrl = `https://accounts.google.com/o/oauth2/auth?client_id=${CLIENT_ID}&response_type=token&redirect_uri=${REDIRECT_URI}&scope=${SCOPES.join(" ")}`;
  chrome.identity.launchWebAuthFlow({ url: authUrl, interactive: true }, (redirectUrl) => {
    if (chrome.runtime.lastError) return console.error("Auth error:", chrome.runtime.lastError);
    const urlParams = new URLSearchParams(new URL(redirectUrl).hash.replace("#", "?"));
    const accessToken = urlParams.get("access_token");
    if (accessToken) {
      chrome.storage.local.set({ googleAccessToken: accessToken }, () => {
        console.log("Google Drive Access Token saved!");
        document.getElementById("pickFileButton").style.display = "block";
      });
    }
  });
}

// === Google Drive File Picker & Loader ===
async function pickFileFromDrive() {
  chrome.storage.local.get(["googleAccessToken", "trackedDriveFiles"], async (result) => {
    if (!result.googleAccessToken) return alert("You need to authorize Google Drive first.");

    try {
      const response = await fetch("https://www.googleapis.com/drive/v3/files?q=name contains 'bookmarks.json'&spaces=drive", {
        headers: { Authorization: `Bearer ${result.googleAccessToken}` },
      });

      const data = await response.json();
      if (!data.files || data.files.length === 0) return alert("No bookmarks.json files found in Drive.");

      const container = document.getElementById("savedDriveFiles");
      container.innerHTML = "";
      const trackedFiles = result.trackedDriveFiles || [];

      data.files.forEach((file) => {
        const alreadyTracked = trackedFiles.some(f => f.id === file.id);
        const tile = document.createElement("div");
        tile.className = "drive-file-tile";
        tile.textContent = "💾 " + file.name;
        tile.addEventListener("click", () => {
          if (!alreadyTracked) {
            trackedFiles.push({ id: file.id, name: file.name });
            chrome.storage.local.set({ trackedDriveFiles: trackedFiles }, () => {
              alert(`File "${file.name}" is now tracked!`);
              displayTrackedDriveFiles();
            });
          } else {
            alert(`"${file.name}" is already tracked.`);
          }
        });
        container.appendChild(tile);
      });

    } catch (error) {
      console.error("Error selecting file:", error);
    }
  });
}


//TODO: Make untracking functionality
//TODO: Make update all functionality
function displayTrackedDriveFiles() {
  chrome.storage.local.get(["trackedDriveFiles"], (result) => {
    const container = document.getElementById("savedDriveFiles");
    container.innerHTML = "";
    const files = result.trackedDriveFiles || [];

    files.forEach((file) => {
      const tile = document.createElement("div");
      tile.className = "drive-file-tile";
      tile.textContent = "🔄 " + file.name;

      tile.addEventListener("click", () => {
        chrome.storage.local.get(["googleAccessToken"], async (res) => {
          if (!res.googleAccessToken) return alert("You need to re-authenticate Google Drive.");
          try {
            const response = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`, {
              headers: { Authorization: `Bearer ${res.googleAccessToken}` },
            });
            const bookmarks = await response.json();
            handleImport(bookmarks);
            alert(`Imported: ${file.name}`);
          } catch (error) {
            console.error("Error loading from Drive:", error);
            alert("Failed to load file from Drive.");
          }
        });
      });

      container.appendChild(tile);
    });
  });
}

// === Bookmark Import Logic ===
//TODO: Change bookmark replace logic to use UUID (assign it during export since default id field is not unique) instead of title
async function importBookmarks(bookmarks, parentId = "1") {
  for (const bookmark of bookmarks) {
    if (bookmark.children) {
      const existingFolders = await getExistingBookmarks(parentId);
      const match = existingFolders.find(f => f.title === bookmark.title);
      if (match) await removeBookmark(match.id);
      const newFolder = await createBookmark({ parentId, title: bookmark.title });
      await importBookmarks(bookmark.children, newFolder.id);
    } else {
      await createBookmark({ parentId, title: bookmark.title, url: bookmark.url });
    }
  }
}

function handleImport(bookmarks) {
  importBookmarks(bookmarks);
  setTimeout(refreshBookmarkDisplay, 1000);
}

// === Bookmark Utilities ===
function getExistingBookmarks(parentId) {
  return new Promise(resolve => chrome.bookmarks.getChildren(parentId, resolve));
}
function createBookmark(bookmark) {
  return new Promise(resolve => chrome.bookmarks.create(bookmark, resolve));
}
function removeBookmark(id) {
  return new Promise(resolve => chrome.bookmarks.removeTree(id, resolve));
}

// === Bookmark Display ===
//TODO: Make bookmarks 

function displayBookmarks(nodes, parentNode) {
  for (const node of nodes) {
    const listItem = document.createElement("li");

    listItem.className = "bookmark-row";
    listItem.style.display = "flex";
    listItem.style.alignItems = "center";
    listItem.style.justifyContent = "space-between";
    listItem.style.gap = "10px";

    const leftSide = document.createElement("div");

    leftSide.className = "bookmark-left";
    leftSide.style.display = "flex";
    leftSide.style.alignItems = "center";
    leftSide.style.flex = "1";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.dataset.id = node.id;

    const icon = document.createElement("span");
    icon.textContent = node.children ? "+📁" : "🔖";
    icon.style.cursor = node.children ? "pointer" : "default";
    icon.style.marginRight = "5px";

    const label = document.createElement(node.children ? "span" : "a");
    label.textContent = node.title || "Unnamed";
    label.style.marginLeft = "5px";
    if (!node.children && node.url) {
      label.href = node.url;
      label.target = "_blank";
      label.style.textDecoration = "none";
      label.style.color = "inherit";
    }

    leftSide.appendChild(checkbox);
    leftSide.appendChild(icon);
    leftSide.appendChild(label);
    listItem.appendChild(leftSide);

    // ✕ delete button
    const deleteBtn = document.createElement("button");
    deleteBtn.textContent = "✕";
    deleteBtn.style.color = "red";
    deleteBtn.style.border = "none";
    deleteBtn.style.background = "transparent";
    deleteBtn.style.cursor = "pointer";
    deleteBtn.title = "Delete this item";

    deleteBtn.addEventListener("click", async () => {
      if (confirm(`Delete "${node.title}" and its contents?`)) {
        await removeBookmark(node.id);
        refreshBookmarkDisplay(); // Refresh after deletion
      }
    });

    listItem.appendChild(deleteBtn);
    parentNode.appendChild(listItem);

    // Handle folders
    if (node.children) {
      const sublist = document.createElement("ul");
      sublist.classList.add("hidden");
      parentNode.appendChild(sublist);

      displayBookmarks(node.children, sublist);

      icon.addEventListener("click", () => {
        const isHidden = sublist.classList.toggle("hidden");
        icon.textContent = isHidden ? "+📁" : "- 📂";
      });
    }

    // Nested checkbox logic
    checkbox.addEventListener("change", () => {
      if (node.children) {
        checkNested(checkbox, node.children, checkbox.checked);
      }
    });
  }
}

function refreshBookmarkDisplay() {
  const bookmarkList = document.getElementById("bookmarkList");
  bookmarkList.innerHTML = "";
  chrome.bookmarks.getTree((tree) => {
    displayBookmarks(tree[0].children, bookmarkList);
  });
}

function checkNested(parentCheckbox, children, isChecked) {
  children.forEach((child) => {
    const childCheckbox = document.querySelector(`input[data-id='${child.id}']`);
    if (childCheckbox) childCheckbox.checked = isChecked;
    if (child.children) checkNested(childCheckbox, child.children, isChecked);
  });
}

// === Export Bookmarks ===
document.getElementById("exportButton").addEventListener("click", async () => {
  const selectedBookmarks = [];
  const checkedBoxes = [...document.querySelectorAll("input[type='checkbox']:checked")];
  const checkedIds = new Set(checkedBoxes.map(cb => cb.dataset.id));

  await Promise.all(checkedBoxes.map(cb => new Promise(resolve => {
    chrome.bookmarks.getSubTree(cb.dataset.id, (nodes) => {
      nodes.forEach(node => {
        const hasCheckedParent = node.parentId && checkedIds.has(node.parentId);
        if (!node.children && !hasCheckedParent) {
          selectedBookmarks.push(node);
        } else if (node.children && !hasCheckedParent) {
          selectedBookmarks.push({ ...node, children: filterCheckedChildren(node.children, checkedIds) });
        }
      });
      resolve();
    });
  })));

  downloadJSON(selectedBookmarks, "bookmarks_export.json");
});

function filterCheckedChildren(children, checkedIds) {
  return children
    .filter(child => checkedIds.has(child.id))
    .map(child => child.children
      ? { ...child, children: filterCheckedChildren(child.children, checkedIds) }
      : child);
}

function downloadJSON(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// === Manual File Import ===
document.getElementById("importButton").addEventListener("change", (event) => {
  const file = event.target.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const bookmarks = JSON.parse(e.target.result);
      handleImport(bookmarks);
    };
    reader.readAsText(file);
  }
});

// === Initialize Bookmark Tree ===
chrome.bookmarks.getTree((tree) => {
  const bookmarkList = document.getElementById("bookmarkList");
  displayBookmarks(tree[0].children, bookmarkList);
});

// === DOM Events for Auth and Drive Buttons ===
document.getElementById("authorizeButton").addEventListener("click", handleAuthClick);
document.getElementById("pickFileButton").addEventListener("click", pickFileFromDrive);
document.addEventListener("DOMContentLoaded", displayTrackedDriveFiles);
