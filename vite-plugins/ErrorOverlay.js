// Make HTMLElement available in non-browser environments
const { HTMLElement = class {} } = globalThis;

export class ErrorOverlay extends HTMLElement {
	// Multi-language translations
	static translations = {
		en: {
			helpText: 'Please check the code again and fix the syntax errors.'
		},
		ko: {
			helpText: '코드를 다시 확인하고 구문 오류를 수정하세요.'
		}
	};

	// Get language from sessionStorage (default: 'en')
	static getLang() {
		try {
			const lang = sessionStorage?.getItem('lang');
			if (lang && ErrorOverlay.translations[lang]) {
				return lang;
			}
		} catch (e) {}
		return 'ko';
	}

	static getOverlayHTML(title, details, componentName) {
		const lang = ErrorOverlay.getLang();
		const t = ErrorOverlay.translations[lang] || ErrorOverlay.translations.en;
		
		return `
			<div id="vite-error-overlay" style="
				position: fixed;
				inset: 0;
				z-index: 99999;
				display: flex;
				align-items: center;
				justify-content: center;
				padding: 20px;
				font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
			">
				<div style="max-width: 600px; width: 100%; text-align: center;">
					<!-- Error Icon -->
					<div style="
						width: 64px;
						height: 64px;
						margin: 0 auto 24px;
						background: linear-gradient(135deg, #6366f1 0%, #a855f7 50%, #ec4899 100%);
						border-radius: 16px;
						display: flex;
						align-items: center;
						justify-content: center;
						box-shadow: 0 25px 50px -12px rgba(99, 102, 241, 0.4);
					">
						<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
							<line x1="12" y1="9" x2="12" y2="13"></line>
							<line x1="12" y1="17" x2="12.01" y2="17"></line>
						</svg>
					</div>
					
					<!-- Help Text -->
					<p style="margin-top: 24px; font-size: 13px; color: #94a3b8;">
						${t.helpText}
					</p>
				</div>
			</div>
		`;
	}
	
	close() {
		this.parentNode?.removeChild(this);
	}

	static sendErrorToParent(error, title, details, componentName) {
		// Send error to parent using framewire
		if (globalThis.window?.parent) {
			try {
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
		overlay.innerHTML = ErrorOverlay.getOverlayHTML(title, details, componentName);

		// Add to DOM
		document.body.appendChild(overlay.firstElementChild);
	}
}


// vite/react-plugin transpiles classes with _SomeClass, so we need to replace all _ErrorOverlay with ErrorOverlay
export const errorOverlayCode = ErrorOverlay.toString().replaceAll('_ErrorOverlay', 'ErrorOverlay');
