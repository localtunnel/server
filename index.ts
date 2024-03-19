import "localenv";
import optimist from "optimist";
import Debug from "debug";
import { CreateServer } from "./server";
import { type AddressInfo } from "ws";

const debug = Debug("localtunnel");

const argv = optimist
  .usage("Usage: $0 --port [num]")
  .options("secure", {
    default: false,
    describe: "use this flag to indicate proxy over https",
  })
  .options("port", {
    default: "80",
    describe: "listen on this port for outside requests",
  })
  .options("address", {
    default: "0.0.0.0",
    describe: "IP address to bind to",
  })
  .options("domain", {
    describe:
      "Specify the base domain name. This is optional if hosting localtunnel from a regular example.com domain. This is required if hosting a localtunnel server from a subdomain (i.e. lt.example.dom where clients will be client-app.lt.example.come)",
  })
  .options("max-sockets", {
    default: 10,
    describe:
      "maximum number of tcp sockets each client is allowed to establish at one time (the tunnels)",
  }).argv;

if (argv.help) {
  console.log("Showing help");
  optimist.showHelp();
  process.exit();
}

const server = CreateServer({
  max_tcp_sockets: argv["max-sockets"],
  secure: argv.secure,
  domain: argv.domain,
});

server.listen(argv.port, argv.address, () => {
  debug("server listening on port: %d", (server.address() as AddressInfo).port);
});

process.on("SIGINT", () => {
  console.error("SIGINT");
  process.exit();
});

process.on("SIGTERM", () => {
  console.warn("SIGTERM");
  // process.exit();
});

process.on("uncaughtException", (err) => {
  console.error("err:");
  console.error(err);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("reason:");
  console.error(reason);
});
