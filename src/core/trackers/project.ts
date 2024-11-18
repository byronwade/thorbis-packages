import { BaseTracker } from './base';

interface PackageInfo {
  name: string;
  version: string;
  description?: string;
  author?: string;
  license?: string;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  scripts: Record<string, string>;
}

interface FrameworkInfo {
  name: string;
  version: string;
  type: 'react' | 'next' | 'vue' | 'angular' | 'svelte' | 'other';
  features: string[];
}

interface ProjectMetrics {
  framework: FrameworkInfo;
  package: PackageInfo;
  environment: {
    nodeVersion: string;
    npmVersion: string;
    platform: string;
    arch: string;
  };
  build: {
    bundler: string;
    transpiler: string;
    cssProcessor?: string;
    optimization: {
      treeshaking: boolean;
      minification: boolean;
      splitting: boolean;
    };
  };
  dependencies: {
    total: number;
    direct: number;
    dev: number;
    types: number;
    outdated: number;
    security: {
      high: number;
      medium: number;
      low: number;
    };
  };
  features: {
    typescript: boolean;
    testing: boolean;
    storybook: boolean;
    i18n: boolean;
    pwa: boolean;
    ssg: boolean;
    ssr: boolean;
    analytics: boolean;
    seo: boolean;
  };
  performance: {
    buildTime: number;
    bundleSize: {
      total: number;
      js: number;
      css: number;
      assets: number;
    };
    treeshakability: number;
  };
}

export class ProjectTracker extends BaseTracker {
  private metrics: ProjectMetrics;

  constructor(analytics: any) {
    super(analytics, true);
    this.metrics = this.initializeMetrics();
  }

  async init(): Promise<void> {
    try {
      console.group('🔧 Project Analysis');
      console.log('Starting project analysis...');

      await this.analyzeProject();

      // Force immediate analysis and logging
      const packageJson = await this.getPackageJson();

      console.group('📦 Package Info');
      console.table({
        Name: packageJson.name || 'N/A',
        Version: packageJson.version || 'N/A',
        Description: packageJson.description || 'N/A',
        Author: packageJson.author || 'N/A',
        License: packageJson.license || 'N/A',
      });
      console.groupEnd();

      console.group('🛠 Framework Details');
      console.table({
        Name: this.metrics.framework.name || 'N/A',
        Version: this.metrics.framework.version || 'N/A',
        Type: this.metrics.framework.type || 'N/A',
        Features: this.metrics.framework.features.join(', ') || 'N/A',
      });
      console.groupEnd();

      console.group('📚 Dependencies');
      console.table({
        'Total Dependencies': this.metrics.dependencies.total,
        'Direct Dependencies': this.metrics.dependencies.direct,
        'Dev Dependencies': this.metrics.dependencies.dev,
        'Type Definitions': this.metrics.dependencies.types,
      });
      console.groupEnd();

      console.group('🏗 Build Configuration');
      console.table({
        Bundler: this.metrics.build.bundler || 'N/A',
        Transpiler: this.metrics.build.transpiler || 'N/A',
        'CSS Processor': this.metrics.build.cssProcessor || 'N/A',
      });
      console.groupEnd();

      console.group('✨ Features');
      console.table(
        Object.entries(this.metrics.features).map(([feature, enabled]) => ({
          Feature: feature,
          Status: enabled ? '✅ Enabled' : '❌ Disabled',
        }))
      );
      console.groupEnd();

      // Track the complete metrics
      this.analytics.track('projectMetrics', {
        ...this.metrics,
        timestamp: new Date().toISOString(),
      });

      console.groupEnd(); // End Project Analysis
    } catch (error) {
      console.error('❌ Error analyzing project:', error);
    }
  }

  private async analyzeProject(): Promise<void> {
    try {
      // Analyze package.json
      const packageJson = await this.getPackageJson();
      this.metrics.package = this.analyzePackageJson(packageJson);

      // Detect framework
      this.metrics.framework = this.detectFramework(packageJson);

      // Analyze dependencies
      this.metrics.dependencies = this.analyzeDependencies(packageJson);

      // Detect features
      this.metrics.features = this.detectFeatures(packageJson);

      // Analyze build configuration
      this.metrics.build = this.analyzeBuildConfig(packageJson);

      // Get environment info
      this.metrics.environment = this.getEnvironmentInfo();

      // Analyze performance metrics
      this.metrics.performance = await this.analyzePerformance();

      // Log the analysis results
      this.logAnalysisResults();
    } catch (error) {
      console.error('Error in project analysis:', error);
      throw error;
    }
  }

  private logAnalysisResults(): void {
    console.group('📊 Project Analysis Results');

    console.group('📦 Package Info');
    console.table(this.metrics.package);
    console.groupEnd();

    console.group('🛠 Framework Details');
    console.table(this.metrics.framework);
    console.groupEnd();

    console.group('📚 Dependencies');
    console.table(this.metrics.dependencies);
    console.groupEnd();

    console.group('⚡ Performance');
    console.table(this.metrics.performance);
    console.groupEnd();

    console.group('✨ Features');
    console.table(
      Object.entries(this.metrics.features).map(([feature, enabled]) => ({
        Feature: feature,
        Status: enabled ? '✅ Enabled' : '❌ Disabled',
      }))
    );
    console.groupEnd();

    console.groupEnd(); // End Project Analysis Results
  }

  private async getPackageJson(): Promise<any> {
    try {
      return await import('../../../package.json');
    } catch (error) {
      this.log('Error loading package.json:', error);
      return {};
    }
  }

  private analyzePackageJson(packageJson: any): PackageInfo {
    return {
      name: packageJson.name || '',
      version: packageJson.version || '',
      description: packageJson.description,
      author: packageJson.author,
      license: packageJson.license,
      dependencies: packageJson.dependencies || {},
      devDependencies: packageJson.devDependencies || {},
      scripts: packageJson.scripts || {},
    };
  }

  private detectFramework(packageJson: any): FrameworkInfo {
    const deps = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
    };
    const features: string[] = [];

    if (deps.next) {
      features.push('app-router', 'server-components');
      return { name: 'Next.js', version: deps.next, type: 'next', features };
    }
    if (deps.react)
      return { name: 'React', version: deps.react, type: 'react', features };
    if (deps.vue)
      return { name: 'Vue', version: deps.vue, type: 'vue', features };
    if (deps.angular)
      return {
        name: 'Angular',
        version: deps.angular,
        type: 'angular',
        features,
      };
    if (deps.svelte)
      return { name: 'Svelte', version: deps.svelte, type: 'svelte', features };

    return { name: 'Unknown', version: '0.0.0', type: 'other', features: [] };
  }

  private analyzeDependencies(
    packageJson: any
  ): ProjectMetrics['dependencies'] {
    const deps = packageJson.dependencies || {};
    const devDeps = packageJson.devDependencies || {};

    return {
      total: Object.keys(deps).length + Object.keys(devDeps).length,
      direct: Object.keys(deps).length,
      dev: Object.keys(devDeps).length,
      types: Object.keys(devDeps).filter((dep) => dep.startsWith('@types/'))
        .length,
      outdated: 0, // Would need npm outdated check
      security: {
        high: 0,
        medium: 0,
        low: 0,
      },
    };
  }

  private detectFeatures(packageJson: any): ProjectMetrics['features'] {
    const allDeps = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
    };

    return {
      typescript: !!allDeps.typescript || !!packageJson.types,
      testing: !!(
        allDeps.jest ||
        allDeps.vitest ||
        allDeps['@testing-library/react']
      ),
      storybook: !!allDeps['@storybook/react'],
      i18n: !!(
        allDeps.i18next ||
        allDeps['next-i18next'] ||
        allDeps['vue-i18n']
      ),
      pwa: !!(allDeps['next-pwa'] || allDeps.workbox),
      ssg: !!(allDeps.gatsby || packageJson?.scripts?.['generate']),
      ssr: !!(allDeps.next || packageJson?.scripts?.['ssr']),
      analytics: !!(allDeps.analytics || allDeps['@segment/analytics-next']),
      seo: !!(allDeps.next || allDeps['react-helmet'] || allDeps['next-seo']),
    };
  }

  private analyzeBuildConfig(packageJson: any): ProjectMetrics['build'] {
    const allDeps = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
    };

    return {
      bundler: this.detectBundler(allDeps),
      transpiler: this.detectTranspiler(allDeps),
      cssProcessor: this.detectCssProcessor(allDeps),
      optimization: {
        treeshaking: true, // Modern bundlers have this by default
        minification: true,
        splitting: true,
      },
    };
  }

  private detectBundler(deps: Record<string, string>): string {
    if (deps.webpack) return 'webpack';
    if (deps.vite) return 'vite';
    if (deps.rollup) return 'rollup';
    if (deps.parcel) return 'parcel';
    if (deps.esbuild) return 'esbuild';
    return 'unknown';
  }

  private detectTranspiler(deps: Record<string, string>): string {
    if (deps['@babel/core']) return 'babel';
    if (deps.typescript) return 'typescript';
    if (deps.swc) return 'swc';
    return 'unknown';
  }

  private detectCssProcessor(deps: Record<string, string>): string | undefined {
    if (deps.sass) return 'sass';
    if (deps.less) return 'less';
    if (deps.stylus) return 'stylus';
    if (deps.tailwindcss) return 'tailwind';
    return undefined;
  }

  private getEnvironmentInfo(): ProjectMetrics['environment'] {
    return {
      nodeVersion: process.version,
      npmVersion: process.env.npm_version || '',
      platform: process.platform,
      arch: process.arch,
    };
  }

  private async analyzePerformance(): Promise<ProjectMetrics['performance']> {
    return {
      buildTime: 0, // Would need build hooks
      bundleSize: {
        total: 0,
        js: 0,
        css: 0,
        assets: 0,
      },
      treeshakability: 0,
    };
  }

  private initializeMetrics(): ProjectMetrics {
    return {
      framework: {
        name: '',
        version: '',
        type: 'other',
        features: [],
      },
      package: {
        name: '',
        version: '',
        dependencies: {},
        devDependencies: {},
        scripts: {},
      },
      environment: {
        nodeVersion: '',
        npmVersion: '',
        platform: '',
        arch: '',
      },
      build: {
        bundler: '',
        transpiler: '',
        optimization: {
          treeshaking: false,
          minification: false,
          splitting: false,
        },
      },
      dependencies: {
        total: 0,
        direct: 0,
        dev: 0,
        types: 0,
        outdated: 0,
        security: {
          high: 0,
          medium: 0,
          low: 0,
        },
      },
      features: {
        typescript: false,
        testing: false,
        storybook: false,
        i18n: false,
        pwa: false,
        ssg: false,
        ssr: false,
        analytics: false,
        seo: false,
      },
      performance: {
        buildTime: 0,
        bundleSize: {
          total: 0,
          js: 0,
          css: 0,
          assets: 0,
        },
        treeshakability: 0,
      },
    };
  }

  cleanup(): void {
    // No cleanup needed for project analysis
  }
}
