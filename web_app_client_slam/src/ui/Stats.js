export class Stats {
    constructor(renderer) {
        this.renderer = renderer;
        this.div = document.createElement('div');
        Object.assign(this.div.style, {
            position: 'absolute', top: '10px', left: '100px',
            backgroundColor: 'rgba(0,0,0,0.5)', color: '#fff',
            padding: '8px', fontFamily: 'sans-serif', fontSize: '12px',
            whiteSpace: 'pre'
        });
        document.body.appendChild(this.div);
        this.pointCount = 0;
        this.currentGPUInfo = "GPU: inconnu";
    }

    update(pointCount) {
        // ---- GPU CHECK À CHAQUE FRAME ----
        try {
            const gl = this.renderer.getContext();
            const ext = gl.getExtension('WEBGL_debug_renderer_info');
            if (ext) {
                const gpu = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL);
                const vendor = gl.getParameter(ext.UNMASKED_VENDOR_WEBGL);
                this.currentGPUInfo = `GPU: ${vendor} | ${gpu}`;
            } else {
                this.currentGPUInfo = `GPU: ${gl.getParameter(gl.RENDERER)}`;
            }
        } catch (e) {
            this.currentGPUInfo = "GPU: erreur de détection";
        }


        this.div.textContent =
            `Points affichés : ${pointCount}\n` +
            `${this.currentGPUInfo}`;
    }


}
