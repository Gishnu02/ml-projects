/**
 * RouteMind - Main Application Controller
 */

class RouteMindApp {
  constructor() {
    this.state = null;
    this.map = new RouteMap('map');
    this.useMlMatrix = true;
    this.isRetraining = false;
  }

  async init() {
    this.map.init();

    // Map interactions
    this.map.onOrderDropClick = (lat, lng) => this.openOrderModal(lat, lng);
    this.map.onIncidentDropClick = (lat, lng) => this.dropIncidentAt(lat, lng);

    this.bindEvents();
    await this.fetchState();
    this.initSandbox();
  }

  showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'toast';

    let icon = 'ℹ️';
    if (type === 'success') icon = '⚡';
    if (type === 'warning') icon = '⚠️';
    if (type === 'error') icon = '❌';

    toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3200);
  }

  bindEvents() {
    // Re-Optimize
    document.getElementById('btnOptimize')?.addEventListener('click', () => {
      this.optimize(true);
    });

    // Weather change
    document.getElementById('weatherSelect')?.addEventListener('change', (e) => {
      this.updateEnvironment({ weather: e.target.value });
      this.showToast(`Weather updated to ${e.target.options[e.target.selectedIndex].text}`, 'info');
    });

    // Traffic slider
    const trafficSlider = document.getElementById('trafficSlider');
    trafficSlider?.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      this.updateTrafficBadge(val);
    });
    trafficSlider?.addEventListener('change', (e) => {
      const val = parseFloat(e.target.value);
      this.updateEnvironment({ traffic_level: val });
      this.showToast(`Traffic congestion updated to ${val.toFixed(1)}x`, 'warning');
    });

    // Time of day
    document.getElementById('todSelect')?.addEventListener('change', (e) => {
      this.updateEnvironment({ time_of_day: e.target.value });
    });

    // Routing Mode toggle
    const modeHybrid = document.getElementById('modeHybrid');
    const modeClassical = document.getElementById('modeClassical');
    modeHybrid?.addEventListener('click', () => {
      this.useMlMatrix = true;
      modeHybrid.classList.add('active');
      modeClassical.classList.remove('active');
      this.optimize();
      this.showToast('Switched to RouteMind Hybrid AI (OR-Tools + XGBoost)', 'success');
    });
    modeClassical?.addEventListener('click', () => {
      this.useMlMatrix = false;
      modeClassical.classList.add('active');
      modeHybrid.classList.remove('active');
      this.optimize();
      this.showToast('Switched to Classical OR-Tools (Distance Only)', 'warning');
    });

    // Floating toolbar actions
    document.getElementById('btnQuickDrop')?.addEventListener('click', () => this.quickRandomOrder());
    document.getElementById('btnToggleIncidentMode')?.addEventListener('click', () => this.toggleIncidentMode());
    document.getElementById('btnSimulate')?.addEventListener('click', () => {
      if (this.state && this.state.latest_solution) {
        this.map.startSimulation(this.state.latest_solution.routes);
      }
    });

    // Reset Scenario
    document.getElementById('btnResetScenario')?.addEventListener('click', () => this.resetScenario());

    // Re-Train Model
    document.getElementById('btnRetrainModel')?.addEventListener('click', () => this.retrainModel());

    // Comparison Modal
    document.getElementById('btnCompareModal')?.addEventListener('click', () => this.openCompareModal());
    document.getElementById('btnCloseCompareModal')?.addEventListener('click', () => this.closeCompareModal());
    document.getElementById('btnCloseCompareFooter')?.addEventListener('click', () => this.closeCompareModal());

    // Drop Order Modal
    document.getElementById('btnCloseOrderModal')?.addEventListener('click', () => this.closeOrderModal());
    document.getElementById('btnCancelOrderModal')?.addEventListener('click', () => this.closeOrderModal());
    document.getElementById('btnSubmitOrderModal')?.addEventListener('click', () => this.submitOrderModal());
    document.getElementById('btnManualAddOrder')?.addEventListener('click', () => {
      // Pick random point near SF SoMa
      const lat = 37.7720 + (Math.random() - 0.5) * 0.045;
      const lng = -122.4180 + (Math.random() - 0.5) * 0.055;
      this.openOrderModal(lat, lng);
    });

    // Demand slider in modal
    const orderDemand = document.getElementById('orderDemand');
    orderDemand?.addEventListener('input', (e) => {
      document.getElementById('orderDemandVal').innerText = e.target.value;
    });

    // Sidebar Tabs
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-pane').forEach(p => p.style.display = 'none');

        btn.classList.add('active');
        const tabId = btn.getAttribute('data-tab');
        const target = document.getElementById(tabId);
        if (target) target.style.display = 'block';
      });
    });
  }

  updateTrafficBadge(val) {
    const badge = document.getElementById('trafficBadge');
    if (!badge) return;
    badge.className = 'traffic-badge';
    if (val < 1.3) {
      badge.classList.add('traffic-normal');
      badge.innerText = `${val.toFixed(1)}x (Normal)`;
    } else if (val < 1.9) {
      badge.classList.add('traffic-moderate');
      badge.innerText = `${val.toFixed(1)}x (Rush)`;
    } else {
      badge.classList.add('traffic-heavy');
      badge.innerText = `${val.toFixed(1)}x (Gridlock)`;
    }
  }

  async fetchState() {
    try {
      const res = await fetch('/api/state');
      if (!res.ok) throw new Error('Failed to load state');
      this.state = await res.json();
      this.render();
    } catch (err) {
      console.error('Fetch state error:', err);
    }
  }

  render() {
    if (!this.state) return;

    // Sync environment UI
    if (this.state.environment) {
      const env = this.state.environment;
      const weatherSelect = document.getElementById('weatherSelect');
      if (weatherSelect) weatherSelect.value = env.weather;

      const trafficSlider = document.getElementById('trafficSlider');
      if (trafficSlider) trafficSlider.value = env.traffic_level;
      this.updateTrafficBadge(env.traffic_level);

      const todSelect = document.getElementById('todSelect');
      if (todSelect) todSelect.value = env.time_of_day;
    }

    // Render Leaflet map
    this.map.renderState(this.state);

    // Update HUD metrics
    this.updateHUD();

    // Render Fleet cards
    this.renderFleet();

    // Render Orders table
    this.renderOrders();

    // Render ML metrics and chart
    this.renderML();
  }

  updateHUD() {
    const sol = this.state.latest_solution;
    if (!sol || !sol.metrics) return;

    const m = sol.metrics;
    document.getElementById('hudDistance').innerText = `${m.total_distance_km || 0} km`;
    document.getElementById('hudActiveVehicles').innerText = `${m.active_vehicles || 0} Active Trucks (${m.assigned_orders}/${m.total_orders} Orders)`;
    document.getElementById('hudAvgDelay').innerText = `+${m.avg_delay_min || 0} min`;
    document.getElementById('hudSlaRate').innerText = `${m.sla_success_rate_pct || 100}%`;
    document.getElementById('hudDelayedStops').innerText = `${m.delayed_stops_count || 0} Late, ${m.at_risk_stops_count || 0} At Risk`;
    document.getElementById('hudCo2').innerText = `${m.co2_saved_kg || 0} kg`;
    document.getElementById('solveTimeTag').innerText = `${m.solve_time_ms || 42} ms`;
  }

  renderFleet() {
    const container = document.getElementById('fleetContainer');
    if (!container) return;

    const sol = this.state.latest_solution;
    if (!sol || !sol.routes || sol.routes.length === 0) {
      container.innerHTML = `<div style="color: var(--text-dim); font-size: 0.82rem; text-align: center; padding: 30px; background: var(--bg-card); border-radius: var(--radius-md);">No active vehicle routes.</div>`;
      return;
    }

    container.innerHTML = sol.routes.map((route, idx) => {
      const stops = route.stops || [];
      const orderStops = stops.filter(s => s.order_id !== null);

      let vehicleIcon = '🚐';
      if (route.vehicle_type === 'electric_van') vehicleIcon = '⚡';
      if (route.vehicle_type === 'heavy_truck') vehicleIcon = '🚛';

      const stopsHtml = stops.map(s => {
        const isDepot = s.order_id === null;
        const slaClass = s.sla_status;
        const delayClass = s.delay_risk === 'high' ? 'delay-high' : (s.delay_risk === 'medium' ? 'delay-med' : 'delay-low');

        return `
          <div class="itinerary-item ${slaClass}">
            <div class="stop-meta">
              <span class="stop-customer">${isDepot ? s.customer_name : `#${s.stop_order} ${s.customer_name}`}</span>
              <span class="stop-sub">${isDepot ? 'Base Hub' : `${s.demand} kg | Window: ${this.map.formatMinutes(s.time_window_start)} - ${this.map.formatMinutes(s.time_window_end)}`}</span>
            </div>
            <div class="stop-times">
              <span class="eta-tag" style="color: #34d399;">${this.map.formatMinutes(s.ml_arrival_min)}</span>
              ${!isDepot ? `<span class="delay-tag ${delayClass}">+${s.ml_delay_min}m</span>` : ''}
            </div>
          </div>
        `;
      }).join('');

      return `
        <div class="vehicle-card" style="border-left: 4px solid ${route.color};">
          <div class="vehicle-header">
            <div class="vehicle-title">
              <span style="font-size: 1.1rem;">${vehicleIcon}</span>
              <span>${route.vehicle_name}</span>
            </div>
            <span class="vehicle-badge-type">${route.vehicle_type.replace('_', ' ')}</span>
          </div>

          <div class="vehicle-stats">
            <div class="vehicle-stat-item">
              <span class="vehicle-stat-label">Distance</span>
              <span class="vehicle-stat-value">${route.total_distance_km} km</span>
            </div>
            <div class="vehicle-stat-item">
              <span class="vehicle-stat-label">ML Duration</span>
              <span class="vehicle-stat-value">${route.ml_total_time_min} m</span>
            </div>
            <div class="vehicle-stat-item">
              <span class="vehicle-stat-label">Capacity</span>
              <span class="vehicle-stat-value">${route.capacity_used}/${route.capacity_total} kg</span>
            </div>
          </div>

          <div>
            <div style="display: flex; justify-content: space-between; font-size: 0.72rem; color: var(--text-dim); margin-bottom: 2px;">
              <span>Payload Utilization</span>
              <span style="font-weight: 700; color: #fff;">${route.utilization_pct}%</span>
            </div>
            <div class="progress-bar-bg">
              <div class="progress-bar-fill" style="width: ${Math.min(100, route.utilization_pct)}%; background-color: ${route.color}; color: ${route.color};"></div>
            </div>
          </div>

          <div class="itinerary-accordion">
            <details style="font-size: 0.78rem;">
              <summary class="itinerary-summary">
                <span>Route Itinerary (${orderStops.length} stops)</span>
                <span>▾</span>
              </summary>
              <div class="itinerary-list">
                ${stopsHtml}
              </div>
            </details>
          </div>
        </div>
      `;
    }).join('');
  }

  renderOrders() {
    const list = document.getElementById('ordersListContainer');
    const badge = document.getElementById('ordersCount');
    if (!list) return;

    const orders = this.state.orders || [];
    if (badge) badge.innerText = orders.length;

    if (orders.length === 0) {
      list.innerHTML = `<div style="color: var(--text-dim); font-size: 0.8rem; text-align: center; padding: 24px; background: var(--bg-card); border-radius: var(--radius-md);">No active orders. Click map to add.</div>`;
      return;
    }

    list.innerHTML = orders.map(ord => {
      const priorityLabel = ord.priority === 1 ? 'Urgent / P1' : (ord.priority === 2 ? 'Standard / P2' : 'Flexible / P3');
      const priorityColor = ord.priority === 1 ? '#fda4af' : (ord.priority === 2 ? '#93c5fd' : '#94a3b8');

      return `
        <div style="background: var(--bg-card); border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); padding: 12px; display: flex; justify-content: space-between; align-items: center; transition: all 0.2s;">
          <div style="display: flex; flex-direction: column; gap: 3px;">
            <div style="font-weight: 700; color: #fff; font-size: 0.82rem;">${ord.customer_name}</div>
            <div style="color: var(--text-dim); font-size: 0.72rem; display: flex; align-items: center; gap: 8px;">
              <span>📦 <strong>${ord.demand} kg</strong></span>
              <span>•</span>
              <span style="color: ${priorityColor}; font-weight: 700;">${priorityLabel}</span>
              <span>•</span>
              <span>SLA: ${this.map.formatMinutes(ord.time_window_end)}</span>
            </div>
          </div>
          <button class="btn btn-danger btn-sm" style="padding: 4px 8px;" onclick="window.app.deleteOrder('${ord.id}')" title="Delete Order">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </div>
      `;
    }).join('');
  }

  renderML() {
    if (!this.state) return;
    const meta = this.state.ml_metadata || {};
    const metrics = meta.metrics || {};

    if (metrics.r2 !== undefined) {
      document.getElementById('mlR2').innerText = metrics.r2.toFixed(3);
    }
    if (metrics.mae !== undefined) {
      document.getElementById('mlMae').innerText = `${metrics.mae.toFixed(2)} m`;
    }
    if (metrics.rmse !== undefined) {
      document.getElementById('mlRmse').innerText = `${metrics.rmse.toFixed(2)} m`;
    }

    if (this.state.feature_importances) {
      updateFeatureChart(this.state.feature_importances);
    }
  }

  initSandbox() {
    const distInput = document.getElementById('sandboxDist');
    const trafInput = document.getElementById('sandboxTraf');

    const updateSandboxCalc = () => {
      const dist = parseFloat(distInput.value);
      const traf = parseFloat(trafInput.value);

      document.getElementById('sandboxDistVal').innerText = dist.toFixed(1);
      document.getElementById('sandboxTrafVal').innerText = traf.toFixed(1);

      const baseMin = (dist / 38.0) * 60.0;
      const rainFactor = this.state?.environment?.weather === 'heavy_rain' ? 1.6 : (this.state?.environment?.weather === 'rain' ? 1.25 : 1.0);
      const delayMin = Math.max(0, baseMin * ((traf * rainFactor) - 1.0) + 1.2);
      const totalMin = baseMin + delayMin;

      document.getElementById('sandboxNominal').innerText = `${baseMin.toFixed(1)} min`;
      document.getElementById('sandboxDelay').innerText = `+${delayMin.toFixed(1)} min`;
      document.getElementById('sandboxTotal').innerText = `${totalMin.toFixed(1)} min`;
    };

    distInput?.addEventListener('input', updateSandboxCalc);
    trafInput?.addEventListener('input', updateSandboxCalc);
    updateSandboxCalc();
  }

  // --- API ACTIONS ---
  async optimize(showFeedback = false) {
    try {
      const res = await fetch('/api/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          use_ml_matrix: this.useMlMatrix,
          time_limit_seconds: 2,
          balance_fleet: true
        })
      });
      const data = await res.json();
      if (data.success) {
        this.state.latest_solution = data;
        this.render();
        if (showFeedback) {
          this.showToast(`Fleet re-optimized in ${data.metrics.solve_time_ms} ms (${data.mode})`, 'success');
        }
      }
    } catch (err) {
      console.error('Optimize error:', err);
      this.showToast('Optimization failed', 'error');
    }
  }

  async updateEnvironment(envPatch) {
    try {
      const res = await fetch('/api/environment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...envPatch, auto_optimize: true })
      });
      const data = await res.json();
      if (data.success) {
        this.state.environment = data.environment;
        this.state.latest_solution = data.latest_solution;
        this.render();
      }
    } catch (err) {
      console.error('Update environment error:', err);
    }
  }

  async deleteOrder(orderId) {
    try {
      const res = await fetch(`/api/orders/${orderId}?auto_optimize=true`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (data.success) {
        this.state.orders = this.state.orders.filter(o => o.id !== orderId);
        this.state.latest_solution = data.latest_solution;
        this.render();
        this.showToast(`Order removed. Fleet re-optimized.`, 'info');
      }
    } catch (err) {
      console.error('Delete order error:', err);
    }
  }

  async deleteIncident(incidentId) {
    try {
      const res = await fetch(`/api/incidents/${incidentId}?auto_optimize=true`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (data.success) {
        this.state.environment.incidents = this.state.environment.incidents.filter(i => i.id !== incidentId);
        this.state.latest_solution = data.latest_solution;
        this.render();
        this.showToast('Roadblock cleared. Routes re-calculated.', 'success');
      }
    } catch (err) {
      console.error('Delete incident error:', err);
    }
  }

  async quickRandomOrder() {
    const baseLat = 37.7750;
    const baseLng = -122.4250;
    const lat = baseLat + (Math.random() - 0.5) * 0.055;
    const lng = baseLng + (Math.random() - 0.5) * 0.075;

    const sampleNames = [
      'Dolores Park Cafe Supplies', 'Castro Floral Boutique', 'Embarcadero Pier Goods',
      'Chinatown Wholesale Market', 'Haight-Ashbury Books & Media', 'Union Square Fashion',
      'Civic Center Legal Office', 'Fisherman\'s Wharf Seafood Co.'
    ];
    const customer = sampleNames[Math.floor(Math.random() * sampleNames.length)];
    const demand = Math.floor(Math.random() * 6) * 10 + 15;

    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_name: customer,
          location: { lat: parseFloat(lat.toFixed(5)), lng: parseFloat(lng.toFixed(5)), name: customer },
          demand: demand,
          time_window_start: 30,
          time_window_end: 240,
          service_time: 10,
          priority: 2,
          auto_optimize: true
        })
      });
      const data = await res.json();
      if (data.success) {
        this.state.orders.push(data.order);
        this.state.latest_solution = data.latest_solution;
        this.render();
        this.showToast(`Dropped: ${customer} (${demand}kg)`, 'success');
      }
    } catch (err) {
      console.error('Quick drop error:', err);
    }
  }

  toggleIncidentMode() {
    this.map.incidentPlacementMode = !this.map.incidentPlacementMode;
    const btnText = document.getElementById('incidentModeText');
    if (this.map.incidentPlacementMode) {
      btnText.innerText = 'Click Map to Place!';
      btnText.parentElement.classList.add('btn-danger');
      btnText.parentElement.classList.remove('btn-secondary');
      this.showToast('Incident Mode: Click anywhere on the map to drop a roadblock hazard', 'warning');
    } else {
      btnText.innerText = 'Drop Roadblock';
      btnText.parentElement.classList.remove('btn-danger');
      btnText.parentElement.classList.add('btn-secondary');
    }
  }

  async dropIncidentAt(lat, lng) {
    this.toggleIncidentMode();
    try {
      const res = await fetch('/api/incidents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lat: lat,
          lng: lng,
          radius_km: 1.2,
          severity: 2.5,
          description: 'Emergency road obstruction / multi-vehicle accident',
          auto_optimize: true
        })
      });
      const data = await res.json();
      if (data.success) {
        this.state.environment.incidents.push(data.incident);
        this.state.latest_solution = data.latest_solution;
        this.render();
        this.showToast('Roadblock hazard placed! Fleet re-routed away from bottleneck.', 'warning');
      }
    } catch (err) {
      console.error('Drop incident error:', err);
    }
  }

  async resetScenario() {
    try {
      const res = await fetch('/api/reset', { method: 'POST' });
      this.state = await res.json();
      this.render();
      this.showToast('Demonstration preset reset to default SF logistics scenario.', 'info');
    } catch (err) {
      console.error('Reset scenario error:', err);
    }
  }

  async retrainModel() {
    const btn = document.getElementById('btnRetrainModel');
    if (btn) btn.innerText = 'Training... ⏳';
    try {
      const res = await fetch('/api/train-model', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        this.showToast(`XGBoost Model Retrained (R²: ${data.metrics.r2.toFixed(4)}, MAE: ${data.metrics.mae.toFixed(2)}m)`, 'success');
        await this.fetchState();
      }
    } catch (err) {
      this.showToast('Retrain error: ' + err, 'error');
    } finally {
      if (btn) btn.innerText = 'Re-Train XGBoost';
    }
  }

  // --- MODALS ---
  openOrderModal(lat, lng) {
    document.getElementById('orderLat').value = lat;
    document.getElementById('orderLng').value = lng;
    document.getElementById('orderModal').classList.add('open');
  }

  closeOrderModal() {
    document.getElementById('orderModal').classList.remove('open');
  }

  async submitOrderModal() {
    const customer = document.getElementById('orderCustomerName').value || 'New Customer';
    const lat = parseFloat(document.getElementById('orderLat').value);
    const lng = parseFloat(document.getElementById('orderLng').value);
    const demand = parseInt(document.getElementById('orderDemand').value, 10);
    const twStart = parseInt(document.getElementById('orderTwStart').value, 10);
    const twEnd = parseInt(document.getElementById('orderTwEnd').value, 10);
    const priority = parseInt(document.getElementById('orderPriority').value, 10);

    this.closeOrderModal();

    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_name: customer,
          location: { lat, lng, name: customer },
          demand,
          time_window_start: twStart,
          time_window_end: twEnd,
          service_time: 10,
          priority,
          auto_optimize: true
        })
      });
      const data = await res.json();
      if (data.success) {
        this.state.orders.push(data.order);
        this.state.latest_solution = data.latest_solution;
        this.render();
        this.showToast(`Added order: ${customer} (${demand}kg)`, 'success');
      }
    } catch (err) {
      console.error('Submit order error:', err);
    }
  }

  async openCompareModal() {
    const modal = document.getElementById('compareModal');
    modal.classList.add('open');

    try {
      const res = await fetch('/api/compare');
      const data = await res.json();
      const c = data.classical.metrics;
      const h = data.hybrid.metrics;
      const diff = data.comparison;

      document.getElementById('cmpClassicalDist').innerText = `${c.total_distance_km} km`;
      document.getElementById('cmpClassicalDelay').innerText = `+${c.avg_delay_min} min`;
      document.getElementById('cmpClassicalSla').innerText = `${c.sla_success_rate_pct}%`;
      document.getElementById('cmpClassicalLate').innerText = `${c.delayed_stops_count} stops`;

      document.getElementById('cmpHybridDist').innerText = `${h.total_distance_km} km`;
      document.getElementById('cmpHybridDelay').innerText = `+${h.avg_delay_min} min`;
      document.getElementById('cmpHybridSla').innerText = `${h.sla_success_rate_pct}%`;
      document.getElementById('cmpHybridLate').innerText = `${h.delayed_stops_count} stops`;

      document.getElementById('cmpSummaryBanner').innerText = diff.summary;
    } catch (err) {
      console.error('Comparison error:', err);
    }
  }

  closeCompareModal() {
    document.getElementById('compareModal').classList.remove('open');
  }
}

// Global bootstrap
window.addEventListener('DOMContentLoaded', () => {
  window.app = new RouteMindApp();
  window.app.init();
});
