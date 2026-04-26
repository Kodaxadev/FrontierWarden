import { useEffect, useRef } from 'react'
import Graph from 'graphology'
import Sigma from 'sigma'
import { useStore } from '../../store'
import { SYSTEMS, EDGES } from '../../data/topology'
import { threatColor, threatLevel } from '../../types'

const NODE_SIZE = 8
const HISEC_DIM  = '#2a4a6a'
const LOWSEC_DIM = '#4a3a1a'
const NULL_DIM   = '#1a3a1a'

function secColor(sec: string): string {
  if (sec === 'hisec')  return HISEC_DIM
  if (sec === 'lowsec') return LOWSEC_DIM
  return NULL_DIM
}

const THREAT_SIZE: Record<string, number> = {
  hostile:   NODE_SIZE * 2.0,
  camped:    NODE_SIZE * 1.6,
  contested: NODE_SIZE * 1.4,
  clear:     NODE_SIZE * 1.2,
  unknown:   NODE_SIZE,
}

export default function StarMap() {
  const containerRef  = useRef<HTMLDivElement>(null)
  const sigmaRef      = useRef<Sigma | null>(null)
  const graphRef      = useRef<Graph | null>(null)

  const selectedSystem = useStore((s) => s.selectedSystem)
  const selectSystem   = useStore((s) => s.selectSystem)
  const systemIntel    = useStore((s) => s.systemIntel)
  const fetchIntel     = useStore((s) => s.fetchIntel)

  // Build graph once on mount
  useEffect(() => {
    if (!containerRef.current) return

    const graph = new Graph({ multi: false, type: 'undirected' })
    graphRef.current = graph

    for (const sys of SYSTEMS) {
      graph.addNode(sys.id, {
        x:     sys.x,
        y:     sys.y,
        label: sys.label,
        size:  NODE_SIZE,
        color: secColor(sys.security),
        // store security for later color reset
        _sec:  sys.security,
      })
    }

    for (const edge of EDGES) {
      if (graph.hasNode(edge.source) && graph.hasNode(edge.target)) {
        graph.addEdge(edge.source, edge.target, { color: '#1a2a3a', size: 1 })
      }
    }

    const renderer = new Sigma(graph, containerRef.current, {
      renderEdgeLabels:     false,
      defaultEdgeColor:     '#1a2a3a',
      defaultNodeColor:     NULL_DIM,
      labelColor:           { color: '#7a9aaa' },
      labelSize:            10,
      labelFont:            'Share Tech Mono, monospace',
      labelDensity:         0.5,
      labelGridCellSize:    60,
      animateZoom:          true,
    })

    renderer.on('clickNode', ({ node }) => {
      selectSystem(node as string)
    })

    renderer.on('clickStage', () => {
      selectSystem(null)
    })

    sigmaRef.current = renderer

    // Batch-fetch intel for all known systems so the map colors up on load.
    // Fire-and-forget — failures are swallowed inside fetchIntel.
    for (const sys of SYSTEMS) {
      fetchIntel(sys.id)
    }

    return () => {
      renderer.kill()
      sigmaRef.current = null
      graphRef.current  = null
    }
  }, [selectSystem, fetchIntel])

  // Update node color + size when intel arrives for any system
  useEffect(() => {
    const graph = graphRef.current
    if (!graph) return

    for (const sys of SYSTEMS) {
      if (!graph.hasNode(sys.id)) continue
      const intel = systemIntel[sys.id]
      const level = threatLevel(intel)
      graph.setNodeAttribute(sys.id, 'color', intel ? threatColor(level) : secColor(sys.security))
      graph.setNodeAttribute(sys.id, 'size',  sys.id === selectedSystem
        ? THREAT_SIZE[level] * 1.4   // selected: extra boost on top of threat size
        : THREAT_SIZE[level])
    }

    sigmaRef.current?.refresh()
  }, [systemIntel, selectedSystem])

  return (
    <div
      ref={containerRef}
      className="w-full h-full"
      style={{ background: '#080c14' }}
    />
  )
}
