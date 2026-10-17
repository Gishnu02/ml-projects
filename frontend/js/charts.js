/**
 * RouteMind - Chart.js Visualizations
 */

let featureChartInstance = null;

function initFeatureChart(featureImportances) {
  const ctx = document.getElementById('featureChart');
  if (!ctx) return;

  const labels = Object.keys(featureImportances || {}).map(key => {
    return key
      .replace(/_/g, ' ')
      .replace(/\b\w/g, l => l.toUpperCase());
  });

  const values = Object.values(featureImportances || {}).map(v => (v * 100).toFixed(1));

  if (featureChartInstance) {
    featureChartInstance.destroy();
  }

  featureChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Feature Importance (%)',
        data: values,
        backgroundColor: [
          '#ef4444', // Incident impact
          '#3b82f6', // Base time
          '#f59e0b', // Traffic level
          '#10b981', // Distance
          '#8b5cf6', // Weather
          '#06b6d4', // Precipitation
          '#ec4899', // Time of day
          '#6366f1', // Stop index
          '#14b8a6', // Demand
          '#f97316', // Vehicle type
          '#64748b'  // Temperature
        ],
        borderRadius: 4
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => ` Relative weight: ${ctx.parsed.x}%`
          }
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(255, 255, 255, 0.06)' },
          ticks: { color: '#9ca3af', font: { size: 10 } }
        },
        y: {
          grid: { display: false },
          ticks: { color: '#d1d5db', font: { size: 10 } }
        }
      }
    }
  });
}

function updateFeatureChart(featureImportances) {
  if (!featureChartInstance) {
    initFeatureChart(featureImportances);
    return;
  }
  const labels = Object.keys(featureImportances).map(key => {
    return key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  });
  const values = Object.values(featureImportances).map(v => (v * 100).toFixed(1));

  featureChartInstance.data.labels = labels;
  featureChartInstance.data.datasets[0].data = values;
  featureChartInstance.update();
}
