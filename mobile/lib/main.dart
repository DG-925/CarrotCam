import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'screens/home_screen.dart';
import 'services/discovery.dart';
import 'services/link.dart';
import 'services/settings.dart';
import 'services/updater.dart';
import 'theme.dart';

late final AppSettings settings;
late final Discovery discovery;
late final Updater updater;
late final CarrotLink link;

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  settings = await AppSettings.load();
  discovery = Discovery();
  updater = Updater();
  link = CarrotLink(settings);
  SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
  runApp(const CarrotCamApp());
  if (settings.autoUpdate) updater.check();
}

class CarrotCamApp extends StatelessWidget {
  const CarrotCamApp({super.key});

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: settings,
      builder: (context, _) => MaterialApp(
        title: 'CarrotCam',
        debugShowCheckedModeBanner: false,
        theme: buildTheme(Brightness.light),
        darkTheme: buildTheme(Brightness.dark),
        themeMode: settings.themeMode,
        themeAnimationDuration: const Duration(milliseconds: 350),
        home: const HomeScreen(),
      ),
    );
  }
}

/// Smooth fade + slide route used across the app.
Route<T> smoothRoute<T>(Widget page) => PageRouteBuilder<T>(
      transitionDuration: const Duration(milliseconds: 380),
      reverseTransitionDuration: const Duration(milliseconds: 300),
      pageBuilder: (_, _, _) => page,
      transitionsBuilder: (_, anim, _, child) {
        final curved = CurvedAnimation(parent: anim, curve: Curves.easeOutCubic);
        return FadeTransition(
          opacity: curved,
          child: SlideTransition(
            position: Tween(begin: const Offset(0, 0.04), end: Offset.zero).animate(curved),
            child: child,
          ),
        );
      },
    );

class CarrotLogo extends StatelessWidget {
  const CarrotLogo({super.key, this.size = 40});
  final double size;

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(size * 0.28),
      child: Image.asset('assets/logo.png', width: size, height: size, filterQuality: FilterQuality.medium),
    );
  }
}
