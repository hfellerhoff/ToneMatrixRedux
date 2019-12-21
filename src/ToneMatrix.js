/* global ClipboardJS */
/* global Tone */
/* global ParticleSystem */
/* global SpriteSheet */
// eslint-disable-next-line no-unused-vars
class ToneMatrix {
  /**
   * The entry point for ToneMatrix Redux, a pentatonic step sequencer
   * @constructor
   * @param {Element} canvasWrapperEl - The wrapper element that ToneMatrix should inject its
   *    canvas into
   * @param {Element} clearNotesButtonEl - A DOM element that should clear all notes when clicked
   * @param {Element} clipboardInputEl - An HTML 'input' element for displaying level codes
   * @param {Element} clipboardButtonEl - A DOM element that should copy the level code to the
   *    clipboard when clicked
   */
  constructor(canvasWrapperEl, clearNotesButtonEl, clipboardInputEl, clipboardButtonEl) {
    this.DEBUG = false;

    /**
     * The main canvas element that ToneMatrix draws to
     * @type {Element}
     */
    this.c = document.createElement('canvas');
    this.c.width = 500;
    this.c.height = 500;
    canvasWrapperEl.appendChild(this.c);
    /**
     * The main canvas element's 2d drawing context
     * @type {CanvasRenderingContext2D}
     */
    this.ctx = this.c.getContext('2d');
    /**
     * The width of the grid, measured in grid tiles
     * @const {number}
     */
    this.WIDTH = 16;
    /**
     * The height of the grid, measured in grid tiles
     * @const {number}
     */
    this.HEIGHT = 16;
    this.data = Array(this.WIDTH * this.HEIGHT).fill(false);

    /**
     * The device pixel ratio of the current display
     * @const {number}
     */
    this.DPR = window.devicePixelRatio || 1;

    // Get the size of the canvas in CSS pixels.
    const rect = this.c.getBoundingClientRect();
    // Give the canvas pixel dimensions of their CSS
    // size * the device pixel ratio.
    this.c.width = rect.width * this.DPR;
    this.c.height = rect.height * this.DPR;

    // Clipboard input element

    this.clipboardInputEl = clipboardInputEl || null;
    this.originalURL = [window.location.protocol, '//', window.location.host, window.location.pathname].join(''); // Initial page URL without query string

    clearNotesButtonEl.addEventListener('click', () => {
      this.clearAllTiles();
    });

    // Integrate the clipboard button with the ClipboardJS library

    // eslint-disable-next-line no-new
    new ClipboardJS(clipboardButtonEl);

    // Listen for clicks on the canvas

    let arming = null;

    function canvasClick(e) {
      const currentRect = this.c.getBoundingClientRect(); // abs. size of element
      const scaleX = this.c.width / currentRect.width; // relationship bitmap vs. element for X
      const scaleY = this.c.height / currentRect.height; // relationship bitmap vs. element for Y

      const x = (e.clientX - currentRect.left) * scaleX;
      const y = (e.clientY - currentRect.top) * scaleY;

      const tile = this.getTileCollision(x, y);
      if (arming === null) arming = !this.getTileValue(tile.x, tile.y);
      this.setTileValue(tile.x, tile.y, arming);
      // Update URL fragment
      const base64 = this.gridToBase64();
      this.setSharingURL(base64);
    }
    this.c.addEventListener('mousemove', (e) => {
      if (e.buttons !== 1) return; // Only if left button is held
      canvasClick.bind(this)(e);
    });
    this.c.addEventListener('mousedown', (e) => {
      arming = null;
      canvasClick.bind(this)(e);
    });
    this.c.addEventListener('touchstart', (e) => {
      e.preventDefault(); // Prevent emulated click
      if (e.touches.length === 1) {
        arming = null;
      }
      Array.from(e.touches).forEach((touch) => canvasClick.bind(this)(touch));
    });
    this.c.addEventListener('touchmove', (e) => {
      e.preventDefault(); // Prevent emulated click
      Array.from(e.touches).forEach((touch) => canvasClick.bind(this)(touch));
    });

    // Construct scale array

    const pentatonic = ['B#', 'D', 'F', 'G', 'A'];
    const octave = 3; // base octave
    const octaveoffset = 4;
    this.scale = Array(this.HEIGHT);
    for (let i = 0; i < this.HEIGHT; i += 1) {
      this.scale[i] = pentatonic[i % pentatonic.length]
        + (octave + Math.floor((i + octaveoffset) / pentatonic.length));
    }
    this.scale = this.scale.reverse(); // higher notes at lower y values, near the top

    // Init synth

    const lowPass = new Tone.Filter({
      frequency: 1100,
      rolloff: -12,
    }).toMaster();

    this.synth = new Tone.PolySynth(16, Tone.Synth, {
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

    this.synth.volume.value = -10;

    this.SYNTHLATENCY = 0.25; // Queue events ahead of time
    Tone.context.latencyHint = this.SYNTHLATENCY;
    Tone.Transport.loopEnd = '1m'; // loop at one measure
    Tone.Transport.loop = true;
    Tone.Transport.toggle(); // start

    // Pre-render synth

    const width = this.WIDTH;
    this.players = [];
    let players = this.players;
    this.scale.forEach((el) => {
      console.log(el);
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
        synth.triggerAttackRelease(el, Tone.Time('1m') / width, 0);
      }, Tone.Time('1m')).then((buffer) => {
        players.push(new Tone.Player(buffer).toMaster());
        console.log(players);
      });
    });

    // Init particle system

    this.particleSystem = new ParticleSystem(this.c.width, this.c.height);

    // If Chrome Autoplay Policy is blocking audio,
    // add a play button that encourages user interaction

    window.addEventListener('DOMContentLoaded', () => {
      // eslint-disable-next-line no-param-reassign
      canvasWrapperEl.style.visibility = 'visible';
    });

    if ('ontouchstart' in window || window.location.toString().indexOf('?') >= 0) {
      canvasWrapperEl.addEventListener('click', () => {
        Tone.context.resume().then(() => {
          document.body.classList.add('playing');
        });
      });
      Tone.context.resume().then(() => {
        document.body.classList.add('playing');
      });
    } else {
      document.body.classList.add('playing');
    }

    // Load tune from search string, then remove search string

    const urlParams = new URLSearchParams(window.location.search);
    const data = urlParams.get('d');
    if (data) {
      this.base64ToGrid(data);
      this.setSharingURL(data);
      window.history.replaceState('', document.title, window.location.pathname);
    } else {
      this.setSharingURL('');
    }

    // Create sprite sheet

    this.spriteSheet = new SpriteSheet(this.c.width, this.c.height,
      this.WIDTH, this.HEIGHT, this.DPR);

    // Kick off drawing loop

    const drawContinuous = (function drawContinuousUnbound() {
      this.particleSystem.tickParticles();
      this.draw();
      window.requestAnimationFrame(drawContinuous);
    }).bind(this);

    drawContinuous();
  }

  /**
   * Clear all tiles and resets the sharing URL.
   */
  clearAllTiles() {
    this.data = Array(this.WIDTH * this.HEIGHT).fill(false);
    Tone.Transport.cancel();
    this.setSharingURL(''); // get rid of hash
  }

  /**
   * Write encoded data to the "Share URL" input element on the screen.
   * @param {string} base64URLEncodedData - Base64, URL-encoded level savestate
   */
  setSharingURL(base64URLEncodedData) {
    if (base64URLEncodedData) {
      const params = new URLSearchParams({ v: '1', d: base64URLEncodedData });
      this.clipboardInputEl.value = `${this.originalURL}?${params}`;
    } else {
      this.clipboardInputEl.value = this.originalURL;
    }
  }

  /**
   * Get whether a grid tile is currently lit up (armed)
   * @param {number} x - The x position, measured in grid tiles
   * @param {number} y - The y position, measured in grid tiles
   * @returns {bool} - Whether the tile is lit up
   */
  getTileValue(x, y) {
    return this.data[x * this.WIDTH + y] !== false;
  }

  /**
   * Set whether a grid tile is currently lit up (armed)
   * @param {number} x - The x position, measured in grid tiles
   * @param {number} y - The y position, measured in grid tiles
   * @param {bool} - Whether the tile should be turned on (true) or off (false)
   */
  setTileValue(x, y, bool) {
    if (bool) {
      if (this.getTileValue(x, y)) return;
      // Make sure AudioContext has started
      Tone.context.resume();
      // Turning on, schedule note
      this.data[x * this.WIDTH + y] = Tone.Transport.schedule((time) => {
        //this.synth.triggerAttackRelease(this.scale[y], Tone.Time('1m') / this.WIDTH, time);
        this.players[y].start(time);
      }, (Tone.Time('1m') / this.WIDTH) * x);
    } else {
      if (!this.getTileValue(x, y)) return;
      // Turning off, unschedule note
      Tone.Transport.clear(this.data[x * this.WIDTH + y]);
      this.data[x * this.WIDTH + y] = false;
    }
  }

  /**
   * Toggle whether a grid tile is currently lit up (armed)
   * @param {number} x - The x position, measured in grid tiles
   * @param {number} y - The y position, measured in grid tiles
   */
  toggleTileValue(x, y) {
    this.setTileValue(x, y, !this.getTileValue(x, y));
  }

  /**
   * Draw the current state of the app to the canvas element.
   * This is looped asynchronously via requestAnimationFrame.
   */
  draw() {
    // Defaults
    this.ctx.globalAlpha = 1;
    this.ctx.filter = 'none';

    this.ctx.beginPath();
    this.ctx.rect(0, 0, this.c.width, this.c.height);
    this.ctx.fillStyle = 'black';
    this.ctx.fill();

    // Get particle heatmap

    const heatmap = this.getParticleHeatMap();

    // Progress, adjusted for the latency hint
    function positivemod(n, m) {
      return ((n % m) + m) % m;
    }
    const adjustedSeconds = positivemod((Tone.Transport.seconds - this.SYNTHLATENCY),
      (Tone.Transport.loopEnd - Tone.Transport.loopStart));
    const adjustedProgress = adjustedSeconds / (Tone.Transport.loopEnd - Tone.Transport.loopStart);

    const playheadx = Math.floor(adjustedProgress * this.WIDTH);
    // Draw each tile
    for (let i = 0; i < this.data.length; i += 1) {
      const dx = this.c.height / this.HEIGHT;
      const dy = this.c.width / this.WIDTH;
      const gridx = i % this.WIDTH;
      const gridy = Math.floor(i / this.WIDTH);
      const x = dx * gridx;
      const y = dy * gridy;

      const on = this.getTileValue(gridx, gridy);

      if (on) {
        if (gridx === playheadx) {
          this.ctx.globalAlpha = 1;
          this.ctx.drawImage(this.spriteSheet.get(), dx * 2, 0, dx, dy, x, y, dx, dy);
          // Create particles
          const px = dx * (gridx + 0.5);
          const py = dy * (gridy + 0.5);
          const velocityscalar = 10 * this.DPR;
          const numparticles = 20;
          for (let j = 0; j < 2 * Math.PI; j += (2 * Math.PI) / numparticles) {
            const pvx = Math.cos(j) * velocityscalar;
            const pvy = Math.sin(j) * velocityscalar;
            this.particleSystem.createParticle(px, py, pvx, pvy);
          }
        } else {
          this.ctx.globalAlpha = 0.85;
          this.ctx.drawImage(this.spriteSheet.get(), dx, 0, dx, dy, x, y, dx, dy);
        }
      } else {
        const BRIGHTNESS = 0.05; // max particle brightness between 0 and 1
        this.ctx.globalAlpha = ((heatmap[i] * BRIGHTNESS * (204 / 255))
            / this.particleSystem.PARTICLE_LIFETIME) + 51 / 255;
        this.ctx.drawImage(this.spriteSheet.get(), 0, 0, dx, dy, x, y, dx, dy);
      }
    }

    // Draw particles

    if (this.DEBUG) {
      const ps = this.particleSystem;
      for (let i = 0; i < ps.PARTICLE_POOL_SIZE; i += 1) {
        const p = ps.particles[i];
        this.ctx.globalAlpha = 1;
        this.ctx.fillStyle = 'white';
        this.ctx.fillRect(p.x, p.y, 2, 2);
      }
    }
  }

  /**
   * Convert a canvas position (measured in pixels) to a grid position (measured in tiles)
   * @param {number} x - The x position on the canvas, measured in pixels
   * @param {number} y - The y position on the canvas, measured in pixels
   * @returns {number} x - The x position on the grid, measured in grid tiles
   * @returns {number} y - The y position on the grid, measured in grid tiles
   */
  getTileCollision(x, y) {
    const dx = this.c.height / this.HEIGHT;
    const dy = this.c.width / this.WIDTH;
    const xCoord = Math.floor(x / dx);
    const yCoord = Math.floor(y / dy);
    if (
      xCoord >= this.WIDTH
            || yCoord >= this.WIDTH
            || xCoord < 0
            || yCoord < 0
    ) {
      return false;
    }
    return { x: xCoord, y: yCoord };
  }

  /**
   * Gets the "heat" of every tile by calculating how many particles are on top of the tile
   * @returns {array} An array of numbers from 0 to 1, representing the "heat" of each tile
   */
  getParticleHeatMap() {
    const heatmap = Array(this.WIDTH * this.HEIGHT).fill(0);
    const ps = this.particleSystem;
    for (let i = 0; i < ps.PARTICLE_POOL_SIZE; i += 1) {
      const p = ps.particles[i];
      const tile = this.getTileCollision(p.x, p.y);
      if (tile) heatmap[this.WIDTH * tile.y + tile.x] = p.life;
    }
    return heatmap;
  }

  /**
   * Save the app's current state into a savestate string
   * @returns {string} savestate - The base64-encoded URL-encoded savestate string,
   *   ready for saving or outputting in a URL
   */
  gridToBase64() {
    let dataflag = false;
    const bytes = new Uint8Array(this.data.length / 8);
    for (let i = 0; i < this.data.length / 8; i += 1) {
      let str = '';
      for (let j = 0; j < 8; j += 1) {
        const tile = this.data[i * 8 + j] !== false;
        if (tile) {
          str += '1';
          dataflag = true;
        } else {
          str += '0';
        }
      }
      bytes[i] = parseInt(str, 2);
    }
    if (!dataflag) return '';

    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i += 1) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64 = btoa(binary);
    const base64enc = encodeURIComponent(base64);
    return base64enc;
  }

  /**
   * Load a savestate from a string into the app
   * @param {string} savestate - The base64-encoded URL-encoded savestate string
   */
  base64ToGrid(base64enc) {
    try {
      const base64 = decodeURIComponent(base64enc);
      const binary = atob(base64);

      const bytes = new Uint8Array(this.data.length / 8);
      let str = '';
      for (let i = 0; i < this.data.length / 8; i += 1) {
        const byte = binary.charCodeAt(i);
        bytes[i] = byte;
        let bits = byte.toString(2);
        bits = bits.padStart(8, '0');
        str += bits;
      }

      for (let i = 0; i < str.length; i += 1) {
        const bool = str[i] === '1';
        this.setTileValue(Math.floor(i / this.WIDTH), i % this.WIDTH, bool);
      }
    } catch (e) {
      // Invalid hash
    }
  }
}
