# Bundled audio

Drop your worship track pairs into this folder and they'll be available to import
into the library via the **Load bundled songs** button on the Library page.

## Layout

Each song needs two files — a piano track and a choir track — paired together.

1. Place your audio files in this `public/audio/` directory, for example:
   ```
   public/audio/
     amazing-grace-piano.mp3
     amazing-grace-choir.mp3
     how-great-thou-art-piano.mp3
     how-great-thou-art-choir.mp3
   ```

2. Edit `manifest.json` to list each pair:
   ```json
   [
     {
       "title": "Amazing Grace",
       "piano": "/audio/amazing-grace-piano.mp3",
       "choir": "/audio/amazing-grace-choir.mp3"
     }
   ]
   ```

3. Open the app, go to **Library**, click **Load bundled songs**, and confirm.

The files are referenced by URL (not copied into IndexedDB), so they stay in this
folder. Once imported they behave like any other library song and can be added to
services.

## Format

Any audio format the browser can play works (`.mp3`, `.m4a`, `.wav`, `.ogg`,
`.flac`). The piano and choir tracks should be the same length and aligned in
time so they stay locked in sync during playback.
