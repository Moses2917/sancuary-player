# Features

How to use each feature of Sanctuary Player.

## Library

The Library view lists every song. Each row shows the title, the piano and
choir track badges, an optional New / Old tag, and a play / delete button.

### Adding a song

1. Click **Add song**.
2. (Optional) Enter a title. If you leave it blank, the title is derived
   from the piano filename.
3. (Optional) Pick a tag: **New**, **Old**, or none.
4. Click **Piano track** and choose an audio file. Repeat for **Choir
   track**.
5. Click **Save song**.

Files are stored locally in your browser via IndexedDB. They never leave
the device.

You can also drag-and-drop files onto the track slots.

### Loading bundled demo tracks

If `public/audio/manifest.json` exists, **Load bundled** opens a picker
that lists every entry. Tick the ones you want and click **Import**.

### Filtering and searching

- The search box matches song titles.
- The **All / New / Old** chips filter by tag. Chips only appear when at
  least one song has that tag.

### Backup and restore

- **Export** downloads a `sanctuary-player-backup-YYYY-MM-DD.json` file
  containing every song, service, and your settings. Audio blobs are
  inlined as base64, so the file is large but fully self-contained.
- **Restore** prompts you for a JSON file and asks whether to **replace**
  your entire library or **merge** (upsert by id; incoming wins on
  conflict).

Keep an export somewhere safe. Browser storage can be cleared by accident.

## Services

A service is a named occasion with an ordered setlist of songs.

### Creating a service

1. On the Services page, click **New service**.
2. Enter a name (e.g. "Sunday Morning").
3. (Optional) Enter a date or pick one from the date picker.
4. Click **Create**. You'll be taken straight to the setlist editor.

### Searching services

The search box matches service names, dates, and any song title in a
service's setlist.

### Building a setlist

Inside a service:

- **Add songs** opens the library picker. Multi-select with checkboxes and
  click **Add N**.
- **Create song** opens the song importer inline. After saving, the new
  song is added to the library and appended to this setlist in one step.
- Drag the grip handle on a row to reorder.
- Each row has its own Piano and Choir volume sliders (with percentage
  readouts). These are saved per-slot, so the same song can sit at different
  mixes in different services.

### Renaming or redating

Click the pencil next to the date to edit the name or date in place.

### Duplicating

Not built yet. For now, use the backup export to copy a JSON setlist by
hand if you need a template workflow.

## Playback

Press **Play service** to start from the top, or click any row's play
button to start from that song.

The floating player pod at the top of the page stays visible while you
scroll. It shows:

- The song title and service name
- Transport (previous, play / pause, next, panic stop)
- A thick waveform with the current playhead
- Loop, cue, fade, and outputs tools
- Piano / Choir / Master volume sliders with percentage readouts
- A dismissible red banner when audio fails to load or play

Click **Expand** (top-right of the pod) to open the full-screen Now Playing
view, suitable for projecting on a second screen.

### Seeking

- Click anywhere on the waveform to jump.
- Press and drag to scrub.
- Times are shown below the waveform on either side.

### Section markers (cues)

Drop a named cue anywhere on the timeline:

- Tap the **Cue** tool to enter placement mode, then click the waveform.
  The mode auto-exits after one placement.
- Or right-click the waveform at any time to drop a cue at that position.
- Or double-click the waveform to drop a cue at the playhead.

Each cue prompts for an optional label. Click the gold dot under a cue to
jump back to it.

### A-B loop

- **A** sets the loop start at the playhead.
- **B** sets the loop end at the playhead.
- **Loop** toggles the loop on or off. When on, playback jumps back to A
  whenever it crosses B. The region is highlighted green on the waveform.

### Fade regions

A fade region scales every track's volume linearly from full at the start
down to zero (or a chosen target) at the end.

- Tap **Fade** to drop an 8-second fade starting at the playhead.
- Drag the body of the box to move the whole region.
- Drag either solid edge handle to resize; the duration pill updates live.
- Click the **x** in the corner of the box to remove it.

The box itself shows a red ramp gradient from faint (start) to strong (end)
so you can see at a glance where the audio tapers off. Multiple fades can
coexist on a single song. They're saved per song, so they apply every time
you play that song.

### Audio outputs

The **Outputs** tool in the player pod lets you route piano and choir to
separate audio devices — for example, piano to the main speakers and choir
to the choir's in-ear monitors.

- Open the panel from any track's mix area.
- The first time, the browser will ask for microphone permission. This is
  only used to unlock readable device names; no audio is captured.
- Pick a destination for each track. **System default** sends both to your
  normal output (the default behaviour).
- **Reset both to default** restores the single-output setup.
- **Refresh list** re-scans for newly plugged-in devices.

Routing uses `HTMLMediaElement.setSinkId`, so it works in Chrome, Edge, and
Firefox 136+. The panel shows a notice on Safari, which doesn't support
per-element output routing.

### Panic stop

The red square next to the transport buttons triggers an instant
fade-out-and-stop: volume ramps to zero over roughly half a second, then
playback pauses and rewinds to the start. Useful when something needs to
go silent immediately (a pastoral prayer, an unplanned announcement).

### Resume position (rehearsal mode)

Under **Rehearsal tools** inside the Outputs panel, tick **Remember
playhead position** to have Sanctuary Player save where you left off in
each song and restore it the next time you open that song. Handy for
rehearsing a tricky passage across multiple sittings without scrubbing
back to it each time. Turn it off during services so songs always start
from the top.

## Print / PDF setlist

On a service page, click **Print** to open the browser print dialog with a
clean numbered layout: title, date, song count, one row per song with a
blank notes column. Choose "Save as PDF" as the destination to export.

## Keyboard shortcuts

- **Space** - play / pause
- **ArrowRight** / **ArrowLeft** - seek ±5 seconds
- **Shift + ArrowRight** - next track
- **Shift + ArrowLeft** - previous track
- **M** - mute both tracks (toggle)
- **P** - toggle piano mute
- **C** - toggle choir mute
- **L** - toggle A-B loop
- **F** - drop a fade region at the playhead
- **1..9** - jump to the Nth cue marker
- **Escape** - stop

Shortcuts are ignored while typing in an input.

## Media Session (lock screen controls)

When audio is playing, the OS-level media controls (iOS lock screen,
Android notification shade, macOS Now Playing widget, Bluetooth media
buttons) show the current song title and service name, and the play /
pause / next / previous / seek buttons work remotely.

## Installing as an app (PWA)

Use your browser's "Install Sanctuary Player" / "Add to Home Screen"
option. Once installed, the app opens in its own window, works offline, and
behaves like a native app.
