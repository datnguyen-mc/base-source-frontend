import { parse } from '@babel/parser';
import { default as traverse } from '@babel/traverse';
import { default as generate } from '@babel/generator';
import * as t from '@babel/types';
import crypto from 'crypto';
import fs from 'fs';

// Simple LRU cache to avoid re-parsing unchanged files
const transformCache = new Map();
const CACHE_MAX_SIZE = 150;

function getCacheKey(code, id) {
	return crypto.createHash('md5').update(code).digest('hex') + ':' + id;
}

function setCache(key, value) {
	if (transformCache.size >= CACHE_MAX_SIZE) {
		// Evict oldest entry
		const firstKey = transformCache.keys().next().value;
		transformCache.delete(firstKey);
	}
	transformCache.set(key, value);
}


// Helper function to check if JSX element contains dynamic content
function checkIfElementHasDynamicContent(jsxElement) {
	let hasDynamicContent = false;

	// Helper function to check if any node contains dynamic patterns
	function checkNodeForDynamicContent(node) {
		// JSX expressions like {variable}, {func()}, {obj.prop}
		if (t.isJSXExpressionContainer(node)) {
			const expression = node.expression;

			// Skip empty expressions {}
			if (t.isJSXEmptyExpression(expression)) {
				return false;
			}

			// Any non-literal expression is considered dynamic
			if (!t.isLiteral(expression)) {
				return true;
			}
		}

		// Template literals with expressions `Hello ${name}`
		if (t.isTemplateLiteral(node) && node.expressions.length > 0) {
			return true;
		}

		// Member expressions like props.title, state.value
		if (t.isMemberExpression(node)) {
			return true;
		}

		// Function calls like getData(), format()
		if (t.isCallExpression(node)) {
			return true;
		}

		// Conditional expressions like condition ? "yes" : "no"
		if (t.isConditionalExpression(node)) {
			return true;
		}

		// Identifier references (could be props, state, variables)
		if (t.isIdentifier(node)) {
			// Common dynamic identifiers
			const dynamicNames = ['props', 'state', 'data', 'item', 'value', 'text', 'content'];
			if (dynamicNames.some(name => node.name.includes(name))) {
				return true;
			}
		}

		return false;
	}

	// Recursively traverse all child nodes
	function traverseNode(node) {
		if (checkNodeForDynamicContent(node)) {
			hasDynamicContent = true;
			return;
		}

		// Recursively check child nodes
		Object.keys(node).forEach(key => {
			const value = node[key];

			if (Array.isArray(value)) {
				value.forEach(child => {
					if (child && typeof child === 'object' && child.type) {
						if (t.isJSXElement(child) || t.isJSXFragment(child)) return;
						traverseNode(child);
					}
				});
			} else if (value && typeof value === 'object' && value.type) {
				if (t.isJSXElement(value) || t.isJSXFragment(value)) return;
				traverseNode(value);
			}
		});
	}

	// Check attributes of the JSX element
	if (jsxElement.openingElement && jsxElement.openingElement.attributes) {
		jsxElement.openingElement.attributes.forEach(attr => {
			if (hasDynamicContent) return;
			traverseNode(attr);
		});
	}

	// Check all children of the JSX element
	jsxElement.children.forEach(child => {
		if (hasDynamicContent) return; // Early exit if already found dynamic content
		if (t.isJSXElement(child) || t.isJSXFragment(child)) return; // DO NOT traverse into nested elements
		traverseNode(child);
	});

	return hasDynamicContent;
}

// Set of known HTML and SVG intrinsic element names.
// Lowercase JSX tags NOT in this set are assumed to belong to a custom reconciler
// (e.g. react-three-fiber: mesh, group, boxGeometry, fog, etc.) and must be
// skipped because they do not support HTML data-* attributes.
const HTML_AND_SVG_ELEMENTS = new Set([
	// HTML elements
	'a', 'abbr', 'address', 'area', 'article', 'aside', 'audio', 'b', 'base', 'bdi', 'bdo',
	'blockquote', 'body', 'br', 'button', 'canvas', 'caption', 'cite', 'code', 'col',
	'colgroup', 'data', 'datalist', 'dd', 'del', 'details', 'dfn', 'dialog', 'div', 'dl',
	'dt', 'em', 'embed', 'fieldset', 'figcaption', 'figure', 'footer', 'form', 'h1', 'h2',
	'h3', 'h4', 'h5', 'h6', 'head', 'header', 'hgroup', 'hr', 'html', 'i', 'iframe', 'img',
	'input', 'ins', 'kbd', 'label', 'legend', 'li', 'link', 'main', 'map', 'mark', 'menu',
	'meta', 'meter', 'nav', 'noscript', 'object', 'ol', 'optgroup', 'option', 'output',
	'p', 'param', 'picture', 'pre', 'progress', 'q', 'rp', 'rt', 'ruby', 's', 'samp',
	'script', 'search', 'section', 'select', 'slot', 'small', 'source', 'span', 'strong',
	'style', 'sub', 'summary', 'sup', 'table', 'tbody', 'td', 'template', 'textarea',
	'tfoot', 'th', 'thead', 'time', 'title', 'tr', 'track', 'u', 'ul', 'var', 'video', 'wbr',
	// SVG elements
	'svg', 'g', 'path', 'circle', 'rect', 'line', 'polyline', 'polygon', 'ellipse', 'text',
	'tspan', 'textPath', 'defs', 'use', 'symbol', 'clipPath', 'mask', 'pattern', 'image',
	'foreignObject', 'marker', 'linearGradient', 'radialGradient', 'stop', 'filter',
	'feBlend', 'feColorMatrix', 'feComponentTransfer', 'feComposite',
	'feConvolveMatrix', 'feDiffuseLighting', 'feDisplacementMap', 'feFlood',
	'feGaussianBlur', 'feImage', 'feMerge', 'feMergeNode', 'feMorphology', 'feOffset',
	'feSpecularLighting', 'feTile', 'feTurbulence', 'animate', 'animateMotion',
	'animateTransform', 'set', 'desc', 'metadata',
]);

function isHtmlOrSvgElement(tagName) {
	return HTML_AND_SVG_ELEMENTS.has(tagName);
}

export function babelTransformPlugin() {
	return {
		name: 'visual-edit-transform',
		enforce: 'pre',
		order: 'pre',
		// Inject Tailwind CDN for visual editing capabilities
		transformIndexHtml(html) {
			// Inject the Tailwind CSS CDN script right before the closing </head> tag
			const tailwindScript = `    <!-- Tailwind CSS CDN for visual editing -->\n    <script src="https://cdn.tailwindcss.com"></script>\n  `;
			return html.replace('</head>', tailwindScript + '</head>');
		},
		transform(code, id) {
			// Skip node_modules and visual-edit-agent itself
			if (id.includes('node_modules') || id.includes('visual-edit-agent')) {
				return null;
			}

			// Process JS/JSX/TS/TSX files
			if (!id.match(/\.(jsx?|tsx?)$/)) {
				return null;
			}

			// Skip files without JSX syntax (quick check before expensive parsing)
			if (!code.includes('<') || (!code.includes('/>') && !code.includes('</'))) {
				return null;
			}

			// Skip files that import from react-three-fiber, drei, or three.js
			// R3F uses a "pierced props" system where data-source-location gets split
			// into ['data', 'source', 'location'] and tries to access instance.data.source.location,
			// which crashes because Three.js objects don't have a 'data' property.
			if (
				code.includes('@react-three/') ||
				code.includes('from \'three\'') ||
				code.includes('from "three"') ||
				code.includes('from \'three/') ||
				code.includes('from "three/')
			) {
				return null;
			}

			// Check cache - return cached result if file content hasn't changed
			const cacheKey = getCacheKey(code, id);
			const cached = transformCache.get(cacheKey);
			if (cached) {
				return cached;
			}

			// Extract filename from path, preserving pages/ or components/ structure
			const pathParts = id.split('/');
			let filename;

			// Check if this is a pages or components file
			if (id.includes('/pages/')) {
				const pagesIndex = pathParts.findIndex(part => part === 'pages');
				if (pagesIndex >= 0 && pagesIndex < pathParts.length - 1) {
					// Get all parts from 'pages' to the file, preserving nested structure
					const relevantParts = pathParts.slice(pagesIndex, pathParts.length);
					const lastPart = relevantParts[relevantParts.length - 1];
					// Remove file extension from the last part
					relevantParts[relevantParts.length - 1] = lastPart.includes('.') ? lastPart.split('.')[0] : lastPart;
					filename = relevantParts.join('/');
				} else {
					filename = pathParts[pathParts.length - 1];
					if (filename.includes('.')) {
						filename = filename.split('.')[0];
					}
				}
			} else if (id.includes('/components/')) {
				const componentsIndex = pathParts.findIndex(part => part === 'components');
				if (componentsIndex >= 0 && componentsIndex < pathParts.length - 1) {
					// Get all parts from 'components' to the file, preserving nested structure
					const relevantParts = pathParts.slice(componentsIndex, pathParts.length);
					const lastPart = relevantParts[relevantParts.length - 1];
					// Remove file extension from the last part
					relevantParts[relevantParts.length - 1] = lastPart.includes('.') ? lastPart.split('.')[0] : lastPart;
					filename = relevantParts.join('/');
				} else {
					filename = pathParts[pathParts.length - 1];
					if (filename.includes('.')) {
						filename = filename.split('.')[0];
					}
				}
			} else {
				// For other files (like layout), just use the filename
				filename = pathParts[pathParts.length - 1];
				if (filename.includes('.')) {
					filename = filename.split('.')[0];
				}
			}

			try {
				// Parse the ORIGINAL source file from disk to get correct line numbers.
				// The `code` parameter may have been modified by @vitejs/plugin-react
				// (HMR preamble, import rewrites, hook wrappers) which shifts line numbers.
				let originalLineMap = null;
				try {
					const originalCode = fs.readFileSync(id, 'utf-8');
					const originalAst = parse(originalCode, {
						sourceType: 'module',
						plugins: [
							'jsx', 'typescript', 'decorators-legacy', 'classProperties',
							'objectRestSpread', 'functionBind', 'exportDefaultFrom',
							'exportNamespaceFrom', 'dynamicImport', 'nullishCoalescingOperator',
							'optionalChaining', 'asyncGenerators', 'bigInt',
							'optionalCatchBinding', 'throwExpressions'
						],
					});
					// Build ordered list of original JSX element positions (line:column)
					originalLineMap = [];
					traverse.default(originalAst, {
						JSXElement(path) {
							const el = path.node.openingElement;
							if (t.isJSXFragment(path.node)) return;
							if (t.isJSXIdentifier(el.name)) {
								const tagName = el.name.name;
								if (tagName[0] === tagName[0].toLowerCase() && !isHtmlOrSvgElement(tagName)) return;
							}
							const hasLoc = el.attributes.some(attr =>
								t.isJSXAttribute(attr) && t.isJSXIdentifier(attr.name) && attr.name.name === 'data-source-location'
							);
							if (hasLoc) return;
							const { line, column } = el.loc?.start || { line: 1, column: 0 };
							originalLineMap.push({ line, column });
						}
					});
				} catch (e) {
					// If we can't read/parse the original file, fall back to using transformed code positions
				}

				// Parse the transformed code into an AST
				const ast = parse(code, {
					sourceType: 'module',
					plugins: [
						'jsx',
						'typescript',
						'decorators-legacy',
						'classProperties',
						'objectRestSpread',
						'functionBind',
						'exportDefaultFrom',
						'exportNamespaceFrom',
						'dynamicImport',
						'nullishCoalescingOperator',
						'optionalChaining',
						'asyncGenerators',
						'bigInt',
						'optionalCatchBinding',
						'throwExpressions'
					],
				});

				// Traverse the AST and add source location and dynamic content attributes to JSX elements
				let elementsProcessed = 0;
				let elementIndex = 0;
				traverse.default(ast, {
					JSXElement(path) {
						const jsxElement = path.node;
						const openingElement = jsxElement.openingElement;

						// Skip fragments
						if (t.isJSXFragment(jsxElement)) return;

						// Skip non-DOM elements (e.g. react-three-fiber: mesh, group, boxGeometry, fog ...)
						// These are handled by a custom reconciler and do not support data-* attributes
						if (t.isJSXIdentifier(openingElement.name)) {
							const tagName = openingElement.name.name;
							if (tagName[0] === tagName[0].toLowerCase() && !isHtmlOrSvgElement(tagName)) {
								return;
							}
						}

						// Skip if already has source location attribute
						const hasSourceLocation = openingElement.attributes.some(attr =>
							t.isJSXAttribute(attr) &&
							t.isJSXIdentifier(attr.name) &&
							attr.name.name === 'data-source-location'
						);

						if (hasSourceLocation) return;

						// Use original file line numbers if available, otherwise fall back to transformed code positions
						let line, column;
						if (originalLineMap && elementIndex < originalLineMap.length) {
							line = originalLineMap[elementIndex].line;
							column = originalLineMap[elementIndex].column;
						} else {
							const loc = openingElement.loc?.start || { line: 1, column: 0 };
							line = loc.line;
							column = loc.column;
						}
						elementIndex++;

						// Create the source location attribute
						const sourceLocationAttr = t.jsxAttribute(
							t.jsxIdentifier('data-source-location'),
							t.stringLiteral(`${filename}:${line}:${column}`)
						);

						// Check if element has dynamic content
						const isDynamic = checkIfElementHasDynamicContent(jsxElement);

						// Create the dynamic content attribute
						const dynamicContentAttr = t.jsxAttribute(
							t.jsxIdentifier('data-dynamic-content'),
							t.stringLiteral(isDynamic ? 'true' : 'false')
						);

						// Try to find the nearest parent .map() loop to identify the data source
						let parentMap = path.findParent(p => 
							t.isCallExpression(p.node) && 
							t.isMemberExpression(p.node.callee) && 
							t.isIdentifier(p.node.callee.property, {name: 'map'})
						);
						let dynamicSource = '';
						if (parentMap) {
							if (t.isIdentifier(parentMap.node.callee.object)) {
								dynamicSource = parentMap.node.callee.object.name;
							} else if (t.isMemberExpression(parentMap.node.callee.object)) {
								let current = parentMap.node.callee.object;
								let parts = [];
								while (t.isMemberExpression(current)) {
									if (t.isIdentifier(current.property)) parts.unshift(current.property.name);
									current = current.object;
								}
								if (t.isIdentifier(current)) parts.unshift(current.name);
								dynamicSource = parts.join('.');
							}
						}

						const attributesToInject = [sourceLocationAttr, dynamicContentAttr];
						if (dynamicSource) {
							attributesToInject.push(t.jsxAttribute(
								t.jsxIdentifier('data-dynamic-source'),
								t.stringLiteral(dynamicSource)
							));
						}

						// Add attributes to the beginning of the attributes array
						openingElement.attributes.unshift(...attributesToInject);
						elementsProcessed++;
					}
				});

				// Generate the code back from the AST
				const result = generate.default(ast, {
					compact: false,
					concise: false,
					retainLines: true
				});

				const output = {
					code: result.code,
					map: null
				};

				// Cache the result
				setCache(cacheKey, output);

				return output;

			} catch (error) {
				console.error('Failed to add source location to JSX:', error);
				return {
					code: code, // Return original code on failure
					map: null
				};
			}
		}
	};
}