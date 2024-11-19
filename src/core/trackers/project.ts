import { BaseTracker } from './base';

interface ProjectMetrics {
  framework: {
    name: string;
    version: string;
    type: string;
    features: string[];
  };
  buildTools: {
    bundler?: string;
    transpiler?: string;
    packageManager?: string;
  };
  dependencies: {
    ui: string[];
    state: string[];
    routing: string[];
    styling: string[];
    testing: string[];
  };
  features: {
    ssr: boolean;
    pwa: boolean;
    webgl: boolean;
    localStorage: boolean;
    serviceWorker: boolean;
    api: {
      rest: boolean;
      graphql: boolean;
      websocket: boolean;
    };
  };
  environment: {
    userAgent: string;
    platform: string;
    language: string;
    screenResolution: {
      width: number;
      height: number;
    };
    viewport: {
      width: number;
      height: number;
    };
    connection: any;
  };
  repository: {
    type: 'monorepo' | 'polyrepo' | 'unknown';
    manager?: 'turbo' | 'nx' | 'lerna' | 'yarn-workspaces' | 'pnpm-workspaces';
    details?: {
      workspaces?: string[];
      packages?: number;
      hasRoot?: boolean;
      config?: any;
    };
  };
  buildSystem: {
    type: string;
    config?: any;
    features: string[];
    dependencies?: string[];
    scripts?: Record<string, string>;
  };
}

export class ProjectTracker extends BaseTracker {
	private metrics: ProjectMetrics;
	private readonly FRAMEWORK_PATTERNS = {
		next: {
			name: "Next.js",
			type: "meta-framework",
			features: ["ssr", "app-router", "api-routes", "react"],
			detect: () => !!((window as any).__NEXT_DATA__ || document.getElementById("__next") || document.querySelector("[data-nextjs-page]") || document.querySelector('script[src*="/_next/"]')),
		},
		react: {
			name: "React",
			type: "library",
			features: ["components", "virtual-dom"],
			detect: () => !!((window as any).React || document.querySelector("[data-reactroot]") || document.querySelector("[data-react-helmet]")),
		},
		vue: {
			name: "Vue",
			type: "framework",
			features: ["components", "reactivity"],
			detect: () => !!((window as any).__VUE__ || document.querySelector("[data-v-]") || document.querySelector("#__nuxt")),
		},
		angular: {
			name: "Angular",
			type: "framework",
			features: ["components", "dependency-injection"],
			detect: () => !!(document.querySelector("[ng-version]") || (window as any).ng),
		},
		svelte: {
			name: "Svelte",
			type: "framework",
			features: ["components", "reactivity"],
			detect: () => !!document.querySelector("style[data-svelte]"),
		},
	};

	private initializeMetrics(): ProjectMetrics {
		return {
			framework: {
				name: "Unknown",
				version: "0.0.0",
				type: "unknown",
				features: [],
			},
			buildTools: {},
			dependencies: {
				ui: [],
				state: [],
				routing: [],
				styling: [],
				testing: [],
			},
			features: {
				ssr: false,
				pwa: false,
				webgl: false,
				localStorage: false,
				serviceWorker: false,
				api: {
					rest: false,
					graphql: false,
					websocket: false,
				},
			},
			environment: {
				userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
				platform: typeof navigator !== "undefined" ? navigator.platform : "",
				language: typeof navigator !== "undefined" ? navigator.language : "",
				screenResolution: {
					width: typeof window !== "undefined" ? window.screen.width : 0,
					height: typeof window !== "undefined" ? window.screen.height : 0,
				},
				viewport: {
					width: typeof window !== "undefined" ? window.innerWidth : 0,
					height: typeof window !== "undefined" ? window.innerHeight : 0,
				},
				connection: typeof navigator !== "undefined" ? (navigator as any).connection : null,
			},
			repository: {
				type: "unknown",
			},
			buildSystem: {
				type: "unknown",
				features: [],
			},
		};
	}

	constructor(analytics: any) {
		super(analytics);
		this.metrics = this.initializeMetrics();
	}

	async init(): Promise<void> {
		if (typeof window === "undefined") return;

		try {
			// Use requestIdleCallback for non-critical detection
			if ("requestIdleCallback" in window) {
				window.requestIdleCallback(() => this.detectFrameworkAndFeatures(), {
					timeout: 2000,
				});
			} else {
				this.detectFrameworkAndFeatures();
			}

			this.log("Project tracker initialized");
		} catch (error) {
			console.warn("Error initializing project tracker:", error);
		}
	}

	getData(): any {
		return {
			...this.metrics,
			summary: {
				framework: `${this.metrics.framework.name} ${this.metrics.framework.version}`,
				buildTools: Object.values(this.metrics.buildTools).filter(Boolean).join(", "),
				mainFeatures: this.getMainFeatures(),
				environment: this.getEnvironmentSummary(),
			},
		};
	}

	private detectFrameworkAndFeatures(): void {
		// Detect framework
		this.metrics.framework = this.detectFramework();

		// Detect build tools
		this.metrics.buildTools = this.detectBuildTools();

		// Detect dependencies
		this.metrics.dependencies = this.detectDependencies();

		// Detect features
		this.metrics.features = this.detectFeatures();

		// Detect repository type
		this.metrics.repository = this.detectRepository();

		// Detect build system
		this.metrics.buildSystem = this.detectBuildSystem();

		// Track in analytics
		this.analytics.track("projectDetection", {
			framework: this.metrics.framework,
			buildTools: this.metrics.buildTools,
			features: this.metrics.features,
			timestamp: new Date().toISOString(),
		});
	}

	private detectFramework(): ProjectMetrics["framework"] {
		// Check for frameworks in order of specificity
		for (const [key, pattern] of Object.entries(this.FRAMEWORK_PATTERNS)) {
			if (pattern.detect()) {
				return {
					name: pattern.name,
					version: this.getFrameworkVersion(key),
					type: pattern.type,
					features: pattern.features,
				};
			}
		}

		return {
			name: "Unknown",
			version: "0.0.0",
			type: "unknown",
			features: [],
		};
	}

	private getFrameworkVersion(framework: string): string {
		try {
			switch (framework) {
				case "next":
					return (window as any).__NEXT_DATA__?.buildId || "unknown";
				case "react":
					return (window as any).React?.version || "unknown";
				case "vue":
					return (window as any).Vue?.version || "unknown";
				case "angular":
					return document.querySelector("[ng-version]")?.getAttribute("ng-version") || "unknown";
				default:
					return "unknown";
			}
		} catch {
			return "unknown";
		}
	}

	private detectBuildTools(): ProjectMetrics["buildTools"] {
		const buildTools: ProjectMetrics["buildTools"] = {};

		// Detect bundler
		if (document.querySelector('script[src*="webpack"]')) {
			buildTools.bundler = "webpack";
		} else if (document.querySelector('script[type="module"][src*="vite"]')) {
			buildTools.bundler = "vite";
		}

		// Detect transpiler
		if (document.querySelector('script[type="text/babel"]')) {
			buildTools.transpiler = "babel";
		} else if (document.querySelector('script[src*=".tsx"]')) {
			buildTools.transpiler = "typescript";
		}

		// Detect package manager from meta tags or scripts
		const packageManager = document.querySelector('meta[name="package-manager"]')?.getAttribute("content");
		if (packageManager) {
			buildTools.packageManager = packageManager;
		}

		return buildTools;
	}

	private detectDependencies(): ProjectMetrics["dependencies"] {
		const deps: ProjectMetrics["dependencies"] = {
			ui: [],
			state: [],
			routing: [],
			styling: [],
			testing: [],
		};

		// Detect UI libraries efficiently using Set for deduplication
		const uiLibraries = new Set<string>();

		// Use single querySelectorAll for better performance
		const elements = document.querySelectorAll("*");
		const classNames = new Set<string>();

		elements.forEach((el) => {
			el.classList.forEach((className) => classNames.add(className));
		});

		// Check class patterns
		if (classNames.has("MuiButton") || classNames.has("MuiBox")) uiLibraries.add("material-ui");
		if (Array.from(classNames).some((c) => c.startsWith("chakra-"))) uiLibraries.add("chakra-ui");
		if (Array.from(classNames).some((c) => c.startsWith("ant-"))) uiLibraries.add("ant-design");
		if (this.hasTailwindClasses(classNames)) uiLibraries.add("tailwind");

		deps.ui = Array.from(uiLibraries);

		// Detect state management
		if ((window as any).__REDUX_DEVTOOLS_EXTENSION__) deps.state.push("redux");
		if ((window as any).__RECOIL_DEVTOOLS_GLOBAL_HOOK__) deps.state.push("recoil");
		if ((window as any).__ZUSTAND_DEVTOOLS__) deps.state.push("zustand");

		// Detect routing
		if (this.metrics.framework.name === "Next.js") {
			deps.routing.push("next-router");
		} else if ((window as any).ReactRouter) {
			deps.routing.push("react-router");
		}

		// Detect styling solutions
		if (document.querySelector("style[data-styled]")) deps.styling.push("styled-components");
		if (document.querySelector("style[data-emotion]")) deps.styling.push("emotion");
		if (this.hasTailwindClasses(classNames)) deps.styling.push("tailwind");

		return deps;
	}

	private hasTailwindClasses(classNames: Set<string>): boolean {
		const tailwindPatterns = ["flex", "grid", "px-", "py-", "mx-", "my-", "bg-", "text-"];
		return tailwindPatterns.some((pattern) => Array.from(classNames).some((className) => className.startsWith(pattern)));
	}

	private detectFeatures(): ProjectMetrics["features"] {
		return {
			ssr: this.detectSSR(),
			pwa: this.detectPWA(),
			webgl: this.detectWebGL(),
			localStorage: this.detectLocalStorage(),
			serviceWorker: this.detectServiceWorker(),
			api: {
				rest: this.detectRestAPI(),
				graphql: this.detectGraphQL(),
				websocket: this.detectWebSocket(),
			},
		};
	}

	private detectSSR(): boolean {
		return !!(document.getElementById("__NEXT_DATA__") || document.getElementById("__NUXT__") || document.querySelector("[data-server-rendered]"));
	}

	private detectPWA(): boolean {
		return !!(document.querySelector('link[rel="manifest"]') && navigator.serviceWorker);
	}

	private detectWebGL(): boolean {
		try {
			const canvas = document.createElement("canvas");
			return !!(canvas.getContext("webgl") || canvas.getContext("experimental-webgl"));
		} catch {
			return false;
		}
	}

	private detectLocalStorage(): boolean {
		try {
			return !!window.localStorage;
		} catch {
			return false;
		}
	}

	private detectServiceWorker(): boolean {
		return "serviceWorker" in navigator;
	}

	private detectRestAPI(): boolean {
		return !!(document.querySelector('script[src*="/api/"]') || document.querySelector('link[href*="/api/"]'));
	}

	private detectGraphQL(): boolean {
		return !!((window as any).__APOLLO_CLIENT__ || document.querySelector('script[src*="graphql"]'));
	}

	private detectWebSocket(): boolean {
		return "WebSocket" in window;
	}

	private detectRepository(): ProjectMetrics["repository"] {
		const repoInfo: ProjectMetrics["repository"] = {
			type: "unknown",
		};

		try {
			// Check for monorepo configurations
			if (this.detectTurboRepo()) {
				repoInfo.type = "monorepo";
				repoInfo.manager = "turbo";
			} else if (this.detectNxRepo()) {
				repoInfo.type = "monorepo";
				repoInfo.manager = "nx";
			} else if (this.detectLernaRepo()) {
				repoInfo.type = "monorepo";
				repoInfo.manager = "lerna";
			}
		} catch (error) {
			console.warn("Error detecting repository type:", error);
		}

		return repoInfo;
	}

	private detectTurboRepo(): boolean {
		return !!(document.querySelector('meta[name="turbo-cache"]') || (window as any).__TURBO_DATA__);
	}

	private detectNxRepo(): boolean {
		return !!(document.querySelector('meta[name="nx-workspace"]') || (window as any).__NX_WORKSPACE__);
	}

	private detectLernaRepo(): boolean {
		return !!document.querySelector('meta[name="lerna-workspace"]');
	}

	private getMainFeatures(): string[] {
		const features: string[] = [];

		if (this.metrics.features.ssr) features.push("SSR");
		if (this.metrics.features.pwa) features.push("PWA");
		if (this.metrics.features.webgl) features.push("WebGL");
		if (this.metrics.features.api.graphql) features.push("GraphQL");

		return features;
	}

	private getEnvironmentSummary(): string {
		return `${this.metrics.environment.platform} | ${this.metrics.buildSystem.type}`;
	}

	cleanup(): void {
		// No cleanup needed for project tracker
	}

	private detectBuildSystem(): ProjectMetrics["buildSystem"] {
		const buildSystem: ProjectMetrics["buildSystem"] = {
			type: "unknown",
			features: [],
		};

		try {
			// Check for build system indicators
			if (document.querySelector('script[src*="webpack"]')) {
				buildSystem.type = "webpack";
				buildSystem.features.push("code-splitting", "hot-reload");
			} else if (document.querySelector('script[type="module"][src*="vite"]')) {
				buildSystem.type = "vite";
				buildSystem.features.push("esm", "hot-reload");
			} else if (document.querySelector('script[src*="parcel"]')) {
				buildSystem.type = "parcel";
				buildSystem.features.push("zero-config");
			}

			// Check for build optimizations
			if (document.querySelector('link[rel="modulepreload"]')) {
				buildSystem.features.push("module-preload");
			}
			if (document.querySelector('link[rel="preload"][as="script"]')) {
				buildSystem.features.push("script-preload");
			}
			if (document.querySelector('script[type="module"]')) {
				buildSystem.features.push("esm-support");
			}
		} catch (error) {
			console.warn("Error detecting build system:", error);
		}

		return buildSystem;
	}
}
