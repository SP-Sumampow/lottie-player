import { customElement, LitElement, html, property, query, TemplateResult } from 'lit-element';
import * as lottie from 'lottie-web/build/player/lottie';

import styles from './lottie-player.styles';

// Define valid player states
export enum PlayerState {
  Loading = 'loading',
  Playing = 'playing',
  Paused = 'paused',
  Stopped = 'stopped',
  Frozen = 'frozen',
  Error = 'error'
};

// Define play modes
export enum PlayMode {
  Normal = 'normal',
  Bounce = 'bounce'
};

// Define player events
export enum PlayerEvents {
  Load = 'load',
  Error = 'error',
  Ready = 'ready',
  Play = 'play',
  Pause = 'pause',
  Stop = 'stop',
  Freeze = 'freeze',
  Loop = 'loop',
  Complete = 'complete',
  Frame = 'frame'
};

/**
 * Parse a resource into a JSON object or a URL string
 */
export function parseSrc(src: string | object): string | object {
  if (typeof src === 'object') {
    return src;
  }

  try {
    return JSON.parse(src);
  } catch (e) {
    // Try construct an absolute URL from the src URL
    const srcUrl: URL = new URL(src, window.location.href);

    return srcUrl.toString();
  }
}

/**
 * LottiePlayer web component class
 *
 * @export
 * @class LottiePlayer
 * @extends {LitElement}
 */
@customElement('lottie-player')
export class LottiePlayer extends LitElement {
  /**
   * Animation container.
   */
  @query('.animation')
  protected container!: HTMLElement;

  /**
   * Play mode.
   */
  @property()
  public mode: PlayMode = PlayMode.Normal;

  /**
   * Autoplay animation on load.
   */
  @property({ type: Boolean })
  public autoplay = false;

  /**
   * Background color.
   */
  @property({ type: String, reflect: true })
  public background?: string = 'transparent';

  /**
   * Show controls.
   */
  @property({ type: Boolean })
  public controls = false;

  /**
   * Number of times to loop animation.
   */
  @property({ type: Number })
  public count?: number;

  /**
   * Direction of animation.
   */
  @property({ type: Number })
  public direction = 1;

  /**
   * Whether to play on mouse hover
   */
  @property({ type: Boolean })
  public hover = false;

  /**
   * Whether to loop animation.
   */
  @property({ type: Boolean, reflect: true })
  public loop = false;

  /**
   * Renderer to use.
   */
  @property({ type: String })
  public renderer: 'svg' = 'svg';

  /**
   * Animation speed.
   */
  @property({ type: Number })
  public speed = 1;

  /**
   * Bodymovin JSON data or URL to JSON.
   */
  @property({ type: String })
  public src?: string;

  /**
   * Player state.
   */
  @property({ type: String })
  public currentState: PlayerState = PlayerState.Loading;

  @property()
  public seeker: any;

  @property()
  public intermission: number = 1;

  private _io: IntersectionObserver | undefined = undefined;
  private _lottie?: any;
  private _prevState?: any;
  private _counter = 0;

  /**
   * Handle visibility change events.
   */
  private _onVisibilityChange(): void {
    if (document.hidden === true && this.currentState === PlayerState.Playing) {
      this.freeze();
    } else if (this.currentState === PlayerState.Frozen) {
      this.play();
    }
  }

  /**
   * Handles click and drag actions on the progress track.
   */
  private _handleSeekChange(e: any): void {
    if (!this._lottie || isNaN(e.target.value)) {
      return;
    }

    const frame: number = ((e.target.value / 100) * this._lottie.totalFrames);

    this.seek(frame);
  }

  /**
   * Configure and initialize lottie-web player instance.
   */
  public load(src: string | object): void {
    if (!this.shadowRoot) {
      return;
    }

    const options: any = {
      container: this.container,
      loop: false,
      autoplay: false,
      renderer: this.renderer,
      rendererSettings: {
        preserveAspectRatio: 'xMidYMid slice',
        clearCanvas: false,
        progressiveLoad: true,
        hideOnTransparent: true,
      },
    };

    // Load the resource information
    try {
      const srcParsed = parseSrc(src);
      const srcAttrib = typeof srcParsed === 'string' ? 'path' : 'animationData';

      // Clear previous animation, if any
      if (this._lottie) {
        this._lottie.destroy();
      }

      // Initialize lottie player and load animation
      this._lottie = lottie.loadAnimation({
        ...options,
        [srcAttrib]: srcParsed
      });
    } catch (err) {
      this.currentState = PlayerState.Error;

      this.dispatchEvent(new CustomEvent(PlayerEvents.Error));
      return;
    }

    if (this._lottie) {
      // Calculate and save the current progress of the animation
      this._lottie.addEventListener('enterFrame', () => {
        this.seeker = (this._lottie.currentFrame / this._lottie.totalFrames) * 100;

        this.dispatchEvent(new CustomEvent(PlayerEvents.Frame, {
          detail: {
            frame: this._lottie.currentFrame,
            seeker: this.seeker
          }
        }));
      });

      // Handle animation play complete
      this._lottie.addEventListener('complete', () => {
        if (this.currentState !== PlayerState.Playing) {
          this.dispatchEvent(new CustomEvent(PlayerEvents.Complete));
          return;
        }

        if (!this.loop || (this.count && this._counter >= this.count)) {
          this.dispatchEvent(new CustomEvent(PlayerEvents.Complete));
          return;
        }

        if (this.mode === PlayMode.Bounce) {
          if (this.count) {
            this._counter += 0.5;
          }

          setTimeout(() => {
            this.dispatchEvent(new CustomEvent(PlayerEvents.Loop));

            if (this.currentState === PlayerState.Playing) {
              this._lottie.setDirection(this._lottie.playDirection * -1);
              this._lottie.play();
            }
          }, this.intermission);
        } else {
          if (this.count) {
            this._counter += 1;
          }

          window.setTimeout(() => {
            this.dispatchEvent(new CustomEvent(PlayerEvents.Loop));

            if (this.currentState === PlayerState.Playing) {
              this._lottie.stop();
              this._lottie.play();
            }
          }, this.intermission);
        }
      });

      // Handle lottie-web ready event
      this._lottie.addEventListener('DOMLoaded', () => {
        this.dispatchEvent(new CustomEvent(PlayerEvents.Ready));
      });

      // Handle animation data load complete
      this._lottie.addEventListener('data_ready', () => {
        this.dispatchEvent(new CustomEvent(PlayerEvents.Load));
      });

      // Set error state when animation load fail event triggers
      this._lottie.addEventListener('data_failed', () => {
        this.currentState = PlayerState.Error;

        this.dispatchEvent(new CustomEvent(PlayerEvents.Error));
      });

      // Set handlers to auto play animation on hover if enabled
      this.container.addEventListener('mouseenter', () => {
        if (this.hover && this.currentState !== PlayerState.Playing) {
          this.play();
        }
      });
      this.container.addEventListener('mouseleave', () => {
        if (this.hover && this.currentState === PlayerState.Playing) {
          this.stop();
        }
      });

      // Set initial playback speed and direction
      this.setSpeed(this.speed);
      this.setDirection(this.direction);

      // Start playing if autoplay is enabled
      if (this.autoplay) {
        this.play();
      }
    }
  }

  /**
   * Returns the lottie-web instance used in the component.
   */
  public getLottie(): any {
    return this._lottie;
  }

  /**
   * Start playing animation.
   */
  public play() {
    if (!this._lottie) {
      return
    }

    this._lottie.play();
    this.currentState = PlayerState.Playing;

    this.dispatchEvent(new CustomEvent(PlayerEvents.Play));
  }

  /**
   * Pause animation play.
   */
  public pause(): void {
    if (!this._lottie) {
      return
    }

    this._lottie.pause();
    this.currentState = PlayerState.Paused;

    this.dispatchEvent(new CustomEvent(PlayerEvents.Pause));
  }

  /**
   * Stops animation play.
   */
  public stop(): void {
    if (!this._lottie) {
      return
    }

    this._counter = 0;
    this._lottie.stop();
    this.currentState = PlayerState.Stopped;

    this.dispatchEvent(new CustomEvent(PlayerEvents.Stop));
  }

  /**
   * Seek to a given frame.
   */
  public seek(value: number | string): void {
    if (!this._lottie) {
      return;
    }

    // Extract frame number from either number or percentage value
    const matches = value.toString().match(/^([0-9]+)(%?)$/);
    if (!matches) {
      return;
    }

    // Calculate and set the frame number
    const frame = matches[2] === '%'
      ? this._lottie.totalFrames * Number(matches[1]) / 100
      : Number(matches[1]);

    // Set seeker to new frame number
    this.seeker = frame;

    // Send lottie player to the new frame
    if (this.currentState === PlayerState.Playing) {
      this._lottie.goToAndPlay(frame, true);
    } else {
      this._lottie.goToAndStop(frame, true);
      this._lottie.pause();
    }
  }

  /**
   * Snapshot the current frame as SVG.
   *
   * If 'download' argument is boolean true, then a download is triggered in browser.
   */
  public snapshot(download: boolean = true): string | void {
    if (!this.shadowRoot) return;

    // Get SVG element and serialize markup
    const svgElement = this.shadowRoot.querySelector('.animation svg') as Node;
    const data = (new XMLSerializer()).serializeToString(svgElement);

    // Trigger file download
    if (download) {
      const element = document.createElement('a');
      element.href = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(data);
      element.download = 'download_' + this.seeker + '.svg';
      document.body.appendChild(element);

      element.click();

      document.body.removeChild(element);
    }

    return data;
  }

  /**
   * Freeze animation play.
   * This internal state pauses animation and is used to differentiate between
   * user requested pauses and component instigated pauses.
   */
  private freeze(): void {
    if (!this._lottie) {
      return
    }

    this._lottie.pause();
    this.currentState = PlayerState.Frozen;

    this.dispatchEvent(new CustomEvent(PlayerEvents.Freeze));
  }

  /**
   * Sets animation play speed.
   *
   * @param value Playback speed.
   */
  public setSpeed(value = 1): void {
    if (!this._lottie) {
      return;
    }

    this._lottie.setSpeed(value);
  }

  /**
   * Animation play direction.
   *
   * @param value Direction values.
   */
  public setDirection(value: number): void {
    if (!this._lottie) {
      return;
    }

    this._lottie.setDirection(value);
  }

  /**
   * Sets the looping of the animation.
   *
   * @param value Whether to enable looping. Boolean true enables looping.
   */
  public setLooping(value: boolean): void {
    if (this._lottie) {
      this.loop = value;
      this._lottie.loop = value;
    }
  }

  /**
   * Toggle playing state.
   */
  public togglePlay(): void {
    return this.currentState === PlayerState.Playing
      ? this.pause()
      : this.play();
  }

  /**
   * Toggles animation looping.
   */
  public toggleLooping(): void {
    this.setLooping(!this.loop);
  }

  /**
   * Resize animation.
   */
  public resize() {
    if (!this._lottie) {
      return
    }

    this._lottie.resize();
  }

  /**
   * Returns the styles for the component.
   */
  static get styles() {
    return styles;
  }

  /**
   * Initialize everything on component first render.
   */
  protected firstUpdated(): void {
    // Add intersection observer for detecting component being out-of-view.
    if ('IntersectionObserver' in window) {
      this._io = new IntersectionObserver((entries: IntersectionObserverEntry[]) => {
        if (entries[0].isIntersecting) {
          if (this.currentState === PlayerState.Frozen) {
            this.play();
          }
        } else if (this.currentState === PlayerState.Playing) {
          this.freeze();
        }
      });

      this._io.observe(this.container);
    }

    // Add listener for Visibility API's change event.
    if (typeof document.hidden !== 'undefined') {
      document.addEventListener('visibilitychange', () => this._onVisibilityChange());
    }

    // Setup lottie player
    if (this.src) {
      this.load(this.src);
    }
  }

  /**
   * Cleanup on component destroy.
   */
  public disconnectedCallback(): void {
    // Remove intersection observer for detecting component being out-of-view.
    if (this._io) {
      this._io.disconnect();
      this._io = undefined;
    }

    // Remove resize observer for detecting resize/reflow events affecting element.
    if (this._ro) {
      this._ro.disconnect();
      this._ro = undefined;
    }

    // Remove the attached Visibility API's change event listener.
    document.removeEventListener('visibilitychange', () => this._onVisibilityChange());
  }

  protected renderControls() {
    const isPlaying = this.currentState === PlayerState.Playing;
    const isPaused = this.currentState === PlayerState.Paused;
    const isStopped = this.currentState === PlayerState.Stopped;

    return html`
      <div class="toolbar">
        <button @click=${this.togglePlay} class=${isPlaying || isPaused ? 'active' : ''}>
          ${isPlaying
        ? html`<svg width="24" height="24"><path d="M14.016 5.016H18v13.969h-3.984V5.016zM6 18.984V5.015h3.984v13.969H6z"/></svg>`
        : html`<svg width="24" height="24"><path d="M8.016 5.016L18.985 12 8.016 18.984V5.015z"/></svg>`
      }
        </button>
        <button @click=${this.stop} class=${isStopped ? 'active' : ''}>
          <svg width="24" height="24"><path d="M6 6h12v12H6V6z" /></svg>
        </button>
        <input class="seeker" type="range" min="0" step="1" max="100" .value=${this.seeker}
          @input=${this._handleSeekChange}
          @mousedown=${() => { this._prevState = this.currentState; this.freeze(); }}
          @mouseup=${() => { this._prevState === PlayerState.Playing && this.play(); }}
        />
        <button @click=${this.toggleLooping} class=${this.loop ? 'active' : ''}>
          <svg width="24" height="24">
            <path d="M17.016 17.016v-4.031h1.969v6h-12v3l-3.984-3.984 3.984-3.984v3h10.031zM6.984 6.984v4.031H5.015v-6h12v-3l3.984 3.984-3.984 3.984v-3H6.984z"/>
          </svg>
        </button>
        <a href="https://www.lottiefiles.com/" target="_blank">
          <svg width="24" height="24" viewBox="0 0 320 320" fill-rule="nonzero"><rect fill="#adadad" x=".5" y=".5" width="100%" height="100%" rx="26.73"/><path d="M251.304 65.44a16.55 16.55 0 0 1 13.927 18.789c-1.333 9.04-9.73 15.292-18.762 13.954-15.992-2.37-39.95 22.534-66.77 73.74-34.24 65.37-66.113 96.517-99.667 94.032-9.102-.674-15.93-8.612-15.258-17.723s8.592-15.96 17.695-15.286c16.57 1.227 40.908-24.737 67.97-76.4 34.46-65.79 66.764-96.157 100.866-91.105z" fill="#fff"/></svg>
        </a>
      </div>
    `;
  }

  render(): TemplateResult | void {
    const className = this.controls ? 'main controls' : 'main';

    return html`
      <div class=${className}>
        <div class="animation" style=${'background:' + this.background }>
          ${this.currentState === PlayerState.Error ? html`<div class="error">⚠️</div>` : undefined}
        </div>
        ${this.controls ? this.renderControls() : undefined}
      </div>`
  }
}