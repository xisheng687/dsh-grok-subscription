# dsh-native-media-tools

DeepSeek Harness can save an MP3 or MP4, but a file path in chat is a rough
experience. This plugin adds persistent audio/video cards and a practical long
video pipeline without changing DSH core.

Tools:

- `present_local_media`: show a local audio/video file in a native player card.
- `media_text_to_speech`: xAI API text-to-speech.
- `media_speech_to_text`: xAI API transcription with per-upload consent.
- `analyze_long_video`: ffprobe metadata, 24/48 uniformly sampled frames,
  15-minute audio chunks, STT, and multimodal synthesis into a summary/timeline.

Audio and long-video API calls require `XAI_API_KEY`. The original long video
is never uploaded whole. Derived frames/audio require explicit approval, are
bounded, and are deleted after analysis. Local playback uses a persistent HMAC
capability URL on DSH's own origin with HTTP Range support.

This plugin is independent and is not endorsed by xAI or DeepSeek.
