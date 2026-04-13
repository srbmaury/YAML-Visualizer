/**
 * SVG Export Utility
 * Handles exporting SVG diagrams as SVG files
 */
export const exportDiagramAsSVG = (svgElement, filename = "diagram.svg") => {
    if (!svgElement) {
        return;
    }
    try {
        // Clone the SVG node to avoid mutating the DOM
        const svgClone = svgElement.cloneNode(true);
        svgClone.removeAttribute('style');

        // Force a white background
        const bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        bgRect.setAttribute('width', '100%');
        bgRect.setAttribute('height', '100%');
        bgRect.setAttribute('fill', '#fff');
        svgClone.insertBefore(bgRect, svgClone.firstChild);

        // Embed DiagramViewer styles for nodes, text, etc.
        const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
        style.textContent = `
      .node-box { fill: #fff; stroke: #4a5568; stroke-width: 2; }
      .node-name { font-family: -apple-system,BlinkMacSystemFont,'Segoe UI','Inter','Roboto','Helvetica Neue',Arial,sans-serif; font-size: 15px; font-weight: 600; fill: #1e293b; }
      .node-separator { stroke: #cbd5e1; stroke-width: 1.5; }
      .expand-icon .icon-circle { fill: #2563eb; stroke: #1e40af; stroke-width: 2.5; }
      .expand-icon .icon-text { fill: #fff; font-size: 20px; font-weight: bold; }
      .node-property { font-family: 'SF Mono','Monaco','Menlo','Consolas','Courier New',monospace; font-size: 13px; fill: #0ea5e9; }
      .prop-key { fill: #64748b; font-weight: 600; }
      .prop-value { fill: #0ea5e9; font-weight: 500; }
      .link { stroke: #64748b; stroke-width: 2.5; fill: none; opacity: 0.85; }
    `;
        svgClone.insertBefore(style, svgClone.firstChild.nextSibling);

        // Set all text elements to dark color for clarity
        svgClone.querySelectorAll('text').forEach(t => t.setAttribute('fill', '#1e293b'));

        // Serialize SVG
        const serializer = new XMLSerializer();
        let source = serializer.serializeToString(svgClone);
        if (!source.match(/^<svg[^>]+xmlns="http:\/\/www.w3.org\/2000\/svg"/)) {
            source = source.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
        }
        if (!source.startsWith('<?xml')) {
            source = '<?xml version="1.0" standalone="no"?>\r\n' + source;
        }
        const url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(source);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    } catch (err) {
        alert('Failed to export SVG: ' + err.message);
    }
};
/**
 * PNG Export Utility
 * Handles converting SVG diagrams to PNG images
 */

export const exportDiagramAsPNG = (svgElement, filename = null, treeData = null) => {
    if (!svgElement) {
        return;
    }


    try {
        // Create a copy of the SVG for export
        const svgClone = svgElement.cloneNode(true);
        svgClone.removeAttribute('style');

        // Force a white background
        const bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        bgRect.setAttribute('width', '100%');
        bgRect.setAttribute('height', '100%');
        bgRect.setAttribute('fill', '#fff');
        svgClone.insertBefore(bgRect, svgClone.firstChild);

        // Embed DiagramViewer styles for nodes, text, etc.
        const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
        style.textContent = `
      .node-box { fill: #fff; stroke: #4a5568; stroke-width: 2; }
      .node-name { font-family: -apple-system,BlinkMacSystemFont,'Segoe UI','Inter','Roboto','Helvetica Neue',Arial,sans-serif; font-size: 15px; font-weight: 600; fill: #1e293b; }
      .node-separator { stroke: #cbd5e1; stroke-width: 1.5; }
      .expand-icon .icon-circle { fill: #2563eb; stroke: #1e40af; stroke-width: 2.5; }
      .expand-icon .icon-text { fill: #fff; font-size: 20px; font-weight: bold; }
      .node-property { font-family: 'SF Mono','Monaco','Menlo','Consolas','Courier New',monospace; font-size: 13px; fill: #0ea5e9; }
      .prop-key { fill: #64748b; font-weight: 600; }
      .prop-value { fill: #0ea5e9; font-weight: 500; }
      .link { stroke: #64748b; stroke-width: 2.5; fill: none; opacity: 0.85; }
    `;
        svgClone.insertBefore(style, svgClone.firstChild.nextSibling);

        // Set all text elements to dark color for clarity
        svgClone.querySelectorAll('text').forEach(t => t.setAttribute('fill', '#1e293b'));

        // Get the main content group and calculate proper bounds
        const mainGroup = svgClone.querySelector('g');
        if (!mainGroup) {
            alert('No diagram content found to export');
            return;
        }

        let width, height, minX = 0, minY = 0;

        // Use tree data to calculate optimal dimensions if available
        if (treeData && treeData.levels) {
            const HORIZONTAL_SPACING = 400; // Same as treeBuilder.js
            const VERTICAL_BASE_SPACING = 120; // Same as treeBuilder.js
            const MIN_NODE_HEIGHT = 40;
            const BASE_NODE_WIDTH = 200;

            // Find maximum nodes in any level
            let maxNodesInLevel = 0;
            let totalLevels = 0;

            treeData.levels.forEach((nodes, level) => {
                maxNodesInLevel = Math.max(maxNodesInLevel, nodes.length);
                totalLevels = Math.max(totalLevels, level + 1);
            });

            // Calculate dimensions based on tree structure
            const estimatedWidth = (totalLevels * HORIZONTAL_SPACING) + BASE_NODE_WIDTH + 200; // Add padding
            const estimatedHeight = (maxNodesInLevel * (MIN_NODE_HEIGHT + VERTICAL_BASE_SPACING)) + 200; // Add padding

            width = Math.max(800, estimatedWidth); // Minimum reasonable width
            height = Math.max(600, estimatedHeight); // Minimum reasonable height

        } else {
            // Fallback to content-based calculation
            const allElements = svgClone.querySelectorAll('circle, rect, line, path, text');
            let maxX = -Infinity, maxY = -Infinity;
            minX = Infinity;
            minY = Infinity;

            allElements.forEach(element => {
                try {
                    const rect = element.getBBox();
                    if (rect.width > 0 && rect.height > 0) {
                        minX = Math.min(minX, rect.x);
                        minY = Math.min(minY, rect.y);
                        maxX = Math.max(maxX, rect.x + rect.width);
                        maxY = Math.max(maxY, rect.y + rect.height);
                    }
                } catch {
                    // Skip elements that can't provide bounding box
                }
            });

            // Fallback to reasonable defaults if no bounds found
            if (minX === Infinity) {
                minX = minY = 0;
                maxX = 800;
                maxY = 600;
            }

            const padding = 100;
            width = (maxX - minX) + padding * 2;
            height = (maxY - minY) + padding * 2;
        }

        // Set proper dimensions and viewBox for the clone based on calculated size
        svgClone.setAttribute('width', width);
        svgClone.setAttribute('height', height);

        // For tree-based sizing, center the content properly
        if (treeData && treeData.levels) {
            svgClone.setAttribute('viewBox', `0 0 ${width} ${height}`);
        } else {
            // Use content bounds for viewBox
            const padding = 100;
            svgClone.setAttribute('viewBox', `${minX - padding} ${minY - padding} ${width} ${height}`);
        }


        // Remove grid pattern, background rectangles, and guide lines for a clean PNG
        const defs = svgClone.querySelector('defs');
        if (defs) defs.remove();
        svgClone.querySelectorAll('rect[fill*="grid"], rect[fill*="pattern"], rect[fill*="#f1f5f9"], rect[fill^="url("], .guide-line').forEach(el => el.remove());

        // Enhance text readability with dark text
        const textElements = svgClone.querySelectorAll('text');
        textElements.forEach(text => {
            // Make text dark for readability on white node backgrounds
            text.setAttribute('fill', '#1f2937'); // Dark gray text
            text.setAttribute('font-size', '14px');
            text.setAttribute('font-family', 'Arial, sans-serif');
            text.setAttribute('font-weight', 'bold');
            // Remove any existing effects
            text.removeAttribute('stroke');
            text.removeAttribute('stroke-width');
            text.removeAttribute('paint-order');
            text.removeAttribute('filter');
        });

        // Enhance connection visibility with better contrast
        const connections = svgClone.querySelectorAll('line, path');
        connections.forEach(conn => {
            conn.setAttribute('stroke', '#475569'); // Medium gray for good contrast on white
            conn.setAttribute('stroke-width', '2');
            conn.setAttribute('fill', 'none');
        });

        // Enhance node visibility with white backgrounds
        const circles = svgClone.querySelectorAll('circle');
        circles.forEach(circle => {
            circle.setAttribute('stroke', '#374151'); // Dark gray stroke
            circle.setAttribute('stroke-width', '2');
            // Set white background for nodes
            circle.setAttribute('fill', '#ffffff'); // White node background
        });

        const rects = svgClone.querySelectorAll('rect');
        // Skip the first rect (background), style all others as node boxes
        rects.forEach((rect, idx) => {
            if (idx === 0) return; // First rect is the white background
            rect.setAttribute('stroke', '#374151'); // Dark gray stroke
            rect.setAttribute('stroke-width', '2');
            rect.setAttribute('fill', '#ffffff'); // White node background
        });

        // Add proper XML namespace and DOCTYPE
        svgClone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        svgClone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');

        // Serialize SVG to string with proper XML declaration
        const serializer = new XMLSerializer();
        const svgString = serializer.serializeToString(svgClone);
        const svgData = '<?xml version="1.0" encoding="UTF-8"?>' + svgString;

        // Create canvas and draw SVG using data URL
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        // Use moderate resolution for good quality without excessive zoom
        const scale = 2;
        canvas.width = width * scale;
        canvas.height = height * scale;
        ctx.scale(scale, scale);

        // Enable anti-aliasing for smoother rendering
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        // Create data URL from SVG (avoids CORS issues)
        const svgDataUrl = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));

        const img = new Image();
        img.onload = () => {
            try {
                // Set light blue-gray background to match dotted pattern
                ctx.fillStyle = '#f1f5f9'; // Light blue-gray background
                ctx.fillRect(0, 0, width, height);

                // Draw the SVG
                ctx.drawImage(img, 0, 0);

                // Convert to PNG and download
                canvas.toBlob((blob) => {
                    if (blob) {
                        const url = URL.createObjectURL(blob);
                        const link = document.createElement('a');
                        link.href = url;
                        const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
                        link.download = filename || `yaml-diagram-${timestamp}.png`;
                        link.click();


                        // Cleanup
                        URL.revokeObjectURL(url);
                    } else {
                        console.error('Failed to create blob from canvas');
                        alert('Failed to export PNG. Please try again.');
                    }
                }, 'image/png');
            } catch (canvasError) {
                console.error('Canvas drawing error:', canvasError);
                alert('Failed to export PNG. Please try again.');
            }
        };

        img.onerror = (error) => {
            console.error('Error loading SVG image:', error);
            alert('Failed to export PNG. Please try again.');
        };

        // Set crossOrigin before setting src to avoid CORS issues
        img.crossOrigin = 'anonymous';
        img.src = svgDataUrl;

    } catch (error) {
        console.error('Error exporting PNG:', error);
        alert('Failed to export PNG. Please try again.');
    }
};

export const exportCurrentDiagram = () => {
    // Find the diagram SVG element
    const svgElement = document.querySelector('.diagram-svg');
    if (svgElement) {
        exportDiagramAsPNG(svgElement);
    } else {
        alert('No diagram found to export. Please create a diagram first.');
    }
};