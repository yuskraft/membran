const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');

/**
 * Metro configuration.
 * The 'macos' entry in platforms lets Metro resolve *.macos.tsx files
 * regardless of which port the bundler is started on.
 * https://reactnative.dev/docs/metro
 */
const defaultConfig = getDefaultConfig(__dirname);

const config = {
  resolver: {
    platforms: [...(defaultConfig.resolver?.platforms ?? []), 'macos'],
  },
};

module.exports = mergeConfig(defaultConfig, config);
