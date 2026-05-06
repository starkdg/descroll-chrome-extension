/**
 * A lightweight analog clock component for the DeScroll new tab page.
 * Uses SVG and CSS for hardware-accelerated rendering.
 */
export class AnalogClock {
    constructor(containerId = 'analog-clock') {
        this.container = document.getElementById(containerId);
        if (!this.container) return;

        this.render();
        this.hourHand = document.getElementById('clock-hour');
        this.minHand = document.getElementById('clock-min');
        this.secHand = document.getElementById('clock-sec');
        
        this.start();
    }

    /**
     * Renders the SVG clock face into the container.
     */
    render() {
        this.container.innerHTML = `
            <svg viewBox="0 0 100 100" class="clock-svg" aria-label="Army Field Watch">
                <defs>
                    <!-- Matte Texture Filter -->
                    <filter id="matte-noise" x="0" y="0" width="100%" height="100%">
                        <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch" />
                        <feColorMatrix type="saturate" values="0" />
                        <feComponentTransfer>
                            <feFuncR type="linear" slope="0.05" />
                            <feFuncG type="linear" slope="0.05" />
                            <feFuncB type="linear" slope="0.05" />
                        </feComponentTransfer>
                        <feBlend in="SourceGraphic" mode="soft-light" />
                    </filter>

                    <!-- Realistic Hand Shadow -->
                    <filter id="hand-shadow" x="-20%" y="-20%" width="150%" height="150%">
                        <feGaussianBlur in="SourceAlpha" stdDeviation="0.8" />
                        <feOffset dx="0.5" dy="0.8" result="offsetblur" />
                        <feComponentTransfer>
                            <feFuncA type="linear" slope="0.6" />
                        </feComponentTransfer>
                        <feMerge>
                            <feMergeNode />
                            <feMergeNode in="SourceGraphic" />
                        </feMerge>
                    </filter>

                    <!-- Bezel Gradient (Gunmetal) -->
                    <linearGradient id="bezel-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" style="stop-color:#444;stop-opacity:1" />
                        <stop offset="50%" style="stop-color:#222;stop-opacity:1" />
                        <stop offset="100%" style="stop-color:#111;stop-opacity:1" />
                    </linearGradient>
                </defs>
                
                <!-- Outer Case (Gunmetal) -->
                <circle cx="50" cy="50" r="49" fill="url(#bezel-grad)" stroke="#000" stroke-width="0.5" />
                
                <!-- Dial Surface (Matte Charcoal) -->
                <circle cx="50" cy="50" r="46" fill="#1b1b1b" filter="url(#matte-noise)" />
                
                <!-- Markings Layer -->
                <g class="markers-group" fill="#fff" font-family="Inter, sans-serif" font-weight="600" text-anchor="middle">
                    ${this.generateFieldMarkers()}
                    ${this.generateNumbers()}
                </g>

                <!-- Hands Layer with Shadows -->
                <g filter="url(#hand-shadow)">
                    <!-- Hour Hand (Sword style) -->
                    <path id="clock-hour" d="M 50 52 L 48.5 50 L 50 18 L 51.5 50 Z" class="hand-sword hour-hand" fill="#eee" stroke="#222" stroke-width="0.5" />
                    <!-- Minute Hand (Sword style) -->
                    <path id="clock-min" d="M 50 52 L 49 50 L 50 10 L 51 50 Z" class="hand-sword min-hand" fill="#eee" stroke="#222" stroke-width="0.5" />
                </g>
                
                <!-- Second Hand (Needle) -->
                <line id="clock-sec" x1="50" y1="55" x2="50" y2="8" class="hand sec-hand" stroke="#ff3b30" stroke-width="0.5" />
                
                <!-- Center Cap -->
                <circle cx="50" cy="50" r="2" fill="#222" />
                <circle cx="50" cy="50" r="0.8" fill="#555" />
            </svg>
        `;
    }

    generateFieldMarkers() {
        let markers = '';
        for (let i = 0; i < 60; i++) {
            const angle = i * 6;
            const isMajor = i % 5 === 0;
            const length = isMajor ? 3 : 1.5;
            const weight = isMajor ? 0.8 : 0.4;
            const r2 = 45;
            const r1 = r2 - length;
            
            const x1 = 50 + r1 * Math.sin((angle * Math.PI) / 180);
            const y1 = 50 - r1 * Math.cos((angle * Math.PI) / 180);
            const x2 = 50 + r2 * Math.sin((angle * Math.PI) / 180);
            const y2 = 50 - r2 * Math.cos((angle * Math.PI) / 180);
            
            markers += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#fff" stroke-width="${weight}" stroke-opacity="${isMajor ? 0.9 : 0.4}" />`;
        }
        return markers;
    }

    generateNumbers() {
        let numbers = '';
        // Main hours 1-12
        for (let i = 1; i <= 12; i++) {
            const angle = i * 30;
            const r = 36;
            const x = 50 + r * Math.sin((angle * Math.PI) / 180);
            const y = 50 - r * Math.cos((angle * Math.PI) / 180) + 2.5; // Offset for font baseline
            numbers += `<text x="${x}" y="${y}" font-size="7" fill-opacity="0.9">${i}</text>`;
            
            // 24h Inner scale (13-24)
            const r24 = 26;
            const x24 = 50 + r24 * Math.sin((angle * Math.PI) / 180);
            const y24 = 50 - r24 * Math.cos((angle * Math.PI) / 180) + 1.5;
            numbers += `<text x="${x24}" y="${y24}" font-size="3.5" fill-opacity="0.5">${i + 12 === 24 ? 0 : i + 12}</text>`;
        }
        return numbers;
    }

    /**
     * Updates the rotation of the clock hands based on current time.
     */
    update() {
        const now = new Date();
        const hrs = now.getHours();
        const mins = now.getMinutes();
        const secs = now.getSeconds();
        const ms = now.getMilliseconds();

        // Calculate rotation degrees
        const hrDeg = (hrs % 12) * 30 + mins / 2;
        const minDeg = mins * 6 + secs / 10;
        // Continuous sweep for the second hand
        const secDeg = (secs * 6) + (ms * 0.006);

        if (this.hourHand) this.hourHand.style.transform = `rotate(${hrDeg}deg)`;
        if (this.minHand) this.minHand.style.transform = `rotate(${minDeg}deg)`;
        if (this.secHand) this.secHand.style.transform = `rotate(${secDeg}deg)`;
    }

    /**
     * Starts the clock interval.
     */
    start() {
        this.update();
        // Update every second to keep the second hand moving
        this.timer = setInterval(() => this.update(), 1000);
    }

    /**
     * Cleans up the interval if the component is destroyed.
     */
    destroy() {
        if (this.timer) clearInterval(this.timer);
    }
}
