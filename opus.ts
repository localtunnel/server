import { serve, type Socket } from "bun";
import { uid, parseResponse, wait } from "./utils";

const clientSockets = new Map<string, Socket>();
const clientData = new Map<string, any>();

const port = Bun.env.PORT || 1234;
const protocol = Bun.env.PROTOCOL || "http";

serve({
  port,
  fetch: async (req: Request) => {
    const url = new URL(req.url);
    const hostname = `${url.hostname}${url.port && `:${url.port}`}`;

    // For healthchecks
    if (url.pathname === "/healthz") return new Response("healthy");

    if (url.searchParams.has("new")) {
      const clientId = uid();

      const server = Bun.listen({
        hostname: "localhost",
        port: 0, // Let the OS assign an available port
        socket: {
          data(_socket, data) {
            clientData.set(clientId, data);
          },
          open(socket) {
            console.log(`Client ${clientId} connected`);
            clientSockets.set(clientId, socket);
          },
          close() {
            console.log(`Client ${clientId} reconnecting`);
            clientSockets.delete(clientId);
            clientData.delete(clientId);
          },
          error(_socket, error) {
            console.error(`Error for client ${clientId}:`, error);
          },
        },
      });

      return new Response(
        JSON.stringify({
          id: clientId,
          port: server.port,
          url: `${protocol}://${clientId}.${hostname}`,
        }),
        {
          headers: { "Content-Type": "application/json" },
          status: 200,
        }
      );
    }

    if (hostname.split(".").length === 3) {
      return new Response("welcome to tunnel. hit ?new to get a URL.");
    }

    const subdomain = hostname.split(".")[0];
    const clientSocket = clientSockets.get(subdomain);

    if (!clientSocket) {
      console.warn(`Client ${subdomain} not found`);
      return new Response("Client not found", { status: 404 });
    }

    console.log(`Forwarding request to client ${subdomain}`);

    // Forward the request to the connected client
    console.log(req.method, url.pathname, url.search);
    clientSocket.write(
      `${req.method} ${url.pathname}${url.search} HTTP/1.1\r\n`
    );
    for (const [header, value] of req.headers.entries()) {
      clientSocket.write(`${header}: ${value}\r\n`);
    }
    clientSocket.write("\r\n");

    if (req.body) {
      const reader = req.body.getReader();
      let chunk;
      while (!(chunk = await reader.read()).done) {
        clientSocket.write(chunk.value);
      }
    }

    let responseData = clientData.get(subdomain);
    let attempts = 10;

    while (!responseData) {
      await wait(100);
      responseData = clientData.get(subdomain);
      if (attempts < 1) {
        return new Response("Client did not respond", { status: 504 });
      }
    }

    const { body, headers } = parseResponse(responseData);

    return new Response(body, { headers, status: 200 });
  },
  error(error) {
    console.error(error);
    return new Response(error.message, { status: 500 });
  },
});

console.log(`Listening on port ${port}`);
