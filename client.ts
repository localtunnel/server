import { parseArgs } from "util";

const serverUrl = `ws://localhost:1234?new`;

async function main({ url }: { url: string }) {
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
  },
  allowPositionals: true,
});

if (!values.port) throw "pass --port 3000";
main({ url: `localhost:${values.port}` });
