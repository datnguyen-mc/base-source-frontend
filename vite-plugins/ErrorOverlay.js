// Make HTMLElement available in non-browser environments
const { HTMLElement = class { } } = globalThis;

export class ErrorOverlay extends HTMLElement {
	// Multi-language translations (same as GlobalErrorFallback)
	static translations = {
		en: {
			title: 'Unknown error',
			text: "An unknown error has been detected. Please refresh and check again.",
		},
		ko: {
			title: '알수 없는 오류',
			text: '알수 없는 오류가 확인되었습니다. 새로고침 후 다시 확인해 주세요.',
		},
	};

	// AlertTriangle SVG (matches lucide-react AlertTriangle icon)
	static alertTriangleSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>';

	// Get language from sessionStorage (default: 'ko')
	static getLang() {
		try {
			const lang = sessionStorage?.getItem('lang');
			if (lang && ErrorOverlay.translations[lang]) {
				return lang;
			}
		} catch (e) { }
		return 'ko';
	}

	static getOverlayHTML() {
		const lang = ErrorOverlay.getLang();
		const t = ErrorOverlay.translations[lang] || ErrorOverlay.translations.ko;

		return `
			<div id="vite-error-overlay" style="
				position: fixed;
				inset: 0;
				z-index: 99999;
				display: flex;
				align-items: center;
				justify-content: center;
				padding: 0 16px;
				background: #faf9f7;
			">
				<div style="max-width: 28rem; width: 100%; text-align: center;">
					<!-- Icon -->
					<div style="
						width: 80px;
						height: 80px;
						margin: 0 auto 24px;
						background: #fee2e2;
						border-radius: 9999px;
						display: flex;
						align-items: center;
						justify-content: center;
					">
						${ErrorOverlay.alertTriangleSvg}
					</div>

					<!-- Title -->
					<h1 style="
						margin: 0 0 16px;
						font-size: 1.875rem;
						line-height: 2.25rem;
						color: #0a0a0a;
						font-weight: 400;
					">
						${t.title}
					</h1>

					<!-- Description -->
					<p style="margin: 0 0 32px; color: #4b5563; line-height: 1.625;">
						${t.text}
					</p>

					<!-- Refresh Button -->
					<button onclick="window.location.reload()" style="
						display: inline-flex;
						align-items: center;
						justify-content: center;
						gap: 8px;
						padding: 10px 24px;
						background: #0a0a0a;
						color: #ffffff;
						font-size: 14px;
						font-weight: 500;
						letter-spacing: 0.05em;
						text-transform: uppercase;
						border: none;
						border-radius: 8px;
						cursor: pointer;
					">
						<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>
						${lang === 'ko' ? '새로고침' : 'Refresh'}
					</button>
				</div>
			</div>
		`;
	}

	close() {
		this.parentNode?.removeChild(this);
	}

	static sendErrorToParent(error, title, details, componentName) {
		if (globalThis.window?.parent) {
			try {
				globalThis.window.parent?.postMessage({ type: 'sync_tax_error', data: 'true' }, '*');
				globalThis.window.parent?.postMessage({
					type: "app_error",
					error: { title, details, componentName, originalError: error }
				}, "*");
			} catch (error) {
				console.warn('Failed to send error to iframe parent:', error?.message);
			}
		}
	}

	constructor(error) {
		super(error)

		const stack = error?.stack;
		let componentName = stack?.match(/at\s+(\w+)\s+\(eval/)?.[1];
		if (componentName === 'eval') {
			componentName = null;
		}
		const title = componentName ? `in ${componentName}: ${error.message?.toString()}` : error.message?.toString();
		const details = error?.stack;

		// Call editor frame with the error (via post message)
		ErrorOverlay.sendErrorToParent(error, title, details, componentName);

		// Remove any existing overlay
		const existingOverlay = document.getElementById('vite-error-overlay');
		if (existingOverlay) {
			existingOverlay.remove();
		}

		// Create the overlay element using HTML template
		const overlay = document.createElement('div');
		overlay.innerHTML = ErrorOverlay.getOverlayHTML();

		// Add to DOM
		document.body.appendChild(overlay.firstElementChild);
	}
}


// vite/react-plugin transpiles classes with _SomeClass, so we need to replace all _ErrorOverlay with ErrorOverlay
export const errorOverlayCode = ErrorOverlay.toString().replaceAll('_ErrorOverlay', 'ErrorOverlay');
