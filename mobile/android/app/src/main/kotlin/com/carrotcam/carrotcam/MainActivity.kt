package com.carrotcam.carrotcam

import android.content.Intent
import android.provider.Settings
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {
    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "carrotcam/system").setMethodCallHandler { call, result ->
            when (call.method) {
                "openTetherSettings" -> result.success(openTetherSettings())
                else -> result.notImplemented()
            }
        }
    }

    /** USB tethering lives on the "Hotspot & tethering" screen, which has no public intent. */
    private fun openTetherSettings(): Boolean {
        val candidates = listOf(
            Intent().setClassName("com.android.settings", "com.android.settings.TetherSettings"),
            Intent().setClassName("com.android.settings", "com.android.settings.Settings\$TetherSettingsActivity"),
            Intent(Settings.ACTION_WIRELESS_SETTINGS),
            Intent(Settings.ACTION_SETTINGS),
        )
        for (intent in candidates) {
            try {
                startActivity(intent)
                return true
            } catch (e: Exception) {
                // not available on this device, try the next one
            }
        }
        return false
    }
}
