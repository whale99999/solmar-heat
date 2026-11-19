// Keyboard and mouse input. Held keys are a live set the loop reads every frame;
// one-shot presses (Enter, E, P, M) are latched into a queue so a tap between two
// frames is never lost and never counted twice. Mouse movement feeds the camera
// yaw while the pointer is locked, and a plain click is the attack button.

export class Input {
  constructor(canvas) {
    this.held = new Set();
    this.pressed = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.mouseDown = false;
    this.mouseClicked = false;

    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.held.add(e.code);
      this.pressed.add(e.code);
      if (['ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.held.delete(e.code));
    addEventListener('blur', () => this.held.clear());

    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        this.mouseDown = true;
        this.mouseClicked = true;
      }
    });
    addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseDown = false;
    });
    addEventListener('mousemove', (e) => {
      if (document.pointerLockElement === canvas) {
        this.mouseDX += e.movementX || 0;
        this.mouseDY += e.movementY || 0;
      }
    });
    this.canvas = canvas;
  }

  down(...codes) {
    return codes.some((c) => this.held.has(c));
  }

  // True once per physical press; reading it consumes it.
  tap(code) {
    if (!this.pressed.has(code)) return false;
    this.pressed.delete(code);
    return true;
  }

  clicked() {
    const was = this.mouseClicked;
    this.mouseClicked = false;
    return was;
  }

  // Camera deltas since the last frame; reading consumes them.
  lookDelta() {
    const d = { x: this.mouseDX, y: this.mouseDY };
    this.mouseDX = 0;
    this.mouseDY = 0;
    return d;
  }

  lockPointer() {
    if (document.pointerLockElement !== this.canvas) {
      this.canvas.requestPointerLock?.();
    }
  }
}
