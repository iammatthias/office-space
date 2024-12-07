export const layout = (content: string) => ` 
<!DOCTYPE html>
<html>
  <head>
    <title>office---space.com</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="description" content="office---space.com">
    <meta name="author" content="Matthias Jordan">
    <meta name="robots" content="noindex, nofollow">
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
        display: flex;
        flex-direction: column;
        gap: 2rem;
        color: light-dark(#2a2a2a, #f0f0f0);
        background: light-dark(#f0f0f0, #1a1a1a);
      }

      body > *:not(.grid, .sensor-section) {
        max-width: 800px;
      }

      .card {
        padding: 1rem;
        border: 1px solid light-dark(#2a2a2a, #f0f0f0);
      }

      .card-title {
        margin-bottom: 1rem;
        font-weight: bold;
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
        grid-template-columns: repeat(3, 1fr);
        gap: 1rem;
      }

      @media (max-width: 900px) {
        .grid {
          grid-template-columns: repeat(2, 1fr);
        }
      }

      @media (max-width: 600px) {
        body {
          padding: 1rem;
        }

        .grid {
          grid-template-columns: 1fr;
        }

        .chart-wrapper {
          height: 200px;
        }
      }
    </style>
  </head>
  <body>${content}</body>
</html>
`;
