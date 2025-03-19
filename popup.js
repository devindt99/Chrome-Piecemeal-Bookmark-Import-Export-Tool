chrome.bookmarks.getTree((tree) => {
  const bookmarkList = document.getElementById("bookmarkList");
  displayBookmarks(tree[0].children, bookmarkList);
});

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

// Handle importing bookmarks from a JSON file
document.getElementById("importButton").addEventListener("change", (event) => {
  const file = event.target.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const bookmarks = JSON.parse(e.target.result);
      importBookmarks(bookmarks);
    };
    reader.readAsText(file);
  }
});

async function importBookmarks(bookmarks, parentId = "1") {
  for (const bookmark of bookmarks) {
    if (bookmark.children) {
      // Check if the folder already exists
      const existingFolders = await getExistingBookmarks(parentId);
      const matchingFolder = existingFolders.find(f => f.title === bookmark.title);

      if (matchingFolder) {
        console.log(`Removing existing folder: ${matchingFolder.title}`);
        await removeBookmark(matchingFolder.id);
      }

      // Create the new folder
      console.log(`Creating new folder: ${bookmark.title}`);
      const newFolder = await createBookmark({ parentId, title: bookmark.title });

      // Recursively import its children
      await importBookmarks(bookmark.children, newFolder.id);
    } else {
      // Create the new bookmark
      console.log(`Creating new bookmark: ${bookmark.title}`);
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




