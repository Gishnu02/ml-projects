/**
 * RouteMind - Leaflet Map Integration & Live Fleet Visualizer
 */

class RouteMap {
  constructor(mapContainerId = 'map') {
    this.mapId = mapContainerId;
    this.map = null;
    this.depotLayer = null;
    this.routePolylines = [];
    this.stopMarkers = [];
    this.incidentMarkers = [];
    this.animatedTruckMarkers = [];
    this.isSimulating = false;
    this.simulationFrameId = null;
    this.incidentPlacementMode = false;

    this.onOrderDropClick = null;
    this.onIncidentDropClick = null;
    this.onDeleteOrderClick = null;
    this.onDeleteIncidentClick = null;
  }

  init(center = [37.7785, -122.4200], zoom = 13) {
    this.map = L.map(this.mapId, {
      center: center,
      zoom: zoom,
      zoomControl: false,
      attributionControl: false
    });

    // Dark theme CartoDB basemap
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}.png', {
      maxZoom: 19,
      subdomains: 'abcd'
    }).addTo(this.map);

    // Zoom controls at top right
    L.control.zoom({ position: 'topright' }).addTo(this.map);

    // Map click handler for dropping orders or roadblocks
    this.map.on('click', (e) => {
      const lat = parseFloat(e.latlng.lat.toFixed(5));
      const lng = parseFloat(e.latlng.lng.toFixed(5));

      if (this.incidentPlacementMode) {
        if (this.onIncidentDropClick) {
          this.onIncidentDropClick(lat, lng);
        }
      } else {
        if (this.onOrderDropClick) {
          this.onOrderDropClick(lat, lng);
        }
      }
    });

    return this;
  }

  renderState(state) {
    this.clearAll();

    const { depot, environment, latest_solution } = state;

    // 1. Render Depot
    if (depot && depot.location) {
      this.renderDepot(depot);
    }

    // 2. Render Traffic Incidents
    if (environment && environment.incidents) {
      this.renderIncidents(environment.incidents);
    }

    // 3. Render Routes and Delivery Stops
    if (latest_solution && latest_solution.routes) {
      this.renderRoutes(latest_solution.routes);
    }
  }

  renderDepot(depot) {
    const lat = depot.location.lat;
    const lng = depot.location.lng;

    const depotIcon = L.divIcon({
      className: 'depot-marker-container',
      html: `
        <div class="depot-marker-icon" title="${depot.name}">
          🏢
        </div>
      `,
      iconSize: [36, 36],
      iconAnchor: [18, 18],
      popupAnchor: [0, -18]
    });

    this.depotLayer = L.marker([lat, lng], { icon: depotIcon })
      .bindPopup(`
        <div style="font-size: 0.8rem; min-width: 180px;">
          <div style="font-weight: 700; color: #60a5fa; margin-bottom: 4px;">🏢 ${depot.name}</div>
          <div style="color: #9ca3af; font-size: 0.72rem;">${depot.location.address || 'Central Operations Base'}</div>
          <div style="margin-top: 6px; font-size: 0.7rem; color: #34d399;">Central Dispatch & Fleet Recharging</div>
        </div>
      `)
      .addTo(this.map);
  }

  renderIncidents(incidents) {
    incidents.forEach(inc => {
      // Circle buffer
      const circle = L.circle([inc.lat, inc.lng], {
        radius: (inc.radius_km || 1.2) * 1000,
        color: '#ef4444',
        fillColor: '#ef4444',
        fillOpacity: 0.22,
        weight: 1.5,
        dashArray: '4, 4'
      }).addTo(this.map);

      // Warning marker
      const incIcon = L.divIcon({
        className: 'incident-icon-wrapper',
        html: `
          <div style="width: 28px; height: 28px; background: rgba(239, 68, 68, 0.9); border: 2px solid #fff; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 13px; box-shadow: 0 0 12px #ef4444;">
            ⚠️
          </div>
        `,
        iconSize: [28, 28],
        iconAnchor: [14, 14]
      });

      const marker = L.marker([inc.lat, inc.lng], { icon: incIcon })
        .bindPopup(`
          <div style="font-size: 0.78rem; min-width: 170px;">
            <div style="font-weight: 700; color: #f87171;">⚠️ ${inc.description}</div>
            <div style="color: #9ca3af; font-size: 0.7rem; margin: 4px 0;">Severity Impact: ${inc.severity}x Delay</div>
            <button class="btn btn-danger btn-sm" style="width: 100%; margin-top: 6px;" onclick="window.app.deleteIncident('${inc.id}')">
              Clear Incident
            </button>
          </div>
        `)
        .addTo(this.map);

      this.incidentMarkers.push(circle);
      this.incidentMarkers.push(marker);
    });
  }

  renderRoutes(routes) {
    routes.forEach((route, rIdx) => {
      const color = route.color || '#3b82f6';
      const stops = route.stops || [];
      if (stops.length < 2) return;

      const latlngs = stops.map(s => [s.location.lat, s.location.lng]);

      // Outer glow polyline
      const glowLine = L.polyline(latlngs, {
        color: color,
        weight: 8,
        opacity: 0.25,
        lineCap: 'round',
        lineJoin: 'round'
      }).addTo(this.map);

      // Core route polyline
      const coreLine = L.polyline(latlngs, {
        color: color,
        weight: 3.5,
        opacity: 0.95,
        dashArray: rIdx % 2 === 1 ? '6, 6' : null,
        lineCap: 'round',
        lineJoin: 'round'
      }).addTo(this.map);

      this.routePolylines.push(glowLine);
      this.routePolylines.push(coreLine);

      // Render delivery stop badges
      stops.forEach((stop, sIdx) => {
        if (!stop.order_id) return; // Skip depot start/return

        const slaBorderColor = stop.sla_status === 'delayed'
          ? '#ef4444'
          : (stop.sla_status === 'at_risk' ? '#f59e0b' : color);

        const stopIcon = L.divIcon({
          className: 'stop-marker-wrapper',
          html: `
            <div class="order-badge-icon" style="border-color: ${slaBorderColor}; background: #111827;">
              ${stop.stop_order}
            </div>
          `,
          iconSize: [26, 26],
          iconAnchor: [13, 13],
          popupAnchor: [0, -13]
        });

        const delayTagClass = stop.delay_risk === 'high' ? 'delay-high' : (stop.delay_risk === 'medium' ? 'delay-med' : 'delay-low');

        const popupContent = `
          <div style="font-size: 0.8rem; min-width: 220px; line-height: 1.4;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
              <span style="font-weight: 700; color: #fff;">#${stop.stop_order} ${stop.customer_name}</span>
              <span class="delay-tag ${delayTagClass}">+${stop.ml_delay_min}m</span>
            </div>
            <div style="color: #9ca3af; font-size: 0.72rem; margin-bottom: 8px;">
              Assigned: <strong style="color: ${color};">${route.vehicle_name}</strong>
            </div>

            <div style="background: rgba(0,0,0,0.3); padding: 8px; border-radius: 4px; display: grid; grid-template-columns: 1fr 1fr; gap: 6px; font-size: 0.72rem; margin-bottom: 8px;">
              <div>
                <span style="color: #6b7280;">Classical ETA:</span>
                <div style="font-weight: 600;">${this.formatMinutes(stop.classical_arrival_min)}</div>
              </div>
              <div>
                <span style="color: #34d399;">ML ETA:</span>
                <div style="font-weight: 700; color: #34d399;">${this.formatMinutes(stop.ml_arrival_min)}</div>
              </div>
              <div>
                <span style="color: #6b7280;">SLA Window:</span>
                <div>${this.formatMinutes(stop.time_window_start)} - ${this.formatMinutes(stop.time_window_end)}</div>
              </div>
              <div>
                <span style="color: #6b7280;">Demand:</span>
                <div style="font-weight: 600;">${stop.demand} kg</div>
              </div>
            </div>

            <button class="btn btn-danger btn-sm" style="width: 100%;" onclick="window.app.deleteOrder('${stop.order_id}')">
              Remove Stop & Re-Optimize
            </button>
          </div>
        `;

        const marker = L.marker([stop.location.lat, stop.location.lng], { icon: stopIcon })
          .bindPopup(popupContent)
          .addTo(this.map);

        this.stopMarkers.push(marker);
      });
    });
  }

  formatMinutes(min) {
    const totalMinutes = Math.round(min);
    const startHour = 8; // 08:00 AM shift baseline
    const hours = (startHour + Math.floor(totalMinutes / 60)) % 24;
    const minutes = totalMinutes % 60;
    const hStr = hours < 10 ? `0${hours}` : `${hours}`;
    const mStr = minutes < 10 ? `0${minutes}` : `${minutes}`;
    return `${hStr}:${mStr}`;
  }

  clearAll() {
    this.stopSimulation();
    if (this.depotLayer) {
      this.map.removeLayer(this.depotLayer);
      this.depotLayer = null;
    }
    this.routePolylines.forEach(l => this.map.removeLayer(l));
    this.routePolylines = [];
    this.stopMarkers.forEach(m => this.map.removeLayer(m));
    this.stopMarkers = [];
    this.incidentMarkers.forEach(i => this.map.removeLayer(i));
    this.incidentMarkers = [];
    this.animatedTruckMarkers.forEach(t => this.map.removeLayer(t));
    this.animatedTruckMarkers = [];
  }

  // --- FLEET ANIMATION SIMULATION ---
  startSimulation(routes) {
    if (this.isSimulating) {
      this.stopSimulation();
      return;
    }
    if (!routes || routes.length === 0) return;

    this.isSimulating = true;
    document.getElementById('simBtnText').innerText = 'Pause Simulation';

    // Clear previous truck icons
    this.animatedTruckMarkers.forEach(t => this.map.removeLayer(t));
    this.animatedTruckMarkers = [];

    // Build dense interpolated waypoint paths for each vehicle
    const vehicleSims = routes.map(r => {
      const stops = r.stops;
      if (stops.length < 2) return null;

      const path = [];
      for (let i = 0; i < stops.length - 1; i++) {
        const p1 = [stops[i].location.lat, stops[i].location.lng];
        const p2 = [stops[i + 1].location.lat, stops[i + 1].location.lng];
        const steps = 40; // smoothness
        for (let s = 0; s < steps; s++) {
          const ratio = s / steps;
          path.push([
            p1[0] + (p2[0] - p1[0]) * ratio,
            p1[1] + (p2[1] - p1[1]) * ratio
          ]);
        }
      }
      path.push([stops[stops.length - 1].location.lat, stops[stops.length - 1].location.lng]);

      const truckIcon = L.divIcon({
        className: 'truck-marker-wrapper',
        html: `
          <div style="background: ${r.color || '#3b82f6'}; width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 0 10px ${r.color || '#3b82f6'}; border: 2px solid #fff; font-size: 14px;">
            🚚
          </div>
        `,
        iconSize: [28, 28],
        iconAnchor: [14, 14]
      });

      const marker = L.marker(path[0], { icon: truckIcon, zIndexOffset: 1000 }).addTo(this.map);
      this.animatedTruckMarkers.push(marker);

      return {
        path: path,
        marker: marker,
        stepIndex: 0,
        vehicleName: r.vehicle_name
      };
    }).filter(Boolean);

    let lastTime = performance.now();

    const animateLoop = (currentTime) => {
      if (!this.isSimulating) return;

      const delta = currentTime - lastTime;
      if (delta > 35) { // update every ~35ms
        lastTime = currentTime;
        vehicleSims.forEach(sim => {
          sim.stepIndex = (sim.stepIndex + 1) % sim.path.length;
          const pos = sim.path[sim.stepIndex];
          sim.marker.setLatLng(pos);
        });
      }

      this.simulationFrameId = requestAnimationFrame(animateLoop);
    };

    this.simulationFrameId = requestAnimationFrame(animateLoop);
  }

  stopSimulation() {
    this.isSimulating = false;
    if (this.simulationFrameId) {
      cancelAnimationFrame(this.simulationFrameId);
      this.simulationFrameId = null;
    }
    const btnText = document.getElementById('simBtnText');
    if (btnText) btnText.innerText = 'Simulate Fleet';
    this.animatedTruckMarkers.forEach(t => this.map.removeLayer(t));
    this.animatedTruckMarkers = [];
  }
}
