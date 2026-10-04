/* Cloudflare Pages Function voor de voorpagina (/).
   WhatsApp en andere apps eisen een VOLLEDIG webadres voor de deelafbeelding (https://...).
   Deze functie vult dat in met het adres waarop de site draait, zodat het ook werkt na een domeinwissel.
   Gaat er iets mis, dan krijgt de bezoeker gewoon de normale pagina. */
export async function onRequest(context) {
  const res = await context.next();
  try {
    if (!(res.headers.get("content-type") || "").includes("text/html")) return res;
    const origin = new URL(context.request.url).origin;
    const absolute = (el) => {
      const v = el.getAttribute("content");
      if (v && !/^https?:\/\//i.test(v)) el.setAttribute("content", new URL(v, `${origin}/`).href);
    };
    return new HTMLRewriter()
      .on('meta[property="og:image"]', { element: absolute })
      .on('meta[name="twitter:image"]', { element: absolute })
      .on('meta[property="og:url"]', { element: absolute })
      .transform(res);
  } catch {
    return res;
  }
}
