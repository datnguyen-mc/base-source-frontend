// Guard against the React + Google Translate crash (facebook/react#11538).
// Google Translate swaps text nodes for its own <font> wrappers, so when React
// later removes/moves a node whose parent changed underneath it, removeChild /
// insertBefore throw NotFoundError and take down the whole tree. Making the
// parent-mismatch case a no-op keeps translation working without crashing.
let installed = false;

export function setupGoogleTranslateGuard() {
  if (installed) return;
  if (typeof Node !== "function" || !Node.prototype) return;
  installed = true;

  const originalRemoveChild = Node.prototype.removeChild;
  Node.prototype.removeChild = function (child) {
    if (child.parentNode !== this) {
      if (import.meta.env.DEV) {
        console.warn("Blocked removeChild on node from a different parent (Google Translate).", child, this);
      }
      return child;
    }
    return originalRemoveChild.apply(this, arguments);
  };

  const originalInsertBefore = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function (newNode, referenceNode) {
    if (referenceNode && referenceNode.parentNode !== this) {
      if (import.meta.env.DEV) {
        console.warn("Blocked insertBefore against a reference node from a different parent (Google Translate).", referenceNode, this);
      }
      return newNode;
    }
    return originalInsertBefore.apply(this, arguments);
  };
}
