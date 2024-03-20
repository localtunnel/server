import { parseArgs } from "util";

async function main({ url, domain, subdomain }: { url: string; domain?: string, subdomain?: string }) {
  const serverUrl = `ws://${domain || "localhost:1234"}?new${subdomain ? `&subdomain=${subdomain}` : ""}`;
  const socket = new WebSocket(serverUrl);

  socket.addEventListener("message", (event) => {
    const data = JSON.parse(event.data);
    console.log("message:", data);

    if (data.method) {
      fetch(`${url}${data.path}`, {
        method: data.method,
        headers: data.headers,
      })
        .then((res) => res.text())
        .then((res) => {
          socket.send(res);
        });
    }
  });

  socket.addEventListener("open", (event) => {
    console.log("socket ready:", !!(event.target as any).readyState);
    socket.ping();
  });
}

const { values } = parseArgs({
  args: Bun.argv,
  options: {
    port: {
      type: "string",
      required: true,
      short: "p",
    },
    domain: {
      type: "string",
      short: "d",
    },
    subdomain: {
      type: "string",
      short: "s",
    },
  },
  allowPositionals: true,
});

if (!values.port) throw "pass --port 3000";
main({ url: `localhost:${values.port}`, domain: values.domain, subdomain: values.subdomain });
