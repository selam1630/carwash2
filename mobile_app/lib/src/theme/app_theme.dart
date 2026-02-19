import 'package:flutter/material.dart';

class AppTheme {
  static const Color brandNavy = Color(0xFF111E53);
  static const Color brandCyan = Color(0xFF1BBDEB);
  static const Color brandLight = Color(0xFFF4F8FF);
  static const Color brandText = Color(0xFF162247);

  static ThemeData get light {
    final scheme = ColorScheme.fromSeed(
      seedColor: brandCyan,
      brightness: Brightness.light,
      primary: brandNavy,
      secondary: brandCyan,
      surface: Colors.white,
      background: brandLight,
    );

    return ThemeData(
      useMaterial3: true,
      colorScheme: scheme,
      scaffoldBackgroundColor: brandLight,
      appBarTheme: const AppBarTheme(
        backgroundColor: brandNavy,
        foregroundColor: Colors.white,
        centerTitle: true,
        elevation: 0,
      ),
      cardTheme: CardTheme(
        color: Colors.white,
        elevation: 1,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: Colors.white,
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: Color(0xFFD6DEF0)),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: Color(0xFFD6DEF0)),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: brandCyan, width: 1.4),
        ),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: brandNavy,
          foregroundColor: Colors.white,
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          foregroundColor: brandNavy,
        ),
      ),
      chipTheme: ChipThemeData(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
        side: const BorderSide(color: Color(0xFFD6DEF0)),
        backgroundColor: Colors.white,
        selectedColor: brandCyan.withOpacity(0.15),
        labelStyle: const TextStyle(color: brandText),
      ),
      snackBarTheme: SnackBarThemeData(
        backgroundColor: brandNavy,
        contentTextStyle: const TextStyle(color: Colors.white),
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
    );
  }
}
