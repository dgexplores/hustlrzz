/// Maps raw exceptions to short, human-friendly messages for the UI.
///
/// Pages display `error.toString()`, so a [FriendlyException] carries only the
/// friendly copy — no "Exception:" prefix, URI, or stack internals. The raw
/// error is still logged by the caller via `debugPrint` for debugging.
class FriendlyException implements Exception {
  const FriendlyException(this.message);

  final String message;

  @override
  String toString() => message;
}

/// Converts a raw error into a [FriendlyException] with text a normal person
/// can read.
FriendlyException friendlyError(Object error) =>
    FriendlyException(friendlyErrorMessage(error));

String friendlyErrorMessage(Object error) {
  final message = error.toString();
  final lower = message.toLowerCase();

  // Network-level failures: offline, CORS, Render cold start, DNS, timeouts.
  if (lower.contains('failed to fetch') ||
      lower.contains('clientexception') ||
      lower.contains('socketexception') ||
      lower.contains('connection') ||
      lower.contains('failed to connect') ||
      lower.contains('timeout') ||
      lower.contains('network') ||
      lower.contains('unable to connect') ||
      lower.contains('dns')) {
    return "Couldn't reach the server. Please try again in a moment.";
  }

  // Auth / session problems (401/403, missing or rejected tokens).
  if (lower.contains('401') ||
      lower.contains('403') ||
      lower.contains('unauthorized') ||
      lower.contains('forbidden') ||
      lower.contains('authentication token') ||
      lower.contains('session has expired')) {
    return 'Your session has expired. Please sign in again.';
  }

  // Rate limiting.
  if (lower.contains('429') ||
      lower.contains('rate limit') ||
      lower.contains('too many requests')) {
    return 'Too many requests. Please wait a moment and try again.';
  }

  // Server-side failures (5xx).
  if (lower.contains('500') ||
      lower.contains('502') ||
      lower.contains('503') ||
      lower.contains('504') ||
      lower.contains('internal server')) {
    return 'Something went wrong on our end. Please try again.';
  }

  // Validation (4xx) or anything unexpected.
  return 'Something went wrong. Please try again.';
}
