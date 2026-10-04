import 'package:flutter/material.dart';

/// CarrotCam brand colors.
class CC {
  static const orange = Color(0xFFFF7A1A);
  static const orangeDeep = Color(0xFFFF4D2E);
  static const orangeLight = Color(0xFFFFA24A);
  static const green = Color(0xFF22C55E);
  static const red = Color(0xFFEF4444);

  static const gradient = LinearGradient(
    colors: [Color(0xFFFF9A3D), Color(0xFFFF6A1A), Color(0xFFFF4D2E)],
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
  );
}

ThemeData buildTheme(Brightness brightness) {
  final dark = brightness == Brightness.dark;
  final bg = dark ? const Color(0xFF0E0D0C) : const Color(0xFFF6F3EF);
  final surface = dark ? const Color(0xFF171513) : Colors.white;
  final surface2 = dark ? const Color(0xFF1F1C1A) : const Color(0xFFF1ECE6);
  final text = dark ? const Color(0xFFF5F1EC) : const Color(0xFF1D1A17);
  final muted = dark ? const Color(0xFF8F867E) : const Color(0xFF8A8077);

  final scheme = ColorScheme.fromSeed(
    seedColor: CC.orange,
    brightness: brightness,
    primary: CC.orange,
    onPrimary: Colors.white,
    surface: surface,
    onSurface: text,
  ).copyWith(
    surfaceContainerHighest: surface2,
    surfaceContainerHigh: surface2,
    surfaceContainer: surface,
    outline: muted,
    outlineVariant: dark ? Colors.white12 : Colors.black12,
  );

  final base = ThemeData(useMaterial3: true, colorScheme: scheme, brightness: brightness);
  return base.copyWith(
    scaffoldBackgroundColor: bg,
    canvasColor: bg,
    textTheme: base.textTheme.apply(bodyColor: text, displayColor: text),
    appBarTheme: AppBarTheme(
      backgroundColor: bg,
      foregroundColor: text,
      elevation: 0,
      scrolledUnderElevation: 0,
      centerTitle: false,
      titleTextStyle: TextStyle(color: text, fontSize: 22, fontWeight: FontWeight.w800, letterSpacing: -0.3),
    ),
    cardTheme: CardThemeData(
      color: surface,
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(22),
        side: BorderSide(color: dark ? Colors.white10 : Colors.black.withValues(alpha: 0.06)),
      ),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: CC.orange,
        foregroundColor: Colors.white,
        minimumSize: const Size(0, 52),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        textStyle: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: text,
        minimumSize: const Size(0, 52),
        side: BorderSide(color: dark ? Colors.white24 : Colors.black26),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        textStyle: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: surface2,
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(16), borderSide: BorderSide.none),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(16),
        borderSide: const BorderSide(color: CC.orange, width: 2),
      ),
    ),
    snackBarTheme: SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      backgroundColor: dark ? const Color(0xFF26221F) : const Color(0xFF1D1A17),
      contentTextStyle: const TextStyle(color: Colors.white),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
    ),
    bottomSheetTheme: BottomSheetThemeData(
      backgroundColor: surface,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(28))),
      showDragHandle: true,
    ),
    sliderTheme: base.sliderTheme.copyWith(
      activeTrackColor: CC.orange,
      thumbColor: Colors.white,
      inactiveTrackColor: dark ? Colors.white12 : Colors.black12,
      overlayColor: CC.orange.withValues(alpha: 0.15),
    ),
    switchTheme: SwitchThemeData(
      thumbColor: WidgetStateProperty.all(Colors.white),
      trackColor: WidgetStateProperty.resolveWith((s) => s.contains(WidgetState.selected) ? CC.orange : surface2),
      trackOutlineColor: WidgetStateProperty.all(Colors.transparent),
    ),
  );
}
