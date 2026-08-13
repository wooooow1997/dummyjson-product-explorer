/**
 * Minimal element factory.
 *
 * Everything user- or API-supplied goes through `text` / text children, which
 * use `textContent`. That makes the render path XSS-safe by construction, so
 * there is no hand-rolled HTML escaping to get wrong. The `html` prop exists
 * only for trusted, in-repo markup (the inline SVG icon set).
 *
 * @param {string} tag
 * @param {Record<string, unknown>} [props]
 * @param {Array<Node|string|null|false|undefined>|Node|string} [children]
 * @returns {HTMLElement}
 */
export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);

  for (const [key, value] of Object.entries(props)) {
    if (value === null || value === undefined || value === false) continue;

    if (key === 'class') node.className = String(value);
    else if (key === 'text') node.textContent = String(value);
    else if (key === 'html') node.innerHTML = String(value);
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (value === true) node.setAttribute(key, '');
    else node.setAttribute(key, String(value));
  }

  for (const child of Array.isArray(children) ? children : [children]) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }

  return node;
}

/** Replace all children of `parent` with `nodes` in a single reflow. */
export function replaceChildren(parent, nodes) {
  const list = (Array.isArray(nodes) ? nodes : [nodes]).filter(Boolean);
  parent.replaceChildren(...list);
}

/** @returns {HTMLElement} */
export function qs(selector, scope = document) {
  const node = scope.querySelector(selector);
  if (!node) throw new Error(`Expected element not found: ${selector}`);
  return node;
}
