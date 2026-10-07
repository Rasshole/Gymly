const fs = require('fs');
const path = require('path');
const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * Development bundles may swap in gitignored local QA credentials.
 * Production bundling (NODE_ENV=production) always keeps the empty stub.
 *
 * @type {import('metro-config').MetroConfig}
 */
const localQaOverride = path.join(__dirname, 'src/config/supabaseLocalQa.local.ts');

const config = {
  resolver: {
    resolveRequest(context, moduleName, platform) {
      const normalized = String(moduleName).replace(/\\/g, '/');
      const isStub =
        normalized === '@/config/supabaseLocalQa' ||
        normalized.endsWith('/supabaseLocalQa') ||
        normalized.endsWith('/supabaseLocalQa.ts') ||
        normalized === './supabaseLocalQa' ||
        normalized === './supabaseLocalQa.ts';
      if (
        isStub &&
        process.env.NODE_ENV !== 'production' &&
        fs.existsSync(localQaOverride)
      ) {
        return {type: 'sourceFile', filePath: localQaOverride};
      }
      return context.resolveRequest(context, moduleName, platform);
    },
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);

