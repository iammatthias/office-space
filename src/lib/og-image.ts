/**
 * Fetches the Open Graph image URL from the API and sets it as the og:image meta tag
 */
export async function setOGImageFromAPI(): Promise<void> {
  try {
    const response = await fetch("https://image-api.office.pure---internet.com/og");

    if (!response.ok) {
      throw new Error(`Failed to fetch OG image: ${response.status} ${response.statusText}`);
    }

    const imageUrl = await response.text();

    // Find existing og:image meta tag or create a new one
    let ogImageMeta = document.querySelector('meta[property="og:image"]');

    if (!ogImageMeta) {
      ogImageMeta = document.createElement("meta");
      ogImageMeta.setAttribute("property", "og:image");
      document.head.appendChild(ogImageMeta);
    }

    // Set the content to the fetched image URL
    ogImageMeta.setAttribute("content", imageUrl.trim());

    console.log("OG image updated successfully:", imageUrl);
  } catch (error) {
    console.error("Failed to set OG image from API:", error);
    // Fallback to the default image if API fails
    const defaultImageUrl =
      "https://cdn.iammatthias.com/ipfs/bafkreietnzvwvgbgqeqgp4ooqpzaqja6jhxn2v6t67ioaqyyzha5pejcye?img-width=1200&img-height=630&img-format=jpg&img-quality=75&img-fit=crop";
    let ogImageMeta = document.querySelector('meta[property="og:image"]');

    if (ogImageMeta) {
      ogImageMeta.setAttribute("content", defaultImageUrl);
    }
  }
}
