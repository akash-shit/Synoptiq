import * as maplibregl from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import { useEffect, useRef } from "react";

type Zone = { zone: string; lat: number; lon: number; model: string; colour: string };

export function TrustAtlasMap({ zones, selected, onSelect }: { zones: Zone[]; selected: string; onSelect: (zone: string) => void }) {
  const element = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    if (!element.current || map.current) return;
    maplibregl.setWorkerUrl(workerUrl);
    const instance = new maplibregl.Map({
      container: element.current,
      center: [79.2, 22.4],
      zoom: 4.5,
      minZoom: 3.8,
      maxZoom: 10,
      maxBounds: [[64, 3], [101, 39]],
      style: {
        version: 8,
        sources: {
          india: {
            type: "geojson",
            data: "https://raw.githubusercontent.com/datameet/maps/master/Country/india-land-simplified.geojson",
          },
          osm: {
            type: "raster",
            tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
            tileSize: 256,
            attribution: "© OpenStreetMap contributors",
          },
        },
        layers: [
          { id: "background", type: "background", paint: { "background-color": "#07131b" } },
          {
            id: "osm-basemap",
            type: "raster",
            source: "osm",
            paint: { "raster-opacity": 0.35, "raster-saturation": -0.75, "raster-brightness-min": 0.12, "raster-brightness-max": 0.78 },
          },
          { id: "india-fill", type: "fill", source: "india", paint: { "fill-color": "#1bc8aa", "fill-opacity": 0.045 } },
          { id: "india-boundary", type: "line", source: "india", paint: { "line-color": "#45e6d3", "line-width": 1.5, "line-opacity": 0.7 } },
        ],
      },
      attributionControl: true,
    });
    instance.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    instance.on("load", () => {
      instance.fitBounds([[67, 5], [98, 38]], { padding: 18, duration: 0 });
      instance.addSource("atlas-zones", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: zones.map((zone) => ({
            type: "Feature",
            properties: { zone: zone.zone, model: zone.model, colour: zone.colour },
            geometry: { type: "Point", coordinates: [zone.lon, zone.lat] },
          })),
        },
      });
      instance.addLayer({
        id: "atlas-zone-halo",
        type: "circle",
        source: "atlas-zones",
        paint: { "circle-radius": 26, "circle-color": ["get", "colour"], "circle-opacity": 0.2, "circle-stroke-width": 2, "circle-stroke-color": ["get", "colour"] },
      });
      instance.addLayer({
        id: "atlas-zone-dot",
        type: "circle",
        source: "atlas-zones",
        paint: { "circle-radius": 7, "circle-color": ["get", "colour"], "circle-stroke-width": 2, "circle-stroke-color": "#07131b" },
      });
      instance.addLayer({
        id: "atlas-zone-label",
        type: "symbol",
        source: "atlas-zones",
        layout: { "text-field": ["get", "model"], "text-size": 11, "text-offset": [0, 2.2] },
        paint: { "text-color": ["get", "colour"], "text-halo-color": "#07131b", "text-halo-width": 1.5 },
      });
      instance.on("click", "atlas-zone-dot", (event) => {
        const zone = event.features?.[0]?.properties?.zone;
        if (typeof zone === "string") onSelectRef.current(zone);
      });
      instance.on("mouseenter", "atlas-zone-dot", () => { instance.getCanvas().style.cursor = "pointer"; });
      instance.on("mouseleave", "atlas-zone-dot", () => { instance.getCanvas().style.cursor = ""; });
    });
    map.current = instance;
    return () => { instance.remove(); map.current = null; };
  }, [zones]);

  useEffect(() => {
    const instance = map.current;
    if (!instance?.isStyleLoaded() || !instance.getLayer("atlas-zone-halo")) return;
    instance.setPaintProperty("atlas-zone-halo", "circle-radius", ["case", ["==", ["get", "zone"], selected], 34, 26]);
    instance.setPaintProperty("atlas-zone-halo", "circle-opacity", ["case", ["==", ["get", "zone"], selected], 0.34, 0.2]);
  }, [selected]);

  return <div className="atlas-map-real" ref={element} aria-label="Accurate India map showing Synoptiq pilot zones" />;
}