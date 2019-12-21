/* global Tone */
// eslint-disable-next-line no-unused-vars
class NotePlayer {
  constructor(gridWidth, gridHeight) {
    // Construct scale array
    const pentatonic = ['B#', 'D', 'F', 'G', 'A'];
    const octave = 3; // base octave
    const octaveoffset = 4;
    let scale = Array(gridHeight);
    for (let i = 0; i < gridHeight; i += 1) {
      scale[i] = pentatonic[i % pentatonic.length]
        + (octave + Math.floor((i + octaveoffset) / pentatonic.length));
    }
    scale = scale.reverse(); // higher notes at lower y values, near the top

    // Pre-render synth

    this.numVoices = 3; // Number of voices (players) *per note*

    this.players = [];
    // eslint-disable-next-line prefer-destructuring
    const players = this.players;
    scale.forEach((el) => {
      Tone.Offline(() => {
        const lowPass = new Tone.Filter({
          frequency: 1100,
          rolloff: -12,
        }).toMaster();

        const synth = new Tone.PolySynth(16, Tone.Synth, {
          oscillator: {
            type: 'sine',
          },
          envelope: {
            attack: 0.005,
            decay: 0.1,
            sustain: 0.3,
            release: 1,
          },
        }).connect(lowPass);

        synth.volume.value = -10;
        synth.triggerAttackRelease(el, Tone.Time('1m') / gridWidth, 0);
      }, Tone.Time('1m')).then((buffer) => {
        const voices = [];
        for (let i = 0; i < this.numVoices; i += 1) {
          voices.push(new Tone.Player(buffer).toMaster());
        }
        players.push({ voices, currentVoice: 0 });
      });
    });
  }

  play(index, time) {
    // Cycle through the note's voices
    const player = this.players[index];
    player.voices[player.currentVoice].start(time);
    player.currentVoice = (player.currentVoice + 1) % this.numVoices;
  }
}
