export const NodeState = {
  HEALTHY: 'HEALTHY',
  FAILED: 'FAILED',
  CRITICAL: 'CRITICAL',
  REAUTH: 'REAUTHENTICATING',
};

class DSU {
  constructor(values) {
    this.parent = new Map(values.map((value) => [value, value]));
    this.size = new Map(values.map((value) => [value, 1]));
  }

  find(value) {
    const parent = this.parent.get(value);
    if (parent === value) return value;
    const root = this.find(parent);
    this.parent.set(value, root);
    return root;
  }

  union(a, b) {
    let rootA = this.find(a);
    let rootB = this.find(b);
    if (rootA === rootB) return;

    if (this.size.get(rootA) < this.size.get(rootB)) {
      [rootA, rootB] = [rootB, rootA];
    }

    this.parent.set(rootB, rootA);
    this.size.set(rootA, this.size.get(rootA) + this.size.get(rootB));
  }
}

const cleanName = (name) => String(name || '').trim();
const edgeKey = (source, target) => `${source}~~${target}`;

export class NetworkEngine {
  constructor() {
    this.nodes = new Map();
    this.edges = new Map();
  }

  reset() {
    this.nodes.clear();
    this.edges.clear();
  }

  addNode(name) {
    const id = cleanName(name);
    if (!id || this.nodes.has(id)) return false;
    this.nodes.set(id, { id, state: NodeState.HEALTHY });
    return true;
  }

  removeNode(name) {
    const id = cleanName(name);
    if (!this.nodes.delete(id)) return false;
    [...this.edges.values()].forEach((edge) => {
      if (edge.source === id || edge.target === id) this.edges.delete(edge.id);
    });
    return true;
  }

  addEdge(source, target, capacity = 1000) {
    const from = cleanName(source);
    const to = cleanName(target);
    const bandwidth = Math.max(0, Number(capacity) || 0);
    if (!from || !to || from === to || !this.nodes.has(from) || !this.nodes.has(to)) return false;

    const id = edgeKey(from, to);
    const reverseId = edgeKey(to, from);
    if (this.edges.has(id) || this.edges.has(reverseId)) return false;

    this.edges.set(id, { id, source: from, target: to, capacity: bandwidth, failed: false });
    return true;
  }

  removeEdge(source, target) {
    const direct = edgeKey(cleanName(source), cleanName(target));
    const reverse = edgeKey(cleanName(target), cleanName(source));
    return this.edges.delete(direct) || this.edges.delete(reverse);
  }

  toggleNodeFailure(name) {
    const node = this.nodes.get(cleanName(name));
    if (!node) return null;
    node.state = node.state === NodeState.FAILED ? NodeState.REAUTH : NodeState.FAILED;
    return node.state;
  }

  setNodeState(name, state) {
    const node = this.nodes.get(cleanName(name));
    if (!node) return false;
    node.state = state;
    return true;
  }

  toggleEdgeFailure(id) {
    const edge = this.edges.get(id);
    if (!edge) return null;
    edge.failed = !edge.failed;
    return edge.failed;
  }

  getActiveNodes() {
    return [...this.nodes.values()]
      .filter((node) => node.state !== NodeState.FAILED && node.state !== NodeState.REAUTH)
      .map((node) => node.id);
  }

  getAdjacency() {
    const active = new Set(this.getActiveNodes());
    const adjacency = new Map([...active].map((id) => [id, []]));

    this.edges.forEach((edge) => {
      if (edge.failed || edge.capacity <= 0) return;
      if (!active.has(edge.source) || !active.has(edge.target)) return;
      adjacency.get(edge.source).push({ to: edge.target, id: edge.id, capacity: edge.capacity });
      adjacency.get(edge.target).push({ to: edge.source, id: edge.id, capacity: edge.capacity });
    });

    return adjacency;
  }

  analyzeCriticalComponents() {
    const activeNodes = this.getActiveNodes();
    const adjacency = this.getAdjacency();
    const discovery = new Map();
    const low = new Map();
    const parent = new Map();
    const articulationPoints = new Set();
    const bridges = new Set();
    let time = 0;

    this.nodes.forEach((node) => {
      if (node.state === NodeState.CRITICAL) node.state = NodeState.HEALTHY;
    });

    const dfs = (nodeId) => {
      let children = 0;
      discovery.set(nodeId, ++time);
      low.set(nodeId, discovery.get(nodeId));

      adjacency.get(nodeId).forEach(({ to, id }) => {
        if (!discovery.has(to)) {
          children += 1;
          parent.set(to, nodeId);
          dfs(to);
          low.set(nodeId, Math.min(low.get(nodeId), low.get(to)));

          if (!parent.has(nodeId) && children > 1) articulationPoints.add(nodeId);
          if (parent.has(nodeId) && low.get(to) >= discovery.get(nodeId)) articulationPoints.add(nodeId);
          if (low.get(to) > discovery.get(nodeId)) bridges.add(id);
        } else if (to !== parent.get(nodeId)) {
          low.set(nodeId, Math.min(low.get(nodeId), discovery.get(to)));
        }
      });
    };

    activeNodes.forEach((nodeId) => {
      if (!discovery.has(nodeId)) dfs(nodeId);
    });

    articulationPoints.forEach((nodeId) => this.nodes.get(nodeId).state = NodeState.CRITICAL);
    return { articulationPoints: [...articulationPoints], bridges };
  }

  getConnectedComponents() {
    const activeNodes = this.getActiveNodes();
    const dsu = new DSU(activeNodes);
    const active = new Set(activeNodes);

    this.edges.forEach((edge) => {
      if (!edge.failed && edge.capacity > 0 && active.has(edge.source) && active.has(edge.target)) {
        dsu.union(edge.source, edge.target);
      }
    });

    const groups = new Map();
    activeNodes.forEach((nodeId) => {
      const root = dsu.find(nodeId);
      groups.set(root, [...(groups.get(root) || []), nodeId]);
    });

    return [...groups.values()].sort((a, b) => b.length - a.length);
  }

  getSafeBootSequence() {
    const active = this.getActiveNodes();
    const activeSet = new Set(active);
    const inDegree = new Map(active.map((node) => [node, 0]));
    const outgoing = new Map(active.map((node) => [node, []]));

    this.edges.forEach((edge) => {
      if (edge.failed || !activeSet.has(edge.source) || !activeSet.has(edge.target)) return;
      outgoing.get(edge.source).push(edge.target);
      inDegree.set(edge.target, inDegree.get(edge.target) + 1);
    });

    const queue = active.filter((node) => inDegree.get(node) === 0);
    const order = [];

    while (queue.length) {
      const current = queue.shift();
      order.push(current);
      outgoing.get(current).forEach((next) => {
        inDegree.set(next, inDegree.get(next) - 1);
        if (inDegree.get(next) === 0) queue.push(next);
      });
    }

    return {
      order,
      hasCycle: order.length !== active.length,
      message: order.length === active.length
        ? order.join(' -> ')
        : `Cycle detected. Partial safe order: ${order.join(' -> ') || 'none'}`,
    };
  }

  findMaxBandwidthPath(source, target) {
    const from = cleanName(source);
    const to = cleanName(target);
    if (!this.nodes.has(from) || !this.nodes.has(to)) return null;
    if (from === to) return { capacity: Infinity, path: [from] };

    const capacities = [...new Set([...this.edges.values()]
      .filter((edge) => !edge.failed && edge.capacity > 0)
      .map((edge) => edge.capacity))]
      .sort((a, b) => a - b);

    if (!capacities.length) return null;

    const reachableAt = (minimumCapacity) => {
      const active = new Set(this.getActiveNodes());
      if (!active.has(from) || !active.has(to)) return null;

      const queue = [from];
      const visited = new Set([from]);
      const previous = new Map();

      while (queue.length) {
        const current = queue.shift();
        if (current === to) {
          const path = [];
          let cursor = to;
          while (cursor) {
            path.unshift(cursor);
            cursor = previous.get(cursor);
          }
          return path;
        }

        this.edges.forEach((edge) => {
          if (edge.failed || edge.capacity < minimumCapacity) return;
          const next = edge.source === current ? edge.target : edge.target === current ? edge.source : null;
          if (!next || !active.has(next) || visited.has(next)) return;
          visited.add(next);
          previous.set(next, current);
          queue.push(next);
        });
      }

      return null;
    };

    let left = 0;
    let right = capacities.length - 1;
    let best = null;

    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      const path = reachableAt(capacities[mid]);
      if (path) {
        best = { capacity: capacities[mid], path };
        left = mid + 1;
      } else {
        right = mid - 1;
      }
    }

    return best;
  }

  analyzeRedTeam() {
    const componentSizes = this.getConnectedComponents().map((component) => component.length);
    const memo = new Map([[0, 0]]);

    const mex = (values) => {
      let candidate = 0;
      while (values.has(candidate)) candidate += 1;
      return candidate;
    };

    const grundy = (size) => {
      if (memo.has(size)) return memo.get(size);
      const reachable = new Set();
      for (let removed = 1; removed <= 3 && removed <= size; removed += 1) {
        reachable.add(grundy(size - removed));
      }
      const value = mex(reachable);
      memo.set(size, value);
      return value;
    };

    const values = componentSizes.map(grundy);
    const nimber = values.reduce((xor, value) => xor ^ value, 0);

    return {
      componentSizes,
      grundyValues: values,
      nimber,
      defenderFavored: nimber === 0,
      message: nimber === 0
        ? 'Defender-favored state: every cluster attack has a balancing response.'
        : 'Attacker-favored state: at least one targeted cluster attack changes the parity.',
    };
  }

  simulateSecureHandshake(name) {
    const nodeId = cleanName(name);
    const p = 61n;
    const q = 53n;
    const n = p * q;
    const phi = (p - 1n) * (q - 1n);
    const e = 17n;
    const d = 2753n;
    const challenge = BigInt([...nodeId].reduce((sum, char) => sum + char.charCodeAt(0), 0) % Number(n));
    const signature = this.modPow(challenge, d, n);
    const verified = this.modPow(signature, e, n) === challenge;

    return {
      node: nodeId,
      n: Number(n),
      phi: Number(phi),
      e: Number(e),
      d: Number(d),
      challenge: Number(challenge),
      signature: Number(signature),
      verified,
    };
  }

  modPow(base, exponent, modulus) {
    let result = 1n;
    let cursor = base % modulus;
    let power = exponent;

    while (power > 0n) {
      if (power & 1n) result = (result * cursor) % modulus;
      cursor = (cursor * cursor) % modulus;
      power >>= 1n;
    }

    return result;
  }

  buildElements() {
    const { bridges } = this.analyzeCriticalComponents();
    const components = this.getConnectedComponents();
    const componentByNode = new Map();
    components.forEach((component, index) => {
      component.forEach((nodeId) => componentByNode.set(nodeId, index + 1));
    });

    return [
      ...[...this.nodes.values()].map((node) => ({
        data: {
          id: node.id,
          label: node.id,
          state: node.state,
          component: componentByNode.get(node.id) || 0,
        },
      })),
      ...[...this.edges.values()].map((edge) => ({
        data: {
          id: edge.id,
          source: edge.source,
          target: edge.target,
          capacity: edge.capacity,
          label: `${edge.capacity} Mbps`,
          failed: String(edge.failed),
          bridge: String(bridges.has(edge.id)),
        },
      })),
    ];
  }

  getMetrics() {
    const components = this.getConnectedComponents();
    const failedNodes = [...this.nodes.values()].filter((node) => node.state === NodeState.FAILED).length;
    const failedEdges = [...this.edges.values()].filter((edge) => edge.failed).length;
    const critical = this.analyzeCriticalComponents();

    return {
      nodes: this.nodes.size,
      edges: this.edges.size,
      failedNodes,
      failedEdges,
      partitions: components.length,
      largestPartition: components[0]?.length || 0,
      articulationPoints: critical.articulationPoints.length,
      bridges: critical.bridges.size,
      components,
    };
  }
}
