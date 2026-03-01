/**
 * Metro configuration for macOS bundler (port 8082).
 * Re-exports the shared config, which already includes the 'macos' platform
 * resolver. Use this file explicitly if you need macos-only Metro overrides
 * in the future.
 *
 *   npm run start:macos
 */

module.exports = require('./metro.config');
