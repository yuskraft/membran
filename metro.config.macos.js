/**
 * Metro configuration for macOS.
 * react-native-macos uses a separate Metro config so it can resolve
 * the macOS platform overrides (*.macos.tsx / *.macos.ts files).
 *
 * Run the macOS bundler with:
 *   npm run start:macos   (port 8082, separate from the iOS/Android bundler)
 */

const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');

const defaultConfig = getDefaultConfig(__dirname);

const config = {
  resolver: {
    // Allow Metro to resolve macOS-specific platform files
    platforms: [...(defaultConfig.resolver?.platforms ?? []), 'macos'],
  },
};

module.exports = mergeConfig(defaultConfig, config);
