import childProcess from 'node:child_process';
import { stdin } from 'node:process';

const ROUTER_REGEX = /^\t+router\s+(\S+)(?:\s+metric\s+(\d+))?\s*$/;
const NETWORK_REGEX = /^\t+network\s+(\S+)(?:\s+metric\s+(\d+))?\s*$/;

const ROUTER_START_REGEX = /^\trouter\s+\S+\s*$/;
const NETWORK_START_REGEX = /^\tnetwork\s+\S+\s*$/;

function linesToSets(lines: string[]): {
  nodes: Set<string>,
  edges: Set<[string, string, string]>
} {
  const nodes = new Set<string>();
  const edges = new Set<[string, string, string]>();
  let current: string | null = null;
  for (const line of lines) {
    if (ROUTER_START_REGEX.test(line)) {
      const match = ROUTER_REGEX.exec(line)?.[1];
      if (match) nodes.add(current = match);
      continue;
    }
    if (NETWORK_START_REGEX.test(line)) {
      const match = NETWORK_REGEX.exec(line)?.[1];
      if (match) nodes.add(current = match);
      continue;
    }
    // current router / network in LSA
    let match = ROUTER_REGEX.exec(line);
    if (match && current) {
      const [_ , target, metric] = match;
      if (!target) continue;
      nodes.add(target);
      if (metric) edges.add([current, target, metric]);
      continue;
    }
    match = NETWORK_REGEX.exec(line);
    if (match && current) {
      const [_, target, metric] = match;
      if (!target) continue;
      nodes.add(target);
      if (metric) edges.add([current, target, metric]);
    }
  }
  return { nodes, edges };
}
  
function setsToGraph(nodes: Set<string>, edges: Set<[string, string, string]>) {
  const results = [];
  // generate map
  const undirectedEdges = new Map<string, {
    src: string,
    dst: string,
    metrics: number[]
  }>();
  for (const [src, dst, metric] of edges) {
    const key = [src, dst].sort().join('\0');
    if (!undirectedEdges.has(key)) {
      undirectedEdges.set(key, {
        src: [src, dst].sort()[0]!,
        dst: [src, dst].sort()[1]!,
        metrics: [],
      });
    }
    undirectedEdges.get(key)?.metrics.push(Number(metric));
  }
  // start graph
  results.push('graph ospf_topology {');
  results.push('  graph [layout=neato, overlap=false, splines=true, bgcolor="white"];');
  results.push('  node [fontname="Arial", fontsize=10];');
  results.push('  edge [fontname="Arial", fontsize=9, color="#64748b"];');
  // output nodes
  for (const node of [...nodes].sort()) {
    if (node.startsWith('[')) {
      results.push(`  "${node}" [shape=box, style="rounded,filled", fillcolor="#fef3c7"];`);
    } else {
      results.push(`  "${node}" [shape=ellipse, style="filled", fillcolor="#dbeafe"];`);
    }
  }
  // sort
  const sortedEdges = [...undirectedEdges.values()].sort((a, b) => {
    const left = `${a.src}\0${a.dst}`;
    const right = `${b.src}\0${b.dst}`;
    return left.localeCompare(right);
  });
	// connection lines
  for (const { src, dst, metrics } of sortedEdges) {
    const metric = metrics.reduce((sum, value) => sum + value, 0) / metrics.length;
    const length = Math.max(0.5, Math.min(3.0, 0.4 + metric / 40));
    const label = new Set(metrics).size === 1
      ? String(Math.trunc(metric))
      : metric.toFixed(0);
    results.push(
      `  "${src}" -- "${dst}" ` +
      `[label="${label}", len="${length.toFixed(2)}", weight="1"];`,
    );
  }
  results.push('}');
  return results.join('\n');
};

export default async function (data: string): Promise<Buffer> {
  const { nodes, edges } = linesToSets(data.split(/\r?\n/));
  const graph = setsToGraph(nodes, edges);
  const process = childProcess.spawn('neato', ['-Tpng']);
  process.stdin.end(graph);
  return Buffer.concat(await process.stdout.toArray());
};
