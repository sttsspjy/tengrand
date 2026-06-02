"use client";
import { useEffect, useRef } from "react";
import * as THREE from "three";

const VERTEX = `
  uniform float time;
  uniform float intensity;
  varying vec2 vUv;
  varying vec3 vPosition;

  void main() {
    vUv = uv;
    vPosition = position;

    vec3 pos = position;
    pos.y += sin(pos.x * 10.0 + time) * 0.1 * intensity;
    pos.x += cos(pos.y * 8.0 + time * 1.5) * 0.05 * intensity;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const FRAGMENT = `
  uniform float time;
  uniform float intensity;
  uniform vec3 color1;
  uniform vec3 color2;
  varying vec2 vUv;
  varying vec3 vPosition;

  void main() {
    vec2 uv = vUv;

    float noise = sin(uv.x * 20.0 + time) * cos(uv.y * 15.0 + time * 0.8);
    noise += sin(uv.x * 35.0 - time * 2.0) * cos(uv.y * 25.0 + time * 1.2) * 0.5;

    vec3 color = mix(color1, color2, noise * 0.5 + 0.5);
    color = mix(color, vec3(1.0), pow(abs(noise), 2.0) * intensity);

    float glow = 1.0 - length(uv - 0.5) * 2.0;
    glow = pow(glow, 2.0);

    gl_FragColor = vec4(color * glow, glow * 0.8);
  }
`;

interface PlaneConfig {
  position: [number, number, number];
  color1: string;
  color2: string;
}

interface RingConfig {
  radius: number;
  color: string;
  speed: number;
}

export function ShaderScene({ className = "" }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, canvas.clientWidth / canvas.clientHeight, 0.1, 100);
    camera.position.z = 3.5;

    const planeConfigs: PlaneConfig[] = [
      { position: [0, 0, 0],      color1: "#4A7CFF", color2: "#ffffff" },
      { position: [-2, 0.8, -1.5], color1: "#8B5CF6", color2: "#FF6B6B" },
      { position: [2, -0.8, -1],   color1: "#4AE3B5", color2: "#4A7CFF" },
    ];

    const planes = planeConfigs.map(({ position, color1, color2 }) => {
      const uniforms = {
        time:      { value: 0 },
        intensity: { value: 1.0 },
        color1:    { value: new THREE.Color(color1) },
        color2:    { value: new THREE.Color(color2) },
      };
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(2, 2, 32, 32),
        new THREE.ShaderMaterial({ uniforms, vertexShader: VERTEX, fragmentShader: FRAGMENT, transparent: true, side: THREE.DoubleSide })
      );
      mesh.position.set(...position);
      scene.add(mesh);
      return { mesh, uniforms };
    });

    const ringConfigs: RingConfig[] = [
      { radius: 1.2, color: "#4A7CFF", speed:  0.6 },
      { radius: 1.8, color: "#8B5CF6", speed: -0.4 },
      { radius: 2.4, color: "#4AE3B5", speed:  0.3 },
    ];

    const rings = ringConfigs.map(({ radius, color, speed }) => {
      const mesh = new THREE.Mesh(
        new THREE.RingGeometry(radius * 0.85, radius, 64),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, side: THREE.DoubleSide })
      );
      scene.add(mesh);
      return { mesh, speed };
    });

    let animId: number;
    let t = 0;

    const resize = () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
    };

    const animate = () => {
      animId = requestAnimationFrame(animate);
      t += 0.008;
      planes.forEach(({ mesh, uniforms }, i) => {
        uniforms.time.value = t;
        uniforms.intensity.value = 1.0 + Math.sin(t * 1.5 + i) * 0.3;
        mesh.rotation.y = Math.sin(t * 0.3 + i) * 0.4;
        mesh.rotation.x = Math.cos(t * 0.2 + i) * 0.2;
      });
      rings.forEach(({ mesh, speed }, i) => {
        mesh.rotation.z += speed * 0.01;
        (mesh.material as THREE.MeshBasicMaterial).opacity = 0.2 + Math.sin(t * 2 + i * 1.3) * 0.15;
      });
      renderer.render(scene, camera);
    };

    renderer.setClearColor(0x000000, 0);
    resize();
    window.addEventListener("resize", resize);
    animate();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
      planes.forEach(({ mesh }) => {
        mesh.geometry.dispose();
        (mesh.material as THREE.ShaderMaterial).dispose();
      });
      rings.forEach(({ mesh }) => {
        mesh.geometry.dispose();
        (mesh.material as THREE.MeshBasicMaterial).dispose();
      });
      renderer.dispose();
    };
  }, []);

  return <canvas ref={canvasRef} className={`w-full h-full block ${className}`} />;
}
