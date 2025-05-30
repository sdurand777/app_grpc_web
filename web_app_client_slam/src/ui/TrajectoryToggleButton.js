export class TrajectoryToggleButton {
  constructor(controller) {
    this.controller = controller;
    this.button = document.createElement('button');
    this.button.id = 'toggleTrajectoryBtn';
    this.button.textContent = 'Masquer la trajectoire';
    Object.assign(this.button.style, {
      position: 'absolute',
      top: '60px',
      right: '400px',
      zIndex: 10,
      padding: '6px 12px',
      fontSize: '14px',
      cursor: 'pointer'
    });
    document.body.appendChild(this.button);

    this.button.addEventListener('click', () => this.toggle());
  }

  toggle() {
    const visible = !this.controller.trajectoryVisible;
    this.controller.setTrajectoryVisible(visible);
    this.button.textContent = visible
      ? 'Masquer la trajectoire'
      : 'Afficher la trajectoire';
  }
}

