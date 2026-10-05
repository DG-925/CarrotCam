import 'package:flutter/material.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:url_launcher/url_launcher.dart';

import '../main.dart';
import '../services/protocol.dart';
import '../theme.dart';

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  String _version = '';

  @override
  void initState() {
    super.initState();
    PackageInfo.fromPlatform().then((p) => setState(() => _version = p.version));
  }

  Future<void> _rename() async {
    final ctrl = TextEditingController(text: settings.deviceName);
    final v = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Phone name'),
        content: TextField(controller: ctrl, autofocus: true, maxLength: 40),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          TextButton(onPressed: () => Navigator.pop(ctx, ctrl.text), child: const Text('Save')),
        ],
      ),
    );
    if (v != null) settings.setDeviceName(v);
  }

  @override
  Widget build(BuildContext context) {
    Widget header(String t) => SectionLabel(t, padding: const EdgeInsets.fromLTRB(20, 22, 20, 8));
    Widget group(List<Widget> children) => Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: Card(child: Column(children: children)),
        );

    return Scaffold(
      appBar: AppBar(title: const Text('Settings')),
      body: ListenableBuilder(
        listenable: Listenable.merge([settings, updater]),
        builder: (context, _) => ListView(
          padding: const EdgeInsets.only(bottom: 40),
          children: [
            header('Appearance'),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: SegmentedButton<ThemeMode>(
                showSelectedIcon: false,
                segments: const [
                  ButtonSegment(value: ThemeMode.system, label: Text('System'), icon: Icon(Icons.brightness_auto_rounded)),
                  ButtonSegment(value: ThemeMode.light, label: Text('Light'), icon: Icon(Icons.light_mode_rounded)),
                  ButtonSegment(value: ThemeMode.dark, label: Text('Dark'), icon: Icon(Icons.dark_mode_rounded)),
                ],
                selected: {settings.themeMode},
                onSelectionChanged: (s) => settings.setThemeMode(s.first),
              ),
            ),
            header('Phone'),
            group([
              ListTile(
                leading: const Icon(Icons.smartphone_rounded, color: CC.orange),
                title: const Text('Phone name'),
                subtitle: Text(settings.deviceName),
                trailing: const Icon(Icons.edit_outlined),
                onTap: _rename,
              ),
              SwitchListTile(
                secondary: const Icon(Icons.link_rounded, color: CC.orange),
                title: const Text('Auto-connect'),
                subtitle: const Text('Reconnect to your last PC when it is found'),
                value: settings.autoConnect,
                onChanged: (v) => settings.setFlag('autoConnect', v),
              ),
              SwitchListTile(
                secondary: const Icon(Icons.screen_lock_portrait_rounded, color: CC.orange),
                title: const Text('Keep screen awake'),
                subtitle: const Text('Prevents the camera from stopping while streaming'),
                value: settings.keepAwake,
                onChanged: (v) => settings.setFlag('keepAwake', v),
              ),
              SwitchListTile(
                secondary: const Icon(Icons.nightlight_round, color: CC.orange),
                title: const Text('Black screen while live'),
                subtitle: const Text('Saves battery once streaming starts. Tap to wake.'),
                value: settings.stealthAfterConnect,
                onChanged: (v) => settings.setFlag('stealth', v),
              ),
            ]),
            header('Paired PCs'),
            group([
              if (settings.pcs.isEmpty)
                const ListTile(title: Text('No PCs paired yet')),
              for (final pc in settings.pcs.values)
                ListTile(
                  leading: const Icon(Icons.desktop_windows_rounded, color: CC.orange),
                  title: Text(pc.name),
                  subtitle: Text(pc.hosts.join(', ')),
                  trailing: IconButton(icon: const Icon(Icons.delete_outline), onPressed: () => settings.forgetPc(pc.id)),
                ),
            ]),
            header('Updates'),
            group([
              ListTile(
                leading: const Icon(Icons.system_update_rounded, color: CC.orange),
                title: Text(updater.available != null ? 'Version ${updater.available!.version} available' : 'CarrotCam $_version'),
                subtitle: Text(updater.checking
                    ? 'Checking…'
                    : updater.progress != null
                        ? 'Downloading ${(updater.progress! * 100).round()}%'
                        : updater.error ?? (updater.available == null ? 'Updates come from GitHub Releases' : 'Tap to install')),
                trailing: updater.available != null
                    ? FilledButton(style: FilledButton.styleFrom(minimumSize: const Size(0, 38)), onPressed: updater.install, child: const Text('Install'))
                    : TextButton(onPressed: updater.checking ? null : updater.check, child: const Text('Check')),
              ),
              SwitchListTile(
                secondary: const Icon(Icons.autorenew_rounded, color: CC.orange),
                title: const Text('Check automatically'),
                value: settings.autoUpdate,
                onChanged: (v) => settings.setFlag('autoUpdate', v),
              ),
            ]),
            header('About'),
            group([
              ListTile(
                leading: const CarrotLogo(size: 32),
                title: const Text('CarrotCam'),
                subtitle: Text('Version $_version · free and open source\nCarrot icon by Freepik from Flaticon'),
                isThreeLine: true,
              ),
              ListTile(
                leading: const Icon(Icons.open_in_new_rounded, color: CC.orange),
                title: const Text('GitHub & PC app download'),
                onTap: () => launchUrl(Uri.parse('https://github.com/$kGithubRepo/releases/latest'), mode: LaunchMode.externalApplication),
              ),
            ]),
          ],
        ),
      ),
    );
  }
}
