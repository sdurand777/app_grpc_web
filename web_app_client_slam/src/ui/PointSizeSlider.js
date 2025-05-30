// File: src/PointSizeSlider.js

export function createPointSizeSlider(controller, {
    min = 0.001,
    max = 0.1,
    step = 0.001,
    initial = 0.01,
    container = document.body // ou n’importe où tu veux insérer le slider
} = {}) {
    // Créer les éléments
    const wrapper = document.createElement('div');
    wrapper.style.position = 'absolute';
    wrapper.style.top = '16px';
    wrapper.style.left = '100px';
    wrapper.style.background = 'rgba(255,255,255,0.85)';
    wrapper.style.padding = '8px';
    wrapper.style.borderRadius = '8px';
    wrapper.style.zIndex = '1000';
    wrapper.style.fontFamily = 'sans-serif';
    wrapper.style.boxShadow = '0 2px 8px #0001';

    const label = document.createElement('label');
    label.textContent = 'Taille des points : ';

    const valueDisplay = document.createElement('span');
    valueDisplay.textContent = initial.toFixed(3);

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = min;
    slider.max = max;
    slider.step = step;
    slider.value = initial;

    // Met à jour la taille au changement
    slider.addEventListener('input', () => {
        const val = parseFloat(slider.value);
        controller.setPointSize(val);
        valueDisplay.textContent = val.toFixed(3);
    });

    // Init valeur
    controller.setPointSize(initial);

    // Assemble
    label.appendChild(valueDisplay);
    wrapper.appendChild(label);
    wrapper.appendChild(document.createElement('br'));
    wrapper.appendChild(slider);

    container.appendChild(wrapper);

    // Optionnel : expose pour suppression si besoin
    return {
        wrapper,
        slider,
        destroy() { wrapper.remove(); }
    };
}
