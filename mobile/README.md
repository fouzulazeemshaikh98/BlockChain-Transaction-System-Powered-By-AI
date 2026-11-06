# AI Block System – Flutter Android client

Sign in, send a risk-gated transfer (`POST /api/transfers`) and see the
settlement history. The app only holds the JWT the backend issues; it stores
no blockchain keys.

## First-time setup

The Android platform folder isn't committed. Generate it once, inside this
folder (this keeps `lib/` and `pubspec.yaml`):

```bash
cd mobile
flutter create . --platforms=android --project-name ai_block_mobile
flutter pub get
```

The backend runs over plain `http` in development. Debug builds allow that.
For a release build against a non-HTTPS backend, add
`android:usesCleartextTraffic="true"` to the `<application>` tag in
`android/app/src/main/AndroidManifest.xml`. Also make sure
`<uses-permission android:name="android.permission.INTERNET"/>` is present.

## Run

Start the backend first (see the root README), then:

```bash
# Android emulator: 10.0.2.2 is the host machine's localhost (default)
flutter run

# Physical device on the same Wi-Fi: use your PC's LAN IP
flutter run --dart-define=API_BASE_URL=http://192.168.x.x:5199
```

A physical device also needs the backend listening on all interfaces, e.g.
`dotnet run --urls http://0.0.0.0:5199`.

Demo login: `admin@aiblocksystem.local` / `admin123`, transfer PIN `1234`.
