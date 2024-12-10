export const layout = (content: string) => ` 
<!DOCTYPE html>
<html>
  <head>
    <title>office---space.com</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="description" content="office---space.com">
    <meta name="author" content="Matthias Jordan">
    <meta name="robots" content="noindex, nofollow">
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/date-fns@2.29.3/index.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/chartjs-adapter-date-fns"></script>
    <script src="https://cdn.jsdelivr.net/npm/hammerjs@2.0.8"></script>
    <script src="https://cdn.jsdelivr.net/npm/chartjs-plugin-zoom@2.2.0"></script>

    <style>
      :root {
        color-scheme: light dark;
      }

      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      }
      
      body { 
        margin: 0;
        padding: 2rem;
        font-family: monospace;
        line-height: 1.5;
        color: light-dark(#2a2a2a, #f0f0f0);
        background: light-dark(#f0f0f0, #1a1a1a);
        display: flex;
        flex-direction: column;
        gap: 1rem;
      }

      body > *:not(.grid, .dataset-container, .historical-chart-container) {
        max-width: 800px;
      }

     .dataset-container { 
        flex-direction: column;
        gap: 1rem;
      }

      .historical-chart-container {
        border-top: 1px solid light-dark(#2a2a2a, #f0f0f0);
        padding-top: 1rem;
      }

      ul {
        margin: 0;
        padding: 0 0 0 1rem;
      }

      .card {
        padding: 1rem;
        border: 1px solid light-dark(#2a2a2a, #f0f0f0);
      }

      .card-title {
        font-weight: bold;
        vertical-align: baseline;
      }

      .chart-wrapper {
        position: relative;
        height: 300px;
        width: 100%;
      }

      .sensor-section {
        display: flex;
        flex-direction: column;
        gap: 1rem;
      }

      .sensor-header {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
      }

      .sensor-info {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
      }

      .grid {
        display: grid;
        grid-template-columns: repeat(5, 1fr);
        gap: 1rem;
      }

      @media (max-width: 900px) {
        .grid {
          grid-template-columns: repeat(4, 1fr);
        }
      }

      @media (max-width: 700px) {
        .grid {
          grid-template-columns: repeat(3, 1fr);
        }
      }

      @media (max-width: 500px) {
        .grid {
          grid-template-columns: repeat(2, 1fr);
        }
      }

      @media (max-width: 400px) {
        body {
          padding: 1rem;
        }

        .grid {
          grid-template-columns: 1fr;
        }

        
      }

      /* Chart.js styles */
      .content-section {
        margin: 0;
        padding: 1rem;
        border-radius: 0.5rem;
        background: var(--background);
      }
      .content-section h2 {
        margin-bottom: 1rem;
      }
      .charts-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
        gap: 1rem;
        padding: 1rem;
      }
      .metric-chart {
        background: var(--background-light);
        padding: 1rem;
        border-radius: 0.5rem;
        box-shadow: 0 1px 3px rgba(0,0,0,0.1);
      }
      .metric-chart h3 {
        margin-bottom: 0.5rem;
      }
      .time-range {
        margin: 0;
        padding: 0.5rem;
        background: var(--background-light);
        border-radius: 0.25rem;
      }

      .dataset-toggle {
        display: flex;
        gap: 1rem;
        margin: 1rem 0;
      }

      .toggle-option input[type="radio"] {
        display: none;
      }
        
      .toggle-option label {
        padding: 0.5rem 1rem;
        border-radius: 0.25rem;
        cursor: pointer;
        transition: all 0.2s;
        outline: 1px solid light-dark(#2a2a2a, #f0f0f0);
      }
      
      .toggle-option input[type="radio"]:checked + label {
        color: light-dark(#f0f0f0, #1a1a1a);
        background: light-dark(#2a2a2a, #f0f0f0);
      }

      .reset-zoom-btn {
        color: light-dark(#f0f0f0, #1a1a1a);
        background: light-dark(#2a2a2a, #f0f0f0);
        padding: 0.5rem 1rem;
        border-radius: 0.25rem;
        cursor: pointer;
        transition: all 0.2s;
      }

      .sensor-groups {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 1rem;
      }
      .sensor-group {
        padding: 1rem;
        border: 1px solid light-dark(#2a2a2a, #f0f0f0);
      }
    </style>
  </head>
  <body>${content}</body>
</html>
`;
