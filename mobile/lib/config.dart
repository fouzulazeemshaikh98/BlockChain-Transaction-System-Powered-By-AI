/// Backend base URL. Override at build/run time:
///   flutter run --dart-define=API_BASE_URL=http://192.168.1.20:5199
/// The default reaches the host machine's localhost from the Android emulator.
const String apiBaseUrl = String.fromEnvironment(
  'API_BASE_URL',
  defaultValue: 'http://10.0.2.2:5199',
);
