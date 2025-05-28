import * as THREE from 'three';

export function enablePointDistanceMeasurement(getFullMesh, pickMesh, scene, camera, renderer, pickOriginalIndices) {
    const raycaster = new THREE.Raycaster();
    raycaster.params.Points.threshold = 0.1;
    const mouse   = new THREE.Vector2();
    const pts     = [];
    const markers = [];
    let line, label;

    function cleanup() {
        pts.length = 0;
        if (line)  scene.remove(line);
        line = null;
        if (label) {
            document.body.removeChild(label);
            label = null;
        }
        markers.forEach(m => scene.remove(m));
        markers.length = 0;
    }

    function onClick(e) {
        if (!e.ctrlKey) return;
        e.preventDefault(); e.stopPropagation();

        const rect = renderer.domElement.getBoundingClientRect();
        mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

        raycaster.setFromCamera(mouse, camera);

        const hits = raycaster.intersectObject(pickMesh, true);
        if (hits.length === 0) return;
        if (pts.length >= 2) cleanup();

        const hit     = hits[0];
        const pickIdx = hit.index;                  
        const realIdx = pickOriginalIndices[pickIdx]; 

        const posAttr = getFullMesh().geometry.attributes.position;
        const p       = new THREE.Vector3().fromBufferAttribute(posAttr, realIdx);
        pts.push(p);

        const m = new THREE.Mesh(
            new THREE.SphereGeometry(0.05,16,16),
            new THREE.MeshBasicMaterial({ color:0xffa500, wireframe:true })
        );
        m.position.copy(p);
        m.frustumCulled = false;
        scene.add(m);
        markers.push(m);

        if (pts.length === 2) {
            const geom = new THREE.BufferGeometry().setFromPoints(pts);
            const mat  = new THREE.LineBasicMaterial({ color:0xff0000, linewidth:5 });
            line = new THREE.Line(geom, mat);
            line.frustumCulled = false;
            scene.add(line);

            const d   = pts[0].distanceTo(pts[1]);
            const mid = pts[0].clone().add(pts[1]).multiplyScalar(0.5);
            label = document.createElement('div');
            Object.assign(label.style, {
                position:'absolute', padding:'4px 8px', background:'rgba(0,0,0,0.7)',
                color:'#fff', borderRadius:'4px', fontSize:'12px', pointerEvents:'none'
            });
            label.innerText = d.toFixed(3);
            document.body.appendChild(label);
            const proj = mid.project(camera);
            label.style.left = `${(proj.x*0.5+0.5)*window.innerWidth}px`;
            label.style.top  = `${(-proj.y*0.5+0.5)*window.innerHeight}px`;
        }
    }

    renderer.domElement.addEventListener('click', onClick);

    // Optionnel : auto-cleanup si besoin d’arrêter la mesure plus tard
    return {
        dispose: () => {
            cleanup();
            renderer.domElement.removeEventListener('click', onClick);
        }
    }
}

