export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.protocol === "http:" || url.hostname === "www.qarinah.io") {
      url.protocol = "https:";
      url.hostname = "qarinah.io";
      return Response.redirect(url.toString(), 308);
    }
    return env.ASSETS.fetch(request);
  }
};
