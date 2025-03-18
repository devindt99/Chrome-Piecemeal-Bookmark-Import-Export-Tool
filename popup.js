chrome.bookmarks.getTree((tree) => {
  const bookmarkList = document.getElementById("bookmarkList");
  displayBookmarks(tree[0].children, bookmarkList);
});

// Recursively display the bookmarks with checkboxes and icons
function displayBookmarks(nodes, parentNode) {
  for (const node of nodes) {
    const listItem = document.createElement("li");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.dataset.id = node.id;

    // Create an icon and label for folder/bookmark distinction
    const icon = document.createElement("span");
    icon.textContent = node.children ? "📁 " : "🔖 ";
    
    const label = document.createElement("span");
    label.textContent = node.title || "Unnamed";

    listItem.classList.add(node.children ? "folder" : "bookmark");
    listItem.appendChild(checkbox);
    listItem.appendChild(icon);
    listItem.appendChild(label);
    parentNode.appendChild(listItem);

    // If the node has children, create a nested list
    if (node.children) {
      const sublist = document.createElement("ul");
      listItem.appendChild(sublist);
      displayBookmarks(node.children, sublist);
    }

    // Handle checking/unchecking logic for nested checkboxes
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

function importBookmarks(bookmarks, parentId = "1", idMap = {}) {
  bookmarks.forEach((bookmark) => {
    if (bookmark.children) {
      // Create the folder first
      chrome.bookmarks.create({ parentId, title: bookmark.title }, (newFolder) => {
        idMap[bookmark.id] = newFolder.id; // Store new ID
        importBookmarks(bookmark.children, newFolder.id, idMap); // Recursively add children
      });
    } else {
      // Queue bookmark creation until folders are set up
      setTimeout(() => {
        chrome.bookmarks.create({
          parentId: idMap[bookmark.parentId] || parentId,
          title: bookmark.title,
          url: bookmark.url
        });
      }, 500);
    }
  });
}
