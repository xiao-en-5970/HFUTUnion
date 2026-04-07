const path = require('path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * react-native-reanimated exports `from './jestUtils'` but ships a `jestUtils/` directory
 * (index), not `jestUtils.ts`. Metro resolves the bare specifier to a non-existent
 * `jestUtils.ts` first → ENOENT. Point to the real entry.
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = {
  resolver: {
    resolveRequest(context, moduleName, platform) {
      if (moduleName === './jestUtils') {
        const origin = context.originModulePath?.replace(/\\/g, '/') ?? '';
        if (origin.includes('react-native-reanimated/src/index.')) {
          return {
            type: 'sourceFile',
            filePath: path.resolve(
              __dirname,
              'node_modules/react-native-reanimated/src/jestUtils/index.ts',
            ),
          };
        }
        if (origin.includes('react-native-reanimated/lib/module/index.js')) {
          return {
            type: 'sourceFile',
            filePath: path.resolve(
              __dirname,
              'node_modules/react-native-reanimated/lib/module/jestUtils/index.js',
            ),
          };
        }
      }
      return context.resolveRequest(context, moduleName, platform);
    },
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
