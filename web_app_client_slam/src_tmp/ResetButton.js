
export class ResetButton {
  constructor(sceneManager, camera, controls) {
    this.sceneManager = sceneManager;
    this.camera = camera;
    this.controls = controls;
    this.button = document.createElement('button');
    this.button.textContent = 'Reset view';
    this.button.style.position = 'absolute';
    this.button.style.top = '10px';
    this.button.style.right = '10px';
    this.button.style.cursor = 'pointer';
    this.button.onclick = () => this.sceneManager.resetView(this.camera, this.controls);
    document.body.appendChild(this.button);
  }
}
