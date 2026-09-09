const INTERNAL_COPY = [
  [/invalid server response/gi, 'Unable to complete the request.'],
  [/internal server error/gi, 'Something went wrong. Please try again.']
];

function sanitizeTextNode(node) {
  if (!node || !node.nodeValue) return;
  let value = node.nodeValue;
  for (const [pattern, replacement] of INTERNAL_COPY) value = value.replace(pattern, replacement);
  if (value !== node.nodeValue) node.nodeValue = value;
}

function sanitize(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  let node;
  while ((node = walker.nextNode())) nodes.push(node);
  nodes.forEach(sanitizeTextNode);
}

sanitize(document.body);
new MutationObserver(mutations => {
  for (const mutation of mutations) {
    for (const node of mutation.addedNodes) {
      if (node.nodeType === Node.TEXT_NODE) sanitizeTextNode(node);
      else if (node.nodeType === Node.ELEMENT_NODE) sanitize(node);
    }
  }
}).observe(document.body, { childList: true, subtree: true });
