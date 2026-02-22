# Mobile App (Flutter)

This folder contains a minimal scaffold for the Car Wash mobile app.

Quick start

1. Install Flutter SDK: https://flutter.dev/docs/get-started/install
2. From this folder run:

```bash
flutter pub get
flutter run
```

Environment

- Create a `.env` file in `mobile_app` with:

```
FLUTTER_API_BASE_URL=http://localhost:3000
FLUTTER_GEBETA_API_TOKEN=your_gebeta_token_here
# Optional overrides (only set these if your Gebeta account has tile access):
# FLUTTER_GEBETA_TILE_URL_TEMPLATE=...
# FLUTTER_GEBETA_TILE_LIGHT_SOFT_URL_TEMPLATE=...
# FLUTTER_GEBETA_TILE_DARK_URL_TEMPLATE=...
```

What I scaffolded

- `lib/main.dart` — app entry
- `lib/src/app.dart` — top-level MaterialApp
- `lib/src/api/api_client.dart` — base Dio client with auth interceptor stub
- `lib/src/screens/login_screen.dart` — phone input and send OTP stub
- `lib/src/screens/otp_verification_screen.dart` — OTP verification stub
- `lib/src/screens/plans_list_screen.dart` — plans UI stub

Next steps

- Implement API calls in `ApiClient` using endpoints from the backend
- Wire OTP flow to store access & refresh tokens using `flutter_secure_storage`
- Add navigation and state management (Riverpod) for auth state
