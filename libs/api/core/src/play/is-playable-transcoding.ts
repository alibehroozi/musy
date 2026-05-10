// SoundCloud (and similar HLS providers) advertise transcodings under several
// `format.protocol` values. Only `progressive` (mp3 over HTTP) and plain `hls`
// (unencrypted m3u8) are decodable by browsers without an EME/DRM stack.
//
// `cbc-encrypted-hls` (Apple FairPlay) and `ctr-encrypted-hls` (Widevine) require
// a license-server handshake that lives inside the source platform's official
// player. Without it, hls.js stalls on the `#EXT-X-KEY` line and never errors out.
//
// `snipped` transcodings are 30-second previews — a non-null URL that plays only
// the first verse, which is not what the user asked for.
export function isPlayableTranscoding(t: { protocol: string; snipped: boolean }): boolean {
  if (t.snipped) return false;
  if (/encrypted/i.test(t.protocol)) return false;
  return t.protocol === "progressive" || t.protocol === "hls";
}
