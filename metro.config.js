const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

// Production web tree shaking (with EXPO_UNSTABLE_TREE_SHAKING=1): unused exports are dropped.
config.transformer.getTransformOptions = async () => ({
  transform: { experimentalImportSupport: true, inlineRequires: true },
});

module.exports = withNativeWind(config, { input: './global.css' });
