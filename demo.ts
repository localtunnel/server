import { serve } from "bun";

const port = 3000;

serve({
  port,
  fetch: async (req) => {
    const url = new URL(req.url);
    console.log(req.method, url.pathname, url.search);

    const bod = await req.text();
    bod && console.log("Body: ", bod);

    const res = new Response(`hello from localhost:${port}`, {
      status: 200,
    });

    return res;
  },
});

console.log(`Serving on port ${port}!`);
