/* global Tone */
/* global Util */
/** Allows the audio playback of notes */
class SynthInstrument {
  // eslint-disable-line no-unused-vars
  /**
   * Creates a synth instrument
   * @param {number} gridWidth - The width of the grid, in tiles
   * @param {number} gridHeight - The height of the grid, in tiles
   */
  constructor(gridWidth, gridHeight, options, filterOptions) {
    Util.assert(arguments.length === 4);

    this.gridWidth = gridWidth;
    this.gridHeight = gridHeight;

    const tonicSelectEl = document.querySelector('#tonic-select');
    tonicSelectEl.addEventListener('change', () => {
      this.selectedTonic = parseInt(tonicSelectEl.value, 10);

      this.initializeInstrument(gridWidth, gridHeight, options, filterOptions);
    });

    const scaleSelectEl = document.querySelector('#scale-select');
    scaleSelectEl.addEventListener('change', () => {
      this.selectedScale = scaleSelectEl.value
        .split(',')
        .map((v) => parseInt(v, 10));

      this.initializeInstrument(gridWidth, gridHeight, options, filterOptions);
    });

    this.selectedTonic = parseInt(tonicSelectEl.value, 10);
    this.selectedScale = scaleSelectEl.value
      .split(',')
      .map((v) => parseInt(v, 10));

    this.initializeInstrument(gridWidth, gridHeight, options, filterOptions);
  }

  initializeInstrument(gridWidth, gridHeight, options, filterOptions) {
    // Construct scale array

    let octaveOffset;
    const scaleNotes = this.selectedScale.map((note, i) => {
      const computedNote = (this.selectedTonic + note) % 12;
      if (!octaveOffset && Math.floor((this.selectedTonic + note) / 12) > 0) {
        octaveOffset = i;
      }

      switch (computedNote) {
        case 0:
          return 'C';
        case 1:
          return 'C#';
        case 2:
          return 'D';
        case 3:
          return 'D#';
        case 4:
          return 'E';
        case 5:
          return 'F';
        case 6:
          return 'F#';
        case 7:
          return 'G';
        case 8:
          return 'G#';
        case 9:
          return 'A';
        case 10:
          return 'A#';
        case 11:
          return 'B';
        default:
          return 'C';
      }
    });

    if (!octaveOffset) {
      octaveOffset = 0;
    }

    // Find the actual offset
    octaveOffset = scaleNotes.length - octaveOffset;

    const baseOctave = 3; // base octave
    const scale = Array(gridHeight);
    for (let i = 0; i < gridHeight; i += 1) {
      const note = scaleNotes[i % scaleNotes.length];
      const octave =
        baseOctave + Math.floor((i + octaveOffset) / scaleNotes.length);
      scale[i] = `${note}${octave}`;
    }

    this.scale = scale.reverse(); // higher notes at lower y values, near the top

    // Pre-render synth

    this.numVoices = 3; // Number of voices (players) *per note*
    this.noteOffset = (Tone.Time('1m') / gridWidth) * 6; // Total note duration, including release. Used to offset the sound sprites

    this.players = [];

    this.currentPlayer = 0;

    // Init polyphony tracker. More notes playing at the same time
    // means that each note needs to play quieter

    this.polyphony = Array(gridWidth).fill(0);
    this.notes = []; // Sparse array

    const self = this;
    Tone.Offline(() => {
      const filter = new Tone.Filter(filterOptions).toDestination();
      const synth = new Tone.Synth(options).connect(filter);

      this.scale.forEach((el, idx) => {
        synth.triggerAttackRelease(
          el,
          Tone.Time('1m') / this.gridWidth,
          idx * self.noteOffset
        );
      });
    }, this.noteOffset * this.scale.length).then((buffer) => {
      for (let i = 0; i < this.scale.length * self.numVoices; i += 1) {
        Tone.setContext(Tone.context); // Hopefully there's no weird asynchronicity issue here
        const player = new Tone.Player(buffer);
        Tone.connect(player, Tone.Destination);
        this.players.push(player);
      }
    });
  }

  /**
   * Schedules a note at an (x, y) grid coordinate
   * to automatically play at the appropriate time and pitch
   * @param {number} gridX - The x position of the note, in grid tiles
   * @param {number} gridY  - The y position of the note, in grid tiles
   * @returns {noteId} - The id of the note that's been scheduled, for use with unscheduleNote()
   */
  scheduleNote(gridX, gridY) {
    Util.assert(arguments.length === 2);
    // Cycle through the voices
    const noteDuration = Tone.Time('1m') / this.gridWidth;
    const playEvent = Tone.Transport.schedule((time) => {
      const highVolume = -10; // When one note is playing
      const lowVolume = -20; // When all notes are playing (lower volume to prevent peaking)

      const volume =
        ((this.gridHeight - this.polyphony[gridX]) / this.gridHeight) *
          (highVolume - lowVolume) +
        lowVolume;
      try {
        this.players[this.currentPlayer].volume.setValueAtTime(volume, time);
        this.players[this.currentPlayer].start(
          time,
          gridY * this.noteOffset,
          this.noteOffset
        );
        this.currentPlayer = (this.currentPlayer + 1) % this.players.length;
      } catch (e) {
        // eslint-disable-next-line no-console
        if (Util.DEBUG) console.warn('Note play failure:', e);
      }
    }, gridX * noteDuration);
    this.notes[playEvent] = { x: gridX, y: gridY };
    this.polyphony[gridX] += 1;
    return playEvent;
  }

  /**
   * Unschedules a note so that it will no longer play
   * @param {noteId} id - The id of the note to unschedule
   */
  unscheduleNote(id) {
    // eslint-disable-line class-methods-use-this
    Util.assert(arguments.length === 1);
    const { x } = this.notes[id];
    delete this.notes[id];
    this.polyphony[x] -= 1;
    Util.assert(this.polyphony[x] >= 0);
    Tone.Transport.clear(id);
  }

  /**
   * Get the x position on the grid where the playhead currently is
   * @returns {number} - The x position
   */
  getPlayheadX() {
    const adjustedSeconds =
      Tone.Transport.seconds %
      (Tone.Transport.loopEnd - Tone.Transport.loopStart);
    const adjustedProgress =
      adjustedSeconds / (Tone.Transport.loopEnd - Tone.Transport.loopStart);
    return Math.floor(adjustedProgress * this.gridWidth);
  }
}
