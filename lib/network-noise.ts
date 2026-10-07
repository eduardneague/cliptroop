/*
 * A connection that dropped mid-way: the person's network (Wi-Fi to mobile
 * data, a tunnel, the laptop sleeping) or a page that was still loading
 * while a new version went live. Nothing in the app is broken, so these
 * aren't recorded. Firefox says "Error in input stream" / "NetworkError
 * when attempting to fetch resource", Safari "Load failed" / "The network
 * connection was lost", Chrome "Failed to fetch"; a stale tab after a
 * deploy says "Loading chunk … failed" / ChunkLoadError.
 */
const NETWORK_NOISE =
  /Error in input stream|NetworkError when attempting|network ?error|The network connection was lost|Load failed|Failed to fetch|Loading (CSS )?chunk [^ ]+ failed|ChunkLoadError|The Internet connection appears to be offline|^cancelled$|The operation was aborted|AbortError|The user aborted/i;

/** A dropped connection, not a bug (see above). */
export function isNetworkNoise(message: string) {
  return NETWORK_NOISE.test(message);
}
