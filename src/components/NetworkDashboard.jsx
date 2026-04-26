import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import CytoscapeComponent from 'react-cytoscapejs';
import { NetworkEngine, NodeState } from '../lib/networkEngine';

const stylesheet = [
  {
    selector: 'node',
    style: {
      label: 'data(label)',
      'background-color': '#1f7a8c',
      color: '#f8fafc',
      'text-outline-color': '#0f172a',
      'text-outline-width': 2,
      'text-valign': 'center',
      'font-size': 12,
      'font-weight': 700,
      width: 58,
      height: 58,
      'border-width': 2,
      'border-color': '#7dd3fc',
    },
  },
  {
    selector: 'node[state = "CRITICAL"]',
    style: { 'background-color': '#dc2626', 'border-color': '#fecaca', 'border-width': 5 },
  },
  {
    selector: 'node[state = "FAILED"]',
    style: { 'background-color': '#475569', 'border-color': '#1e293b', opacity: 0.45 },
  },
  {
    selector: 'node[state = "REAUTHENTICATING"]',
    style: { 'background-color': '#f59e0b', 'border-color': '#fde68a', 'border-width': 5 },
  },
  {
    selector: 'edge',
    style: {
      label: 'data(label)',
      'font-size': 9,
      color: '#a7f3d0',
      'text-background-color': '#0b1120',
      'text-background-opacity': 0.85,
      'text-background-padding': 2,
      width: 3,
      'line-color': '#64748b',
      'target-arrow-shape': 'triangle',
      'target-arrow-color': '#64748b',
      'curve-style': 'bezier',
    },
  },
  {
    selector: 'edge[bridge = "true"]',
    style: { 'line-color': '#facc15', 'target-arrow-color': '#facc15', width: 5, 'line-style': 'dashed' },
  },
  {
    selector: 'edge[failed = "true"]',
    style: { 'line-color': '#334155', 'target-arrow-color': '#334155', opacity: 0.35, 'line-style': 'dotted' },
  },
];

const sampleNodes = ['Gateway', 'Core-A', 'Core-B', 'DB-1', 'API-1', 'Cache-1'];
const sampleEdges = [
  ['Gateway', 'Core-A', 950],
  ['Gateway', 'Core-B', 750],
  ['Core-A', 'Core-B', 600],
  ['Core-A', 'DB-1', 400],
  ['Core-B', 'API-1', 500],
  ['API-1', 'Cache-1', 250],
];

export default function NetworkDashboard() {
  const engineRef = useRef(new NetworkEngine());
  const cyRef = useRef(null);
  const reauthTimeoutsRef = useRef(new Map());
  const engine = engineRef.current;
  const [elements, setElements] = useState([]);
  const [metrics, setMetrics] = useState(engine.getMetrics());
  const [logs, setLogs] = useState(['Analyzer ready. Add topology or load the sample network.']);
  const [insights, setInsights] = useState({
    bootOrder: 'Run boot order analysis to inspect the current dependency startup chain.',
    bandwidthPath: 'Select a source and destination to compute the max-min capacity path.',
    redTeam: 'Red Team mode will evaluate active partitions and cluster pressure.',
    handshake: 'Bring a failed node back online to inspect RSA-style reintegration.',
  });
  const [nodeName, setNodeName] = useState('');
  const [edgeSrc, setEdgeSrc] = useState('');
  const [edgeTgt, setEdgeTgt] = useState('');
  const [capacity, setCapacity] = useState(1000);
  const [pathSrc, setPathSrc] = useState('');
  const [pathTgt, setPathTgt] = useState('');

  const nodeOptions = useMemo(() => [...engine.nodes.keys()], [elements]);

  const log = useCallback((message) => {
    setLogs((prev) => [`${new Date().toLocaleTimeString()}  ${message}`, ...prev].slice(0, 12));
  }, []);

  const refresh = useCallback(() => {
    setElements(engine.buildElements());
    setMetrics(engine.getMetrics());
  }, [engine]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || elements.length === 0) return;

    const viewportWidth = cy.width();
    const topInset = viewportWidth < 640 ? 152 : 96;
    const bottomInset = viewportWidth < 640 ? 24 : 76;
    const layout = cy.layout({
      name: 'cose',
      animate: true,
      animationDuration: 350,
      nodeRepulsion: 9000,
      idealEdgeLength: 130,
      fit: false,
      padding: 32,
    });

    layout.run();
    layout.on('layoutstop', () => {
      cy.fit(undefined, 28);
      cy.panBy({ x: 0, y: topInset - bottomInset });
      cy.minZoom(0.45);
      cy.maxZoom(2);
      if (viewportWidth < 640) {
        cy.zoom(Math.max(cy.minZoom(), cy.zoom() * 0.84));
      }
    });
  }, [elements]);

  useEffect(() => () => {
    reauthTimeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
    reauthTimeoutsRef.current.clear();
  }, []);

  const addNode = () => {
    if (engine.addNode(nodeName)) {
      log(`Node added: ${nodeName}`);
      setNodeName('');
      refresh();
    } else {
      log('Node add ignored: enter a unique non-empty name.');
    }
  };

  const addEdge = () => {
    if (engine.addEdge(edgeSrc, edgeTgt, capacity)) {
      log(`Link added: ${edgeSrc} -> ${edgeTgt} at ${capacity} Mbps`);
      setEdgeSrc('');
      setEdgeTgt('');
      refresh();
    } else {
      log('Link add ignored: use two existing, different nodes and avoid duplicates.');
    }
  };

  const removeSelected = () => {
    const selected = cyRef.current?.$('node:selected, edge:selected') || [];
    if (!selected.length) {
      log('Select a node or link in the graph before removing.');
      return;
    }

    selected.forEach((item) => {
      if (item.isNode()) {
        engine.removeNode(item.id());
        log(`Node removed: ${item.id()}`);
      } else {
        const edge = engine.edges.get(item.id());
        engine.removeEdge(edge.source, edge.target);
        log(`Link removed: ${edge.source} -> ${edge.target}`);
      }
    });
    refresh();
  };

  const loadSample = () => {
    engine.reset();
    sampleNodes.forEach((node) => engine.addNode(node));
    sampleEdges.forEach(([source, target, bandwidth]) => engine.addEdge(source, target, bandwidth));
    setPathSrc('Gateway');
    setPathTgt('Cache-1');
    setInsights((prev) => ({
      ...prev,
      bootOrder: 'Gateway -> Core-A -> Core-B -> DB-1 -> API-1 -> Cache-1',
      bandwidthPath: 'Gateway -> Core-B -> API-1 -> Cache-1 | bottleneck 250 Mbps',
      redTeam: 'Sample topology loaded. Run Red Team mode to evaluate active cluster pressure.',
    }));
    log('Sample topology loaded and previous topology cleared.');
    refresh();
  };

  const clearTopology = () => {
    engine.reset();
    reauthTimeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
    reauthTimeoutsRef.current.clear();
    setPathSrc('');
    setPathTgt('');
    setInsights({
      bootOrder: 'Run boot order analysis to inspect the current dependency startup chain.',
      bandwidthPath: 'Select a source and destination to compute the max-min capacity path.',
      redTeam: 'Red Team mode will evaluate active partitions and cluster pressure.',
      handshake: 'Bring a failed node back online to inspect RSA-style reintegration.',
    });
    setLogs(['Topology cleared. Build a fresh graph or load the sample network.']);
    refresh();
  };

  const runBootSequence = () => {
    const result = engine.getSafeBootSequence();
    setInsights((prev) => ({ ...prev, bootOrder: result.message }));
    log(`Boot order: ${result.message}`);
  };

  const runPathOptimization = () => {
    const result = engine.findMaxBandwidthPath(pathSrc, pathTgt);
    if (!result) {
      setInsights((prev) => ({
        ...prev,
        bandwidthPath: `No active route between ${pathSrc || 'source'} and ${pathTgt || 'destination'}.`,
      }));
      log(`No active path found between ${pathSrc || '?'} and ${pathTgt || '?'}.`);
      return;
    }
    setInsights((prev) => ({
      ...prev,
      bandwidthPath: `${result.path.join(' -> ')} | bottleneck ${result.capacity} Mbps`,
    }));
    log(`Max-min path: ${result.path.join(' -> ')} | bottleneck ${result.capacity} Mbps`);
  };

  const runRedTeam = () => {
    const result = engine.analyzeRedTeam();
    setInsights((prev) => ({
      ...prev,
      redTeam: `${result.message} Sprague-Grundy values [${result.grundyValues.join(', ')}], xor ${result.nimber}.`,
    }));
    log(`Red Team: ${result.message} SG=[${result.grundyValues.join(', ')}], xor=${result.nimber}`);
  };

  const setupListeners = (cy) => {
    cyRef.current = cy;
    cy.removeAllListeners();

    cy.on('tap', 'node', (event) => {
      const nodeId = event.target.id();
      const nextState = engine.toggleNodeFailure(nodeId);

      if (nextState === NodeState.FAILED) {
        setInsights((prev) => ({
          ...prev,
          handshake: `${nodeId} is offline. Tap again to run secure reintegration.`,
        }));
        log(`Node failed: ${nodeId}. DSU partitions recalculated.`);
        refresh();
        return;
      }

      const handshake = engine.simulateSecureHandshake(nodeId);
      setInsights((prev) => ({
        ...prev,
        handshake: `${nodeId} reauthenticating. RSA verified=${handshake.verified}, n=${handshake.n}, phi=${handshake.phi}.`,
      }));
      log(`Reauth ${nodeId}: RSA verified=${handshake.verified}, n=${handshake.n}, phi=${handshake.phi}`);
      refresh();

      const existingTimeout = reauthTimeoutsRef.current.get(nodeId);
      if (existingTimeout) window.clearTimeout(existingTimeout);

      const timeoutId = window.setTimeout(() => {
        engine.setNodeState(nodeId, NodeState.HEALTHY);
        reauthTimeoutsRef.current.delete(nodeId);
        setInsights((prev) => ({
          ...prev,
          handshake: `${nodeId} completed secure reintegration and returned to healthy state.`,
        }));
        log(`Node restored: ${nodeId} completed secure reintegration.`);
        refresh();
      }, 650);
      reauthTimeoutsRef.current.set(nodeId, timeoutId);
    });

    cy.on('tap', 'edge', (event) => {
      const failed = engine.toggleEdgeFailure(event.target.id());
      const edge = engine.edges.get(event.target.id());
      log(`${failed ? 'Link failed' : 'Link restored'}: ${edge.source} -> ${edge.target}. DSU partitions recalculated.`);
      refresh();
    });
  };

  return (
    <main className="dashboard">
      <header className="toolbar">
        <div className="brand">
          <div>
            <h1>Network Analyser</h1>
            <p>Structural vulnerability, bandwidth, dependency, and threat simulation</p>
          </div>
        </div>
        <div className="project-meta">
          <strong>CP LAB PROJECT</strong>
          <span>TEAM MEMBERS:</span>
          <span>NABHANYU, PRAKHAR, MANVEER</span>
        </div>
        <div className="toolbar-actions">
          <button className="primary-btn" onClick={loadSample}>Load Sample</button>
          <button className="ghost-btn" onClick={clearTopology}>Reset</button>
        </div>
      </header>

      <section className="workbench">
        <section className="graph-wrap" data-testid="graph-surface">
          <div className="graph-status">
            <Metric label="Nodes" value={metrics.nodes} compact />
            <Metric label="Links" value={metrics.edges} compact />
            <Metric label="Partitions" value={metrics.partitions} compact />
            <Metric label="Critical" value={metrics.articulationPoints} compact />
          </div>
          <div className="legend">
            <Legend color="#0f766e" label="Healthy" />
            <Legend color="#dc2626" label="Critical AP" />
            <Legend color="#facc15" label="Bridge" />
            <Legend color="#64748b" label="Failed" />
            <Legend color="#f59e0b" label="Re-auth" />
          </div>
          <CytoscapeComponent
            elements={elements}
            style={{ width: '100%', height: '100%' }}
            layout={{ name: 'preset' }}
            stylesheet={stylesheet}
            cy={setupListeners}
          />
          {elements.length === 0 && (
            <div className="empty-state">
              <strong>No topology loaded</strong>
              <span>Load the demo network or add routers from the topology panel.</span>
              <button className="primary-btn" onClick={loadSample}>Load Sample Network</button>
            </div>
          )}
        </section>

        <aside className="panel controls">
          <ControlGroup title="Topology">
            <div className="inline">
              <input data-testid="node-input" placeholder="Node name" value={nodeName} onChange={(event) => setNodeName(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && addNode()} />
              <button onClick={addNode}>Add</button>
            </div>
            <div className="grid-3">
              <input data-testid="source-input" placeholder="Source" value={edgeSrc} onChange={(event) => setEdgeSrc(event.target.value)} />
              <input data-testid="target-input" placeholder="Target" value={edgeTgt} onChange={(event) => setEdgeTgt(event.target.value)} />
              <input aria-label="Capacity Mbps" type="number" min="0" value={capacity} onChange={(event) => setCapacity(event.target.value)} />
            </div>
            <button onClick={addEdge}>Connect Link</button>
            <button className="ghost-btn" onClick={removeSelected}>Remove Selected</button>
          </ControlGroup>

          <ControlGroup title="Analysis">
            <button onClick={runBootSequence}>Topological Boot Order</button>
            <div className="grid-2">
              <select value={pathSrc} onChange={(event) => setPathSrc(event.target.value)}>
                <option value="">Source</option>
                {nodeOptions.map((node) => <option key={node} value={node}>{node}</option>)}
              </select>
              <select value={pathTgt} onChange={(event) => setPathTgt(event.target.value)}>
                <option value="">Destination</option>
                {nodeOptions.map((node) => <option key={node} value={node}>{node}</option>)}
              </select>
            </div>
            <button onClick={runPathOptimization}>Optimize Bandwidth Path</button>
            <button className="danger-btn" onClick={runRedTeam}>Red Team Mode</button>
          </ControlGroup>

          <ControlGroup title="Network State">
            <Metric label="Nodes" value={metrics.nodes} />
            <Metric label="Links" value={metrics.edges} />
            <Metric label="Partitions" value={metrics.partitions} />
            <Metric label="Largest Partition" value={metrics.largestPartition} />
            <Metric label="Articulation Points" value={metrics.articulationPoints} />
            <Metric label="Bridges" value={metrics.bridges} />
            <Metric label="Failed Nodes" value={metrics.failedNodes} />
            <Metric label="Failed Links" value={metrics.failedEdges} />
          </ControlGroup>
        </aside>

        <aside className="panel terminal">
          <h2>Analysis Readout</h2>
          <div className="readout-grid">
            <ReadoutCard title="Boot Sequence" value={insights.bootOrder} />
            <ReadoutCard title="Bandwidth Path" value={insights.bandwidthPath} />
            <ReadoutCard title="Threat Model" value={insights.redTeam} />
            <ReadoutCard title="Reintegration" value={insights.handshake} />
          </div>
          <h2>Event Log</h2>
          <div className="partition-list">
            {metrics.components.map((component, index) => (
              <div key={component.join('-')} className="partition">
                <span>Partition {index + 1}</span>
                <strong>{component.join(', ')}</strong>
              </div>
            ))}
          </div>
          <div className="log-list">
            {logs.map((entry, index) => (
              <div key={`${entry}-${index}`} className={index === 0 ? 'log active' : 'log'}>{entry}</div>
            ))}
          </div>
        </aside>
      </section>
    </main>
  );
}

function ControlGroup({ title, children }) {
  return (
    <section className="control-group">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function Metric({ label, value, compact = false }) {
  return (
    <div className={compact ? 'metric compact' : 'metric'}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Legend({ color, label }) {
  return (
    <div className="legend-item">
      <span style={{ background: color }} />
      {label}
    </div>
  );
}

function ReadoutCard({ title, value }) {
  return (
    <div className="readout-card">
      <span>{title}</span>
      <strong>{value}</strong>
    </div>
  );
}
