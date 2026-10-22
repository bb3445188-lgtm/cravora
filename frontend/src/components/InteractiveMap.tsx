import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import { Branch } from '../types';

interface InteractiveMapProps {
  centerLat: number;
  centerLng: number;
  zoom?: number;
  branches?: Branch[];
  showDeliveryZones?: boolean;
  interactivePin?: boolean;
  onSelectCoordinates?: (lat: number, lng: number) => void;
  riderLocation?: {
    latitude: number;
    longitude: number;
    rider_name: string;
  } | null;
  heightClass?: string;
}

const customerPinIcon = L.divIcon({
  className: 'cravora-customer-pin',
  html: `
    <div style="
      width: 38px;
      height: 38px;
      background: #D92B2B;
      border: 3px solid #FFFBF5;
      border-radius: 50% 50% 50% 0;
      transform: rotate(-45deg);
      box-shadow: 0 6px 16px rgba(217,43,43,0.5);
      display: flex;
      align-items: center;
      justify-content: center;
    ">
      <div style="width: 12px; height: 12px; background: #FFFBF5; border-radius: 50%; transform: rotate(45deg);"></div>
    </div>
  `,
  iconSize: [38, 38],
  iconAnchor: [19, 38],
});

const branchPinIcon = L.divIcon({
  className: 'cravora-branch-pin',
  html: `
    <div style="
      width: 34px;
      height: 34px;
      background: #18181B;
      border: 2.5px solid #F97316;
      border-radius: 10px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.35);
      display: flex;
      align-items: center;
      justify-content: center;
      color: #FFFBF5;
      font-weight: 800;
      font-size: 13px;
    ">C</div>
  `,
  iconSize: [34, 34],
  iconAnchor: [17, 17],
});

const riderPinIcon = L.divIcon({
  className: 'cravora-rider-pin',
  html: `
    <div style="
      width: 36px;
      height: 36px;
      background: #10B981;
      border: 3px solid #FFFFFF;
      border-radius: 50%;
      box-shadow: 0 4px 14px rgba(16,185,129,0.55);
      display: flex;
      align-items: center;
      justify-content: center;
      color: #FFFFFF;
      font-weight: 800;
      font-size: 12px;
    ">🛵</div>
  `,
  iconSize: [36, 36],
  iconAnchor: [18, 18],
});

export const InteractiveMap: React.FC<InteractiveMapProps> = ({
  centerLat,
  centerLng,
  zoom = 13,
  branches = [],
  showDeliveryZones = true,
  interactivePin = true,
  onSelectCoordinates,
  riderLocation = null,
  heightClass = 'h-72',
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const pinMarkerRef = useRef<L.Marker | null>(null);
  const overlaysLayerRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [centerLat, centerLng],
      zoom,
      scrollWheelZoom: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors | Cravora Coverage Engine',
      maxZoom: 19,
    }).addTo(map);

    const overlays = L.layerGroup().addTo(map);
    overlaysLayerRef.current = overlays;

    if (interactivePin) {
      const marker = L.marker([centerLat, centerLng], {
        icon: customerPinIcon,
        draggable: true,
      }).addTo(map);

      marker.bindTooltip('Drag pin or click map to set delivery entrance', {
        direction: 'top',
        offset: [0, -34],
      });

      marker.on('dragend', () => {
        const pos = marker.getLatLng();
        if (onSelectCoordinates) {
          onSelectCoordinates(
            Number(pos.lat.toFixed(5)),
            Number(pos.lng.toFixed(5))
          );
        }
      });

      pinMarkerRef.current = marker;

      map.on('click', (e: L.LeafletMouseEvent) => {
        const { lat, lng } = e.latlng;
        marker.setLatLng([lat, lng]);
        if (onSelectCoordinates) {
          onSelectCoordinates(Number(lat.toFixed(5)), Number(lng.toFixed(5)));
        }
      });
    }

    mapRef.current = map;

    setTimeout(() => {
      map.invalidateSize();
    }, 180);

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Update center & draggable pin when coordinates change
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.setView([centerLat, centerLng], map.getZoom(), { animate: true });
    if (pinMarkerRef.current) {
      pinMarkerRef.current.setLatLng([centerLat, centerLng]);
    }
  }, [centerLat, centerLng]);

  // Render branches, delivery zones, and rider marker
  useEffect(() => {
    const overlays = overlaysLayerRef.current;
    if (!overlays) return;
    overlays.clearLayers();

    branches.forEach((b) => {
      const bMarker = L.marker([b.latitude, b.longitude], { icon: branchPinIcon });
      bMarker.bindPopup(`
        <div style="min-width: 190px; font-family: 'Plus Jakarta Sans', sans-serif;">
          <div style="font-weight: 800; color: #D92B2B; font-size: 13px;">${b.name}</div>
          <div style="font-size: 11px; color: #52525B; margin-top: 2px;">${b.address}</div>
          <div style="font-size: 11px; font-weight: 600; margin-top: 4px;">Hours: ${b.opening_time} – ${b.closing_time} | ${b.phone}</div>
        </div>
      `);
      bMarker.addTo(overlays);

      if (showDeliveryZones && b.delivery_zones) {
        b.delivery_zones.forEach((z) => {
          if (z.zone_type === 'polygon' && z.polygon_coords && z.polygon_coords.length >= 3) {
            const latLngs = z.polygon_coords.map((pair) => [pair[0], pair[1]] as [number, number]);
            L.polygon(latLngs, {
              color: '#D92B2B',
              weight: 2,
              fillColor: '#D92B2B',
              fillOpacity: 0.1,
              dashArray: '6, 6',
            })
              .bindTooltip(`${z.name} (Base Rs. ${z.base_delivery_fee})`)
              .addTo(overlays);
          } else {
            L.circle([b.latitude, b.longitude], {
              radius: z.radius_km * 1000,
              color: '#F97316',
              weight: 1.5,
              fillColor: '#F97316',
              fillOpacity: 0.08,
            })
              .bindTooltip(`${z.name} (${z.radius_km} km radius)`)
              .addTo(overlays);
          }
        });
      }
    });

    if (riderLocation) {
      const rMarker = L.marker([riderLocation.latitude, riderLocation.longitude], {
        icon: riderPinIcon,
      });
      rMarker.bindPopup(`<b>Rider: ${riderLocation.rider_name}</b><br/>Live Verified GPS`);
      rMarker.addTo(overlays);
    }
  }, [branches, showDeliveryZones, riderLocation]);

  return (
    <div className={`relative w-full ${heightClass} rounded-2xl overflow-hidden border border-stone-200 shadow-inner bg-stone-100`}>
      <div ref={containerRef} className="w-full h-full" />
      <div className="absolute bottom-2.5 left-2.5 z-[20] bg-white/95 backdrop-blur px-3 py-1.5 rounded-full text-[11px] font-semibold text-stone-700 shadow-sm border border-stone-200 flex items-center gap-3 pointer-events-none">
        <span className="inline-flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-full bg-cravora-red inline-block"></span>
          Your Pin ({centerLat.toFixed(4)}, {centerLng.toFixed(4)})
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded bg-cravora-charcoal border border-cravora-orange inline-block"></span>
          Cravora Branch & Zone
        </span>
      </div>
    </div>
  );
};
