import 'package:flutter/material.dart';

import '../services/theme_mode_controller.dart';

class ThemeModeAction extends StatelessWidget {
  const ThemeModeAction({super.key});

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<ThemeMode>(
      valueListenable: ThemeModeController.mode,
      builder: (context, mode, _) {
        final isDark = mode == ThemeMode.dark;
        return IconButton(
          tooltip: isDark ? 'Switch to light mode' : 'Switch to dark mode',
          icon: Icon(isDark ? Icons.light_mode : Icons.dark_mode),
          onPressed: () => ThemeModeController.toggle(),
        );
      },
    );
  }
}
