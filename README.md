# Thorbis Packages

A collection of tools and utilities for the Thorbis ecosystem, focusing on development optimization, analytics, and CMS integration.

## Packages

### @thorbis/events
Advanced analytics and event tracking system that provides:
- Real-time user behavior tracking
- Performance monitoring
- Error tracking
- Custom event tracking
- Integration with Thorbis Admin Panel

### @thorbis/cli
Command-line interface for Thorbis project management:
- Project scaffolding
- Development optimization
- Build configuration
- Analytics setup
- CMS integration

## Overview

Thorbis Packages is a suite of tools designed to:
1. Streamline development workflows
2. Provide advanced analytics
3. Optimize application performance
4. Integrate with Thorbis CMS
5. Sync with Thorbis Admin Panel

## Key Features

### Analytics & Tracking
- Advanced event tracking
- User behavior analysis
- Performance monitoring
- Error tracking
- Custom event support
- Real-time data sync

### Development Tools
- Project templates
- Build optimization
- Code splitting
- Resource management
- Performance suggestions

### CMS Integration
- Content performance tracking
- User engagement metrics
- A/B testing
- Optimization suggestions
- Real-time updates

### Admin Panel Integration
- Data synchronization
- Project configuration
- Analytics dashboard
- Performance monitoring
- User insights

## Getting Started

```bash
# Install the CLI
npm install -g @thorbis/cli

# Create a new project
thorbis create my-project

# Initialize analytics
thorbis analytics init

# Set up CMS integration
thorbis cms setup
```

## Package Usage

### Analytics Setup
```typescript
import { Thorbis } from '@thorbis/events';

// In your app
<Thorbis 
  config={{ 
    appId: 'my-app',
    adminSync: true 
  }} 
/>
```

### CLI Commands
```bash
# Create project
thorbis create [name]

# Initialize features
thorbis init [feature]

# Configure settings
thorbis config [setting]

# Run optimizations
thorbis optimize
```

## Development

```bash
# Install dependencies
npm install

# Build all packages
npm run build

# Run tests
npm test

# Run linting
npm run lint
```

## Documentation

- [CLI Documentation](packages/cli/README.md)
- [Events Documentation](packages/events/README.md)
- [API Reference](docs/API.md)
- [Contributing Guide](CONTRIBUTING.md)

## Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

## License

MIT License - see [LICENSE](LICENSE)

## Support

- Documentation: [docs.thorbis.com](https://docs.thorbis.com)
- Issues: [GitHub Issues](https://github.com/thorbis/issues)
- Discord: [Thorbis Community](https://discord.gg/thorbis)