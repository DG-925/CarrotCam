import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:ota_update/ota_update.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:url_launcher/url_launcher.dart';

import 'protocol.dart';

class UpdateInfo {
  UpdateInfo({required this.version, required this.notes, required this.apkUrl, required this.pageUrl});
  final String version;
  final String notes;
  final String? apkUrl;
  final String pageUrl;
}

/// Self updates from GitHub Releases.
/// Android downloads and installs the APK in-app; iOS opens the release page.
class Updater extends ChangeNotifier {
  UpdateInfo? available;
  String current = '';
  double? progress;
  String? error;
  bool checking = false;

  static int _cmp(String a, String b) {
    List<int> parts(String v) =>
        v.replaceFirst(RegExp(r'^v'), '').split(RegExp(r'[.+-]')).take(3).map((p) => int.tryParse(p) ?? 0).toList();
    final pa = parts(a), pb = parts(b);
    for (var i = 0; i < 3; i++) {
      final x = i < pa.length ? pa[i] : 0;
      final y = i < pb.length ? pb[i] : 0;
      if (x != y) return x.compareTo(y);
    }
    return 0;
  }

  Future<UpdateInfo?> check() async {
    checking = true;
    error = null;
    notifyListeners();
    try {
      current = (await PackageInfo.fromPlatform()).version;
      final res = await http
          .get(Uri.parse('https://api.github.com/repos/$kGithubRepo/releases/latest'),
              headers: {'Accept': 'application/vnd.github+json'})
          .timeout(const Duration(seconds: 12));
      if (res.statusCode != 200) {
        available = null;
        return null;
      }
      final j = jsonDecode(res.body) as Map<String, dynamic>;
      final tag = (j['tag_name'] ?? '') as String;
      String? apk;
      for (final a in (j['assets'] as List? ?? const [])) {
        final name = (a['name'] ?? '') as String;
        if (name.toLowerCase().endsWith('.apk')) apk = a['browser_download_url'] as String?;
      }
      available = _cmp(tag, current) > 0
          ? UpdateInfo(version: tag.replaceFirst('v', ''), notes: (j['body'] ?? '') as String, apkUrl: apk, pageUrl: j['html_url'] as String)
          : null;
      return available;
    } catch (e) {
      error = e.toString();
      return null;
    } finally {
      checking = false;
      notifyListeners();
    }
  }

  Future<void> install() async {
    final u = available;
    if (u == null) return;
    if (!Platform.isAndroid || u.apkUrl == null) {
      await launchUrl(Uri.parse(u.pageUrl), mode: LaunchMode.externalApplication);
      return;
    }
    progress = 0;
    error = null;
    notifyListeners();
    try {
      OtaUpdate().execute(u.apkUrl!, destinationFilename: 'carrotcam-update.apk').listen(
        (OtaEvent e) {
          switch (e.status) {
            case OtaStatus.DOWNLOADING:
              progress = (double.tryParse(e.value ?? '') ?? 0) / 100;
            case OtaStatus.INSTALLING:
            case OtaStatus.INSTALLATION_DONE:
              progress = 1;
            case OtaStatus.CANCELED:
              progress = null;
            default:
              progress = null;
              error = 'Update failed (${e.status.name})${e.value != null ? ': ${e.value}' : ''}';
          }
          notifyListeners();
        },
        onError: (Object err) {
          progress = null;
          error = err.toString();
          notifyListeners();
        },
      );
    } catch (e) {
      progress = null;
      error = e.toString();
      notifyListeners();
    }
  }
}
