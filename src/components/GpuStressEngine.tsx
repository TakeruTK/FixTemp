import { useEffect, useRef } from 'react'
import type { StressSession } from '../types'

export function GpuStressEngine({ session }: { session: StressSession | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!session?.active || session.type !== 'gpu' || !canvasRef.current) return
    const gl = canvasRef.current.getContext('webgl2', {
      antialias: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false
    })
    const fail = async (message: string) => {
      await fetch('/api/stress/stop', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: 'error', error: message }) }).catch(() => {})
    }
    if (!gl) { void fail('WebGL 2 no esta disponible para ejecutar la carga GPU real.'); return }

    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type)!
      gl.shaderSource(shader, source)
      gl.compileShader(shader)
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) || 'Error de shader')
      return shader
    }
    let timer = 0
    try {
      const vertex = compile(gl.VERTEX_SHADER, '#version 300 es\nin vec2 p;void main(){gl_Position=vec4(p,0.,1.);}')
      const fragment = compile(gl.FRAGMENT_SHADER, `#version 300 es
        precision highp float; out vec4 o; uniform float t;
        void main(){
          vec2 uv=gl_FragCoord.xy/vec2(1280.,720.); float v=0.;
          for(int i=0;i<224;i++){float f=float(i)+1.;v+=sin(uv.x*f+t)*cos(uv.y*f-t)/f;}
          o=vec4(vec3(v*.5+.5),1.);
        }`)
      const program = gl.createProgram()!
      gl.attachShader(program, vertex); gl.attachShader(program, fragment); gl.linkProgram(program)
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) || 'Error al enlazar shader')
      gl.useProgram(program)
      const buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
      const loc = gl.getAttribLocation(program, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)
      const timeLoc = gl.getUniformLocation(program, 't')
      const passes = Math.max(1, Math.ceil(session.intensity / 16))
      const interval = Math.max(4, Math.round(34 - session.intensity * .3))
      const draw = () => {
        gl.uniform1f(timeLoc, performance.now() / 1000)
        for (let i = 0; i < passes; i++) gl.drawArrays(gl.TRIANGLES, 0, 3)
        gl.flush()
      }
      timer = window.setInterval(draw, interval)
      draw()
    } catch (error) { void fail(error instanceof Error ? error.message : 'Fallo la carga GPU') }
    return () => {
      window.clearInterval(timer)
      gl.getExtension('WEBGL_lose_context')?.loseContext()
    }
  }, [session?.id, session?.active, session?.type, session?.intensity])

  return <canvas ref={canvasRef} className="gpu-stress-engine" width="1280" height="720" aria-hidden="true"/>
}
