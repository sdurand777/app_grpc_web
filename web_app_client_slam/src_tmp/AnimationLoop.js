// export function animate({ scene, camera, renderer, controls, stats }) {
//   let lastRenderTime = 0;
//   function loop(time) {
//     stats.begin();
//     requestAnimationFrame(loop);
//     if (time - lastRenderTime < 1000 / 60) {
//       stats.end();
//       return;
//     }
//     lastRenderTime = time;
//     controls.update();
//     renderer.render(scene, camera);
//     stats.end();
//   }
//   requestAnimationFrame(loop);
// }

export function animate({ renderer, scene, camera, controls, stats, uiOverlay, pcController, getPacketRate }) {
  let last = 0;
  function loop(time) {
    stats.begin();
    requestAnimationFrame(loop);
    if (time - last < 1000/60) { stats.end(); return; }
    last = time;
    controls.update();
    renderer.render(scene, camera);
    // Met à jour l'overlay UI
    if (uiOverlay && pcController && typeof getPacketRate === 'function') {
      uiOverlay.update(pcController.displayCount, getPacketRate());
    }
    stats.end();
  }
  requestAnimationFrame(loop);
}
