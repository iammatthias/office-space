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
        max-width: 800px;
        margin: 0;
        padding: 2rem;
        font-family: monospace;
        line-height: 1.5;
        display: flex;
        flex-direction: column;
        gap: 1rem;
        color: light-dark(#2a2a2a, #f0f0f0);
        background: light-dark(#f0f0f0, #1a1a1a);
      }

      p, ul, ol {
        max-width: 600px;
      }

      a {
        color: light-dark(blue, pink);
        word-break: break-all;
      }

      a:hover {
        color: light-dark(blue, pink);
      }

      a:visited {
        color: light-dark(purple, orange);
      }

      ul, ol {
        padding-left: 1rem;
        display: flex;
        flex-direction: column;
        gap: 1rem;
      }

      .grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 1rem;
      }

      .card {
        padding: 1rem;
        border: 1px solid light-dark(#2a2a2a, #f0f0f0);
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
      }

      .card-title {
        display: flex;
        align-items: center;
        gap: 0.5rem;
      }

      h2, h3 {
        margin-top: 0.5rem;
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
        body {
          padding: 1rem;
        }
      }
    </style>
  </head>
  <body>${content}</body>
  <script>
    document.querySelectorAll('.timestamp').forEach(el => {
      el.textContent = new Date(parseInt(el.dataset.time)).toLocaleString();
    });
  </script>
</html>
`;
