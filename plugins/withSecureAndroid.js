const fs = require('fs');
const path = require('path');

const {
  AndroidConfig,
  createRunOncePlugin,
  withAndroidManifest,
  withDangerousMod,
  withMainActivity,
} = require('@expo/config-plugins');

const pkg = require('../package.json');

/**
 * Durcissement Android pour une application de données de santé :
 * - pas de permission « dessiner par-dessus » (tapjacking) ;
 * - sauvegarde désactivée ;
 * - touches ignorées si une autre fenêtre les recouvre ;
 * - FLAG_SECURE pour interdire captures et vignette multitâche.
 */
function withSecureAndroid(config) {
  config = withAndroidManifest(config, async (config) => {
    const manifest = config.modResults.manifest;
    manifest['uses-permission'] = (manifest['uses-permission'] ?? []).filter(
      (permission) => permission.$?.['android:name'] !== 'android.permission.SYSTEM_ALERT_WINDOW',
    );

    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(config.modResults);
    application.$['android:allowBackup'] = 'false';

    const activity = AndroidConfig.Manifest.getMainActivityOrThrow(config.modResults);
    activity.$['android:filterTouchesWhenObscured'] = 'true';

    return config;
  });

  config = withMainActivity(config, async (config) => {
    let source = config.modResults.contents;
    if (!source.includes('WindowManager.LayoutParams.FLAG_SECURE')) {
      if (!source.includes('import android.view.WindowManager')) {
        source = source.replace(
          'import android.os.Bundle',
          'import android.os.Bundle\nimport android.view.WindowManager',
        );
      }
      source = source.replace(
        'super.onCreate(null)',
        'super.onCreate(null)\n    window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)',
      );
    }
    config.modResults.contents = source;
    return config;
  });

  // Le template Expo réintroduit SYSTEM_ALERT_WINDOW dans les source-sets debug.
  // On le retire aussi, pour que les builds development ne soient pas exposés au tapjacking.
  config = withDangerousMod(config, [
    'android',
    async (config) => {
      for (const variant of ['debug', 'debugOptimized']) {
        const manifestPath = path.join(
          config.modRequest.projectRoot,
          'android/app/src',
          variant,
          'AndroidManifest.xml',
        );
        if (!fs.existsSync(manifestPath)) {
          continue;
        }
        const modResult = await AndroidConfig.Manifest.readAndroidManifestAsync(manifestPath);
        modResult.manifest['uses-permission'] = (modResult.manifest['uses-permission'] ?? []).filter(
          (permission) => permission.$?.['android:name'] !== 'android.permission.SYSTEM_ALERT_WINDOW',
        );
        await AndroidConfig.Manifest.writeAndroidManifestAsync(manifestPath, modResult);
      }
      return config;
    },
  ]);

  return config;
}

module.exports = createRunOncePlugin(withSecureAndroid, pkg.name, pkg.version);
