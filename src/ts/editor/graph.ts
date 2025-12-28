// Visual story graph using Cytoscape.js

import type { Page, GraphNode, GraphEdge } from '../types';
import { parsePageId } from '../shared/utils';

declare const cytoscape: (options: unknown) => CytoscapeInstance;

interface CytoscapeInstance {
  on(event: string, selector: string, handler: (event: unknown) => void): void;
  on(event: string, handler: (event: unknown) => void): void;
  destroy(): void;
  fit(padding?: number): void;
  zoom(level?: number): number;
  pan(position?: { x: number; y: number }): { x: number; y: number };
  center(): void;
  layout(options: unknown): { run(): void };
  nodes(): { length: number };
  getElementById(id: string): { select(): void };
}

/**
 * Build graph data from pages
 */
export function buildGraphData(
  pages: Record<string, Page>
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  // Find reachable pages from page 1
  const queue = ['1'];
  const reachable = new Set<string>();

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (reachable.has(current) || !pages[current]) continue;

    reachable.add(current);
    const page = pages[current];

    if (page.hasChoices && !page.isEnding) {
      for (const choice of page.choices) {
        const parsed = parsePageId(current);
        if (!parsed) continue;

        const nextNum = parsed.num + 1;
        const targetId = choice.goto || `${nextNum}${parsed.path}${choice.letter}`;

        if (pages[targetId]) {
          queue.push(targetId);
        }
      }
    } else if (!page.isEnding) {
      const parsed = parsePageId(current);
      if (parsed) {
        const nextId = `${parsed.num + 1}${parsed.path}`;
        if (pages[nextId]) {
          queue.push(nextId);
        }
      }
    }
  }

  // Create nodes
  for (const [id, page] of Object.entries(pages)) {
    let type: GraphNode['type'] = 'normal';

    if (page.isEnding) {
      type = 'ending';
    } else if (page.hasChoices) {
      type = 'choice';
    } else if (!reachable.has(id)) {
      type = 'orphan';
    }

    nodes.push({
      id,
      label: id,
      type
    });
  }

  // Create edges
  for (const [id, page] of Object.entries(pages)) {
    if (page.isEnding) continue;

    const parsed = parsePageId(id);
    if (!parsed) continue;

    if (page.hasChoices) {
      for (const choice of page.choices) {
        if (!choice.text.trim()) continue;

        const nextNum = parsed.num + 1;
        const targetId = choice.goto || `${nextNum}${parsed.path}${choice.letter}`;

        if (pages[targetId]) {
          edges.push({
            source: id,
            target: targetId,
            label: choice.letter
          });
        }
      }
    } else {
      // Continue edge
      const nextId = `${parsed.num + 1}${parsed.path}`;
      if (pages[nextId]) {
        edges.push({
          source: id,
          target: nextId
        });
      }
    }
  }

  return { nodes, edges };
}

/**
 * Create Cytoscape graph instance
 */
export function createGraph(
  container: HTMLElement,
  pages: Record<string, Page>,
  onNodeClick: (pageId: string) => void
): CytoscapeInstance | null {
  if (typeof cytoscape === 'undefined') {
    console.error('Cytoscape.js not loaded');
    return null;
  }

  const { nodes, edges } = buildGraphData(pages);

  // Convert to Cytoscape format
  const elements = [
    ...nodes.map(node => ({
      data: {
        id: node.id,
        label: node.label,
        type: node.type
      },
      classes: node.type
    })),
    ...edges.map(edge => ({
      data: {
        id: `${edge.source}-${edge.target}`,
        source: edge.source,
        target: edge.target,
        label: edge.label || ''
      }
    }))
  ];

  const cy = cytoscape({
    container,
    elements,
    style: [
      {
        selector: 'node',
        style: {
          'label': 'data(label)',
          'text-valign': 'center',
          'text-halign': 'center',
          'background-color': '#444',
          'color': '#fff',
          'font-size': '12px',
          'width': '40px',
          'height': '40px',
          'border-width': '2px',
          'border-color': '#666'
        }
      },
      {
        selector: 'node.choice',
        style: {
          'background-color': '#2a3a4a',
          'border-color': '#8ac',
          'shape': 'diamond',
          'width': '50px',
          'height': '50px'
        }
      },
      {
        selector: 'node.ending',
        style: {
          'background-color': '#4a3a2a',
          'border-color': '#ca8',
          'shape': 'octagon'
        }
      },
      {
        selector: 'node.orphan',
        style: {
          'background-color': '#3a2a2a',
          'border-color': '#a66',
          'border-style': 'dashed'
        }
      },
      {
        selector: 'node:selected',
        style: {
          'background-color': '#5a8a5a',
          'border-color': '#8c8',
          'border-width': '3px'
        }
      },
      {
        selector: 'edge',
        style: {
          'width': 2,
          'line-color': '#555',
          'target-arrow-color': '#555',
          'target-arrow-shape': 'triangle',
          'curve-style': 'bezier',
          'label': 'data(label)',
          'font-size': '10px',
          'color': '#888',
          'text-background-color': '#1a1a1a',
          'text-background-opacity': 1,
          'text-background-padding': '2px'
        }
      },
      {
        selector: 'edge:selected',
        style: {
          'line-color': '#8a8',
          'target-arrow-color': '#8a8',
          'width': 3
        }
      }
    ],
    layout: {
      name: 'dagre',
      rankDir: 'TB',
      nodeSep: 50,
      rankSep: 80,
      fit: true,
      padding: 30
    },
    minZoom: 0.2,
    maxZoom: 3,
    wheelSensitivity: 0.3
  }) as CytoscapeInstance;

  // Handle node clicks
  cy.on('tap', 'node', (event: unknown) => {
    const nodeId = (event as { target: { id(): string } }).target.id();
    onNodeClick(nodeId);
  });

  // Run layout
  if (cy.nodes().length > 0) {
    try {
      cy.layout({
        name: 'dagre',
        rankDir: 'TB',
        nodeSep: 50,
        rankSep: 80,
        fit: true,
        padding: 30
      }).run();
    } catch (e) {
      // Fallback to grid layout if dagre fails
      cy.layout({
        name: 'grid',
        fit: true,
        padding: 30
      }).run();
    }
  }

  return cy;
}

/**
 * Update graph with new data
 */
export function updateGraph(
  cy: CytoscapeInstance,
  _pages: Record<string, Page>
): void {
  // For now, just rebuild the graph
  // In a more sophisticated implementation, we'd diff and update
  cy.destroy();
}

/**
 * Highlight a specific node
 */
export function highlightNode(cy: CytoscapeInstance, pageId: string): void {
  cy.getElementById(pageId).select();
}

/**
 * Fit graph to view
 */
export function fitGraph(cy: CytoscapeInstance, padding: number = 30): void {
  cy.fit(padding);
}

/**
 * Export graph as image
 */
export function exportGraphAsImage(_cy: CytoscapeInstance, _format: 'png' | 'jpg' = 'png'): string {
  // Note: This requires the cy.png() or cy.jpg() methods which may not be available
  // in the base Cytoscape package. Would need cytoscape-svg or similar extension.
  console.warn('Graph export requires additional Cytoscape extensions');
  return '';
}

/**
 * Create graph panel UI
 */
export function createGraphPanel(
  onClose: () => void,
  _onNodeClick: (pageId: string) => void
): HTMLElement {
  const panel = document.createElement('div');
  panel.className = 'graph-panel';
  panel.innerHTML = `
    <div class="graph-header">
      <h3>Story Graph</h3>
      <div class="graph-controls">
        <button id="graph-fit" title="Fit to view">Fit</button>
        <button id="graph-zoom-in" title="Zoom in">+</button>
        <button id="graph-zoom-out" title="Zoom out">-</button>
        <button class="close-btn" title="Close">×</button>
      </div>
    </div>
    <div class="graph-legend">
      <span class="legend-item"><span class="legend-dot normal"></span> Normal</span>
      <span class="legend-item"><span class="legend-dot choice"></span> Choice</span>
      <span class="legend-item"><span class="legend-dot ending"></span> Ending</span>
      <span class="legend-item"><span class="legend-dot orphan"></span> Orphan</span>
    </div>
    <div class="graph-container" id="graph-container"></div>
  `;

  const closeBtn = panel.querySelector('.close-btn') as HTMLButtonElement;
  closeBtn.onclick = onClose;

  return panel;
}

/**
 * Initialize graph with controls
 */
export function initGraphPanel(
  panel: HTMLElement,
  pages: Record<string, Page>,
  onNodeClick: (pageId: string) => void
): CytoscapeInstance | null {
  const container = panel.querySelector('#graph-container') as HTMLElement;
  if (!container) return null;

  const cy = createGraph(container, pages, onNodeClick);
  if (!cy) return null;

  const fitBtn = panel.querySelector('#graph-fit') as HTMLButtonElement;
  const zoomInBtn = panel.querySelector('#graph-zoom-in') as HTMLButtonElement;
  const zoomOutBtn = panel.querySelector('#graph-zoom-out') as HTMLButtonElement;

  fitBtn.onclick = () => cy.fit(30);
  zoomInBtn.onclick = () => cy.zoom(cy.zoom() * 1.2);
  zoomOutBtn.onclick = () => cy.zoom(cy.zoom() * 0.8);

  return cy;
}

/**
 * Get graph statistics
 */
export function getGraphStats(pages: Record<string, Page>): {
  totalNodes: number;
  totalEdges: number;
  endings: number;
  orphans: number;
  maxDepth: number;
} {
  const { nodes, edges } = buildGraphData(pages);

  return {
    totalNodes: nodes.length,
    totalEdges: edges.length,
    endings: nodes.filter(n => n.type === 'ending').length,
    orphans: nodes.filter(n => n.type === 'orphan').length,
    maxDepth: calculateMaxDepth(pages)
  };
}

/**
 * Calculate maximum depth of the story tree
 */
function calculateMaxDepth(pages: Record<string, Page>): number {
  let maxDepth = 0;

  for (const id of Object.keys(pages)) {
    const parsed = parsePageId(id);
    if (parsed) {
      maxDepth = Math.max(maxDepth, parsed.num);
    }
  }

  return maxDepth;
}
