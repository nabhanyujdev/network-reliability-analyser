# Network Analyser

A Vite + React tool for simulating network topologies, structural failures, bandwidth bottlenecks, dependency ordering, red-team cluster attacks, and secure node reintegration.

# Live Demo:


## Project Overview

Network Analyser is a web-based computer networks and competitive programming lab project that helps visualize network topology behavior under failure and recovery conditions. The tool combines graph visualization with classic algorithms to demonstrate critical-node detection, boot dependency ordering, bandwidth-aware routing, and adversarial threat modeling.

## Tech Stack

- React
- Vite
- Cytoscape.js
- react-cytoscapejs

## Features

- Interactive topology editing with nodes and capacity-weighted links.
- Node and link failure simulation from the graph canvas.
- Tarjan-based bridge and articulation point detection.
- DSU-based connected component and partition recalculation.
- Binary-search max-min bandwidth path between a selected source and destination.
- Kahn topological sort for safe boot order.
- Red Team mode using Mex, Nim, and Sprague-Grundy values over active partitions.
- RSA-style reintegration handshake using Euler Totient and binary modular exponentiation.

## Algorithms Used

- Tarjan's Algorithm for articulation points and bridges
- Disjoint Set Union (DSU) for connected component tracking
- Kahn's Algorithm for topological boot ordering
- Binary search on capacity thresholds for max-min bandwidth path selection
- Sprague-Grundy theorem, Mex, and XOR for Red Team threat evaluation
- Modular exponentiation and Euler Totient function for RSA-style reintegration simulation

## Run Locally

Make sure Node.js and npm are installed on the system first.

```bash
npm install
npm run dev
```

Then open the local Vite URL printed in the terminal.

## Build

```bash
npm run build
```

## Repository Notes

- `node_modules` is excluded from version control and is recreated with `npm install`.
- `dist` is excluded from version control and is recreated with `npm run build`.
- Hidden project files such as `.gitignore` may not appear in Finder unless hidden files are enabled.

## Main Files

- `src/lib/networkEngine.js` contains the graph model and analytical algorithms.
- `src/components/NetworkDashboard.jsx` contains the Cytoscape-powered UI.
- `src/index.css` contains the full-screen analyzer layout and visual states.

## Interaction Notes

- Click a node to fail it. Click the failed node again to trigger RSA-style reauthentication and restore it.
- Click a link to fail or restore it.
- Use "Load Sample" to seed a topology with bridges, dependency direction, and varied capacities.
- Use "Remove Selected" after selecting a node or link in the graph.

##Screenshot
<img width="1670" height="942" alt="My_Imagepng" src="https://github.com/user-attachments/assets/13fbc3d2-dbfd-4d20-b0b8-3dcb4c89ff23" />

##Future Enhancemnets

- Migrate core algorithm engine to a C++ backend for improved performance and scalability
- Enhance UI with step-by-step visualization of algorithms
- Support larger graph datasets and stress testing
