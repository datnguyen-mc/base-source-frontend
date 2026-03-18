// Make HTMLElement available in non-browser environments
const { HTMLElement = class { } } = globalThis;

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
		} catch (e) { }
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
				background: #ffffff;
				font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
			">
				<div style="text-align: center; display: flex; flex-direction: column; align-items: center; gap: 24px;">
					<!-- Spinner ring with logo -->
					<div style="position: relative; width: 80px; height: 80px;">
						<!-- Conic gradient spinner ring -->
						<div style="
							position: absolute;
							inset: 0;
							border-radius: 9999px;
							background: conic-gradient(from 0deg, transparent 0%, transparent 30%, #6366f1 70%, #a855f7 100%);
							-webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 3.5px), #000 calc(100% - 3.5px));
							mask: radial-gradient(farthest-side, transparent calc(100% - 3.5px), #000 calc(100% - 3.5px));
							animation: ve-spin 1s linear infinite;
						"></div>
						<!-- Logo centered -->
						<div style="
							position: absolute;
							inset: 0;
							display: flex;
							align-items: center;
							justify-content: center;
						">
							<img src="https://cdn.vibe-x.app/assets/vibexLogo.png" alt="" style="width: 48px; height: auto; object-fit: contain;" />
						</div>
					</div>

					<!-- Text -->
					<div style="min-height: 60px;">
						<p style="margin: 0; font-size: 18px; color: #1f2937; font-weight: 600; letter-spacing: -0.025em;">
							${t.title}
						</p>
						<p style="margin: 6px 0 0; font-size: 15px; color: #9ca3af;">
							${t.text}
						</p>
					</div>

					<!-- Animated progress dots -->
					<div style="display: flex; align-items: center; gap: 8px;">
						<div style="width: 8px; height: 8px; border-radius: 9999px; background-color: #818cf8; animation: ve-dot-pulse 1.4s ease-in-out infinite; animation-delay: 0s;"></div>
						<div style="width: 8px; height: 8px; border-radius: 9999px; background-color: #818cf8; animation: ve-dot-pulse 1.4s ease-in-out infinite; animation-delay: 0.2s;"></div>
						<div style="width: 8px; height: 8px; border-radius: 9999px; background-color: #818cf8; animation: ve-dot-pulse 1.4s ease-in-out infinite; animation-delay: 0.4s;"></div>
					</div>
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

		// Add animation styles to head if not exists
		if (!document.getElementById('ve-spin-style')) {
			const style = document.createElement('style');
			style.id = 've-spin-style';
			style.textContent = `
				@keyframes ve-spin { to { transform: rotate(360deg); } }
				@keyframes ve-dot-pulse {
					0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
					40% { opacity: 1; transform: scale(1); }
				}
			`;
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
