import { useRef, useEffect } from "react";
import Globe, { type GlobeMethods } from "react-globe.gl";

interface GlobeViewProps {
  globeData: any[];
  onPointClick: (point: any) => void;
}

export default function GlobeView({ globeData, onPointClick }: GlobeViewProps) {
  const globeRef = useRef<GlobeMethods>();

  useEffect(() => {
    if (globeRef.current) {
      globeRef.current.pointOfView({ altitude: 2.5 }, 1000);
      globeRef.current.controls().autoRotate = true;
      globeRef.current.controls().autoRotateSpeed = 0.5;
    }
  }, []);

  return (
    <div className="absolute inset-0 cursor-crosshair">
      <Globe
        ref={globeRef}
        globeImageUrl="//unpkg.com/three-globe/example/img/earth-night.jpg"
        backgroundImageUrl="//unpkg.com/three-globe/example/img/night-sky.png"
        pointsData={globeData}
        pointLat="lat"
        pointLng="lng"
        pointColor="color"
        pointAltitude={0.01}
        pointRadius="size"
        onPointClick={(point) => {
          if (globeRef.current) {
            const p = point as any;
            globeRef.current.controls().autoRotate = false;
            globeRef.current.pointOfView({ lat: p.lat, lng: p.lng, altitude: 1.5 }, 1000);
          }
          onPointClick(point);
        }}
        htmlElementsData={globeData}
        htmlElement={(d: object) => {
          const data = d as any;
          const el = document.createElement("div");
          el.style.cssText = `
            width: 14px; height: 14px;
            margin-left: -7px; margin-top: -7px;
            border-radius: 50%;
            cursor: pointer;
            background-color: ${data.color};
            opacity: 0.8;
            box-shadow: 0 0 16px ${data.color};
            transition: transform 0.15s;
          `;
          if (data.severity === "critical" || data.severity === "high") {
            el.style.animation = "worldalert-pulse 1.6s ease-in-out infinite";
          }
          el.onmouseenter = () => { el.style.transform = "scale(1.6)"; };
          el.onmouseleave = () => { el.style.transform = "scale(1)"; };
          el.onclick = () => onPointClick(data);
          return el;
        }}
      />
      <style>{`
        @keyframes worldalert-pulse {
          0%, 100% { box-shadow: 0 0 6px 2px var(--c, #ef4444); opacity: 0.8; }
          50% { box-shadow: 0 0 22px 8px var(--c, #ef4444); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
