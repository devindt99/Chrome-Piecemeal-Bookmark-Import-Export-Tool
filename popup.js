const CLIENT_ID = "178471512667-4bcecdeg0u3rr82f1j5beg4fapojekq8.apps.googleusercontent.com";  // Replace with your actual client ID
const SCOPES = ["https://www.googleapis.com/auth/drive.readonly"];
const REDIRECT_URI = chrome.identity.getRedirectURL();


function handleAuthClick() {
  const authUrl = `https://accounts.google.com/o/oauth2/auth?client_id=${CLIENT_ID}&response_type=token&redirect_uri=${REDIRECT_URI}&scope=${SCOPES.join(" ")}`;

  chrome.identity.launchWebAuthFlow({ url: authUrl, interactive: true }, (redirectUrl) => {
    if (chrome.runtime.lastError) {
      console.error("Auth error:", chrome.runtime.lastError);
      return;
    }

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

async function pickFileFromDrive() {
  chrome.storage.local.get(["googleAccessToken"], async (result) => {
    if (!result.googleAccessToken) {
      alert("You need to authorize Google Drive first.");
      return;
    }

    try {
      const response = await fetch("https://www.googleapis.com/drive/v3/files?q=name contains 'bookmarks.json'&spaces=drive", {
        headers: { Authorization: `Bearer ${result.googleAccessToken}` },
      });

      const data = await response.json();
      if (!data.files || data.files.length === 0) {
        alert("No bookmarks.json files found in Drive.");
        return;
      }

      const container = document.getElementById("savedDriveFiles");
      container.innerHTML = ""; // clear previous tiles

      data.files.forEach((file) => {
        const tile = document.createElement("div");
        tile.className = "drive-file-tile";
        tile.textContent = file.name;
        tile.addEventListener("click", async () => {
          chrome.storage.local.set({ googleDriveFileId: file.id }, () => {
            alert(`File "${file.name}" selected!`);
            loadBookmarksFromDrive();
          });
        });
        container.appendChild(tile);
      });

    } catch (error) {
      console.error("Error selecting file:", error);
    }
  });
}


async function loadBookmarksFromDrive() {
  chrome.storage.local.get(["googleDriveFileId", "googleAccessToken"], async (result) => {
    if (!result.googleDriveFileId || !result.googleAccessToken) {
      console.error("No file selected or missing access token.");
      return;
    }

    try {
      const response = await fetch(`https://www.googleapis.com/drive/v3/files/${result.googleDriveFileId}?alt=media`, {
        headers: { Authorization: `Bearer ${result.googleAccessToken}` },
      });

      const bookmarks = await response.json();
      importBookmarks(bookmarks);
      alert("Bookmarks imported successfully from Google Drive!");

    } catch (error) {
      console.error("Error loading file:", error);
      alert("Error fetching bookmarks from Drive.");
    }
  });
}

document.getElementById("authorizeButton").addEventListener("click", handleAuthClick);
document.getElementById("pickFileButton").addEventListener("click", pickFileFromDrive);
// Function to import bookmarks
async function importBookmarks(bookmarks, parentId = "1") {
  
  for (const bookmark of bookmarks) {
    if (bookmark.children) {
      const existingFolders = await getExistingBookmarks(parentId);
      const matchingFolder = existingFolders.find(f => f.title === bookmark.title);

      if (matchingFolder) {
        await removeBookmark(matchingFolder.id);
      }

      const newFolder = await createBookmark({ parentId, title: bookmark.title });
      await importBookmarks(bookmark.children, newFolder.id);
    } else {
      await createBookmark({ parentId, title: bookmark.title, url: bookmark.url });
    }
  }
}

function getExistingBookmarks(parentId) {
  return new Promise((resolve) => {
    chrome.bookmarks.getChildren(parentId, (children) => {
      resolve(children || []);
    });
  });
}

function createBookmark(bookmark) {
  return new Promise((resolve) => {
    chrome.bookmarks.create(bookmark, resolve);
  });
}

function removeBookmark(bookmarkId) {
  return new Promise((resolve) => {
    chrome.bookmarks.removeTree(bookmarkId, resolve);
  });
}

chrome.bookmarks.getTree((tree) => {
  const bookmarkList = document.getElementById("bookmarkList");
  displayBookmarks(tree[0].children, bookmarkList);
});

function refreshBookmarkDisplay() {
  const bookmarkList = document.getElementById("bookmarkList");
  bookmarkList.innerHTML = ""; // Clear current display
  chrome.bookmarks.getTree((tree) => {
    displayBookmarks(tree[0].children, bookmarkList);
  });
}

function handleImport(bookmarks) {
  importBookmarks(bookmarks);
  setTimeout(refreshBookmarkDisplay, 1000); // slight delay to ensure bookmarks are created
}


// Recursively display the bookmarks with checkboxes and icons
function displayBookmarks(nodes, parentNode) {
  for (const node of nodes) {
  
    const listItem = document.createElement("li");

    // Create checkbox
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.dataset.id = node.id;
    // Determine if it's a folder or a bookmark
    let icon = document.createElement("span");

    if (node.children) {
      icon.textContent = "+ 📁"; // Closed folder
      icon.style.cursor = "pointer";
      icon.style.marginRight = "5px";
    }

    else {
      icon.textContent = "| 🔖"; // Bookmark icon
      icon.style.marginRight = "5px";
    }


    // Label (title)
    const label = document.createElement("span");
    label.textContent = node.title || "Unnamed";
    label.style.marginLeft = "5px";

    // Append elements
    listItem.appendChild(checkbox);
    listItem.appendChild(icon);
    listItem.appendChild(label);
    parentNode.appendChild(listItem);

    // Create sublist (hidden by default if it's a folder)
    let sublist;
    if (node.children) {
      sublist = document.createElement("ul");
      sublist.classList.add("hidden"); // Hide initially
      parentNode.appendChild(sublist);
      displayBookmarks(node.children, sublist);

      // Folder click toggles visibility
      icon.addEventListener("click", () => {
        const isHidden = sublist.classList.toggle("hidden");
        icon.textContent = isHidden ? "+ 📁" : "- 📂"; // Toggle open/close folder icon
      });
    }

    // Handle checking/unchecking logic
    checkbox.addEventListener("change", () => {
      if (node.children) {
        checkNested(checkbox, node.children, checkbox.checked);
      }
    });
  }
}




// Function to check/uncheck all nested checkboxes
function checkNested(parentCheckbox, children, isChecked) {
  children.forEach((child) => {
    const childCheckbox = document.querySelector(`input[data-id='${child.id}']`);
    if (childCheckbox) {
      childCheckbox.checked = isChecked;
    }
    if (child.children) {
      checkNested(childCheckbox, child.children, isChecked);
    }
  });
}

// Collect only explicitly checked bookmarks and export them
document.getElementById("exportButton").addEventListener("click", async () => {
  const selectedBookmarks = [];
  const checkedBoxes = [...document.querySelectorAll("input[type='checkbox']:checked")];

  const checkedIds = new Set(checkedBoxes.map(cb => cb.dataset.id)); // Track all checked IDs

  await Promise.all(checkedBoxes.map(cb =>
    new Promise(resolve => {
      chrome.bookmarks.getSubTree(cb.dataset.id, (nodes) => {
        nodes.forEach(node => {
          const hasCheckedParent = node.parentId && checkedIds.has(node.parentId);

          if (!node.children && !hasCheckedParent) {
            // Add as a standalone only if the parent isn't also checked
            selectedBookmarks.push(node);
          } else if (node.children && !hasCheckedParent) {
            // Add folder, but filter children
            selectedBookmarks.push({ ...node, children: filterCheckedChildren(node.children, checkedIds) });
          }
        });
        resolve();
      });
    })
  ));

  downloadJSON(selectedBookmarks, "bookmarks_export.json");
});

document.getElementById("importButton").addEventListener("change", (event) => {
  const file = event.target.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const bookmarks = JSON.parse(e.target.result);
      handleImport(bookmarks); // Use this instead of direct import
    };
    reader.readAsText(file);
  }
});


// Recursively filter out unchecked children
function filterCheckedChildren(children, checkedIds) {
  return children
    .filter((child) => checkedIds.has(child.id)) // Only include checked children
    .map((child) => {
      if (child.children) {
        return { ...child, children: filterCheckedChildren(child.children, checkedIds) };
      }
      return child;
    });
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
