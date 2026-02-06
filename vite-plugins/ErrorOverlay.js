// Make HTMLElement available in non-browser environments
const { HTMLElement = class {} } = globalThis;

export class ErrorOverlay extends HTMLElement {
	// Multi-language translations
	static translations = {
		en: {
			title: 'Some errors',
			text: 'We’re retrying the failed update. Please wait a moment.'
		},
		ko: {
			title: '일부 오류가 발생하였습니다.',
			text: '실패한 업데이트를 다시 시도하고 있습니다. 잠시만 기다려 주세요.'
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
					<!-- Error Icon with Glow -->
					<div style="position: relative; width: 64px; height: 64px; margin: 0 auto 14px;">
						<!-- Glow Effect -->
						<div style="
							position: absolute;
							inset: -8px;
							background: linear-gradient(135deg, #6366f1 0%, #a855f7 100%);
							border-radius: 20px;
							opacity: 0.3;
							filter: blur(12px);
							animation: ve-pulse 2s ease-in-out infinite;
						"></div>
						<!-- Icon Box -->
						<div style="
							position: relative;
							width: 64px;
							height: 64px;
							background: linear-gradient(135deg, #6366f1 0%, #a855f7 50%, #ec4899 100%);
							border-radius: 16px;
							display: flex;
							align-items: center;
							justify-content: center;
							box-shadow: 0 25px 50px -12px rgba(99, 102, 241, 0.4);
						">
							<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="animation: ve-spin 1s linear infinite;">
								<path d="M21 12a9 9 0 1 1-6.219-8.56"></path>
							</svg>
						</div>
					</div>
					<p style="margin-top: 16px; font-size: 16px; color: #111827; font-weight: 600;">
						${t.title}
					</p>
					<!-- Help Text -->
					<p style="margin-top: 4px; font-size: 14px; color: #4B5563;">
						${t.text}
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

		// Add spin animation style to head if not exists
		if (!document.getElementById('ve-spin-style')) {
			const style = document.createElement('style');
			style.id = 've-spin-style';
			style.textContent = '@keyframes ve-spin { to { transform: rotate(360deg); } } @keyframes ve-pulse { 0%, 100% { opacity: 0.3; } 50% { opacity: 0.5; } }';
			document.head.appendChild(style);
		}

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
