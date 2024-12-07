const cardStyles = `
  .card {
    padding: .5rem;
    border: 1px solid light-dark(#2a2a2a, #f0f0f0);
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 1rem;
  }

  .card-icon {
    line-height: 1;
    padding-top: 0.25rem;
  }

  .card-body {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .card-title {
    line-height: 1.3;
  }

  .card-value {
    font-weight: bold;
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
    .grid {
      grid-template-columns: 1fr;
    }
  }
`;

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

      body > *:not(.grid) {
        max-width: 500px;
      }

      ${cardStyles}

      @media (max-width: 600px) {
        body {
          padding: 1rem;
        }
      }
    </style>
  </head>
  <body>${content}</body>
</html>
`;
