// Animation Loop
export function animate({ renderer, scene, camera, controls, stats, pcController, overlay}) {
  let last = 0;
  function loop(time) {
    stats.begin();
    requestAnimationFrame(loop);
    if (time - last < 1000/60) { stats.end(); return; }
    last = time;
    controls.update();
    renderer.render(scene, camera);

    // Met à jour l'overlay UI
    if (overlay && pcController) {
      overlay.update(pcController.displayCount);
    }

    stats.end();
  }
  requestAnimationFrame(loop);
}
