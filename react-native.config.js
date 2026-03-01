/**
 * React Native configuration.
 * Registers the macOS out-of-tree platform so the CLI knows how to
 * build/run with `react-native run-macos`.
 */
module.exports = {
  platforms: {
    macos: {
      linkConfig: () => null,
      projectConfig: (projectRoot, userConfig) => {
        // Resolved by react-native-macos at build time
        return null;
      },
      dependencyConfig: (packageRoot, userConfig) => {
        return null;
      },
    },
  },
};
